import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { getDb } from '../db/connection.js';
import { getTableInfo } from '../db/schema.js';
import { runSegmentation, DEFAULT_THRESHOLDS, SEGMENT_COLORS } from '../segmentation.js';

let WORKSPACES_DIR = path.join(process.cwd(), 'server', 'workspaces');

export function configureDataPaths({ workspacesDir }) {
  WORKSPACES_DIR = workspacesDir;
}

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveWorkspace(workspaceId) {
  if (!workspaceId) return null;
  const file = path.join(WORKSPACES_DIR, `${workspaceId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

/**
 * Return the actual DB column name for a canonical field, or null if not mapped.
 */
function getMappedColumn(mapping, canonicalName) {
  if (!mapping) return null;
  return mapping[canonicalName] || null;
}

/**
 * Parse a date string safely.
 */
function parseDate(val) {
  if (!val || val === '' || val === 'null' || val === 'undefined') return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Days between two dates. Positive means d2 is after d1.
 */
function daysBetween(d1, d2) {
  if (!d1 || !d2) return null;
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Get the value from a member row using the canonical mapping.
 */
function getMappedValue(member, mapping, canonicalName) {
  const col = getMappedColumn(mapping, canonicalName);
  if (!col) return undefined;
  return member[col];
}

/**
 * Build a member object with canonical field names from a raw DB row.
 */
function canonicalizeMember(row, mapping) {
  const result = { id: row.id, _segment: row._segment, _health_score: row._health_score };
  for (const canonical of Object.keys(mapping)) {
    const col = mapping[canonical];
    result[canonical] = col ? (row[col] !== undefined ? row[col] : null) : null;
  }
  // Include any unmapped columns as-is
  for (const key of Object.keys(row)) {
    if (key === 'id' || key === '_segment' || key === '_health_score') continue;
    // Check if this column is already represented via mapping
    const isMapped = Object.values(mapping).includes(key);
    if (!isMapped) {
      result[key] = row[key];
    }
  }
  return result;
}

/**
 * Safely quote a column name for SQL.
 */
function q(col) {
  return `"${col.replace(/"/g, '""')}"`;
}

// ---------------------------------------------------------------------------
// GET /api/data/summary
// ---------------------------------------------------------------------------
router.get('/summary', (req, res) => {
  const ws = resolveWorkspace(req.query.workspace);
  if (!ws) return res.json({ totalMembers: 0, segmentCounts: {}, avgHealthScore: 0, firstUseRate: 0, ghostPercentage: 0 });

  try {
    const db = getDb(ws.dbFile);
    const mapping = ws.columnMapping || {};

    const totalRow = db.prepare('SELECT COUNT(*) as count FROM members').get();
    const totalMembers = totalRow.count;

    if (totalMembers === 0) {
      return res.json({ totalMembers: 0, segmentCounts: {}, avgHealthScore: 0, firstUseRate: 0, ghostPercentage: 0 });
    }

    // Segment counts
    const segRows = db.prepare('SELECT "_segment" as segment, COUNT(*) as count FROM members GROUP BY "_segment"').all();
    const segmentCounts = {};
    for (const r of segRows) {
      segmentCounts[r.segment] = r.count;
    }

    // Average health score
    const avgRow = db.prepare('SELECT AVG("_health_score") as avg FROM members').get();
    const avgHealthScore = Math.round(avgRow.avg || 0);

    // First use rate: % of members whose first visit was within 14 days of purchase_date
    let firstUseRate = 0;
    const purchaseCol = getMappedColumn(mapping, 'purchase_date');
    const lastVisitCol = getMappedColumn(mapping, 'last_visit_date');
    const visitsCol = getMappedColumn(mapping, 'total_visits');

    if (purchaseCol && lastVisitCol && visitsCol) {
      // Members who had at least 1 visit and whose last_visit (proxy for first visit when visits=1)
      // or purchase_date is within 14 days. We use a JS approach for accuracy.
      const all = db.prepare('SELECT * FROM members').all();
      let firstUseCount = 0;
      for (const m of all) {
        const visits = parseInt(m[visitsCol] || '0', 10) || 0;
        if (visits === 0) continue;
        const purchase = parseDate(m[purchaseCol]);
        const lastVisit = parseDate(m[lastVisitCol]);
        if (!purchase || !lastVisit) continue;
        // Approximate: if they have visits, check if purchase and last_visit gap
        // suggests early engagement. For members with 1 visit, last_visit IS first visit.
        // For members with many visits, we assume first visit happened early if they are active.
        // Better heuristic: if total_visits > 0 and (last_visit - purchase) / total_visits * 1
        // gives approximate first visit offset. But simplest: assume first visit was within
        // (last_visit - purchase) / total_visits days of purchase.
        const totalDays = daysBetween(purchase, lastVisit);
        if (totalDays === null) continue;
        const avgGap = visits > 1 ? totalDays / (visits - 1) : totalDays;
        // Estimate first visit: if 1 visit, it happened on last_visit_date
        // If multiple visits, approximate first visit as purchase + avgGap (or sooner)
        const estimatedFirstVisitDays = visits === 1 ? totalDays : Math.min(totalDays, Math.max(0, avgGap * 0.5));
        if (estimatedFirstVisitDays <= 14) {
          firstUseCount++;
        }
      }
      firstUseRate = Math.round((firstUseCount / totalMembers) * 100 * 10) / 10;
    }

    // Ghost percentage
    const ghostCount = segmentCounts.ghost || 0;
    const ghostPercentage = Math.round((ghostCount / totalMembers) * 100 * 10) / 10;

    res.json({ totalMembers, segmentCounts, avgHealthScore, firstUseRate, ghostPercentage });
  } catch (err) {
    console.error('Summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/data/segments
// ---------------------------------------------------------------------------
router.get('/segments', (req, res) => {
  const ws = resolveWorkspace(req.query.workspace);
  if (!ws) return res.json([]);

  try {
    const db = getDb(ws.dbFile);
    const totalRow = db.prepare('SELECT COUNT(*) as count FROM members').get();
    const total = totalRow.count;

    if (total === 0) return res.json([]);

    const rows = db.prepare(
      'SELECT "_segment" as segment, COUNT(*) as count, AVG("_health_score") as avgHealth FROM members GROUP BY "_segment" ORDER BY count DESC'
    ).all();

    const result = rows.map((r) => ({
      segment: r.segment,
      count: r.count,
      percentage: Math.round((r.count / total) * 100 * 10) / 10,
      avgHealthScore: Math.round(r.avgHealth || 0),
      color: SEGMENT_COLORS[r.segment] || '#6B7280',
    }));

    res.json(result);
  } catch (err) {
    console.error('Segments error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/data/members
// ---------------------------------------------------------------------------
router.get('/members', (req, res) => {
  const ws = resolveWorkspace(req.query.workspace);
  if (!ws) return res.json({ members: [], total: 0, page: 1, pages: 0 });

  try {
    const db = getDb(ws.dbFile);
    const mapping = ws.columnMapping || {};

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    // Build WHERE clauses
    const conditions = [];
    const params = [];

    // Filter by segment (comma-separated)
    if (req.query.segment) {
      const segments = req.query.segment.split(',').map((s) => s.trim()).filter(Boolean);
      if (segments.length > 0) {
        conditions.push(`"_segment" IN (${segments.map(() => '?').join(',')})`);
        params.push(...segments);
      }
    }

    // Filter by market (comma-separated)
    const marketCol = getMappedColumn(mapping, 'market');
    if (req.query.market && marketCol) {
      const markets = req.query.market.split(',').map((s) => s.trim()).filter(Boolean);
      if (markets.length > 0) {
        conditions.push(`${q(marketCol)} IN (${markets.map(() => '?').join(',')})`);
        params.push(...markets);
      }
    }

    // Filter by health score range
    if (req.query.minHealth) {
      conditions.push('"_health_score" >= ?');
      params.push(parseInt(req.query.minHealth));
    }
    if (req.query.maxHealth) {
      conditions.push('"_health_score" <= ?');
      params.push(parseInt(req.query.maxHealth));
    }

    // Filter by channel
    const channelCol = getMappedColumn(mapping, 'acquisition_channel');
    if (req.query.channel && channelCol) {
      conditions.push(`${q(channelCol)} = ?`);
      params.push(req.query.channel);
    }

    // Text search (name or email)
    if (req.query.search) {
      const term = `%${req.query.search}%`;
      const searchParts = [];
      const fnameCol = getMappedColumn(mapping, 'first_name');
      const lnameCol = getMappedColumn(mapping, 'last_name');
      const emailCol = getMappedColumn(mapping, 'email');

      if (fnameCol) { searchParts.push(`${q(fnameCol)} LIKE ?`); params.push(term); }
      if (lnameCol) { searchParts.push(`${q(lnameCol)} LIKE ?`); params.push(term); }
      if (emailCol) { searchParts.push(`${q(emailCol)} LIKE ?`); params.push(term); }

      if (searchParts.length > 0) {
        conditions.push(`(${searchParts.join(' OR ')})`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Sorting
    let orderClause = 'ORDER BY id ASC';
    if (req.query.sort) {
      const sortField = req.query.sort;
      const order = (req.query.order || 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

      // Resolve the actual column name
      let sortCol = null;
      if (sortField === '_segment' || sortField === '_health_score' || sortField === 'id') {
        sortCol = sortField;
      } else {
        sortCol = getMappedColumn(mapping, sortField);
      }

      if (sortCol) {
        orderClause = `ORDER BY ${q(sortCol)} ${order}`;
      }
    }

    // Count
    const countParams = [...params];
    const countSql = `SELECT COUNT(*) as count FROM members ${whereClause}`;
    const totalRow = db.prepare(countSql).get(...countParams);
    const total = totalRow.count;
    const pages = Math.ceil(total / limit);

    // Fetch
    const dataSql = `SELECT * FROM members ${whereClause} ${orderClause} LIMIT ? OFFSET ?`;
    const dataParams = [...params, limit, offset];
    const rows = db.prepare(dataSql).all(...dataParams);

    const members = rows.map((row) => canonicalizeMember(row, mapping));

    res.json({ members, total, page, pages });
  } catch (err) {
    console.error('Members error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/data/members/:id
// ---------------------------------------------------------------------------
router.get('/members/:id', (req, res) => {
  const ws = resolveWorkspace(req.query.workspace);
  if (!ws) return res.status(404).json({ error: 'No active workspace' });

  try {
    const db = getDb(ws.dbFile);
    const mapping = ws.columnMapping || {};
    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    res.json(canonicalizeMember(member, mapping));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/data/migration
// ---------------------------------------------------------------------------
router.get('/migration', (req, res) => {
  res.json({
    message: 'Migration tracking requires historical snapshots. This will be populated as segmentation runs over time.',
    data: [],
  });
});

// ---------------------------------------------------------------------------
// GET /api/data/metrics
// ---------------------------------------------------------------------------
router.get('/metrics', (req, res) => {
  const ws = resolveWorkspace(req.query.workspace);
  if (!ws) return res.json({ data: [] });

  const type = req.query.type;
  const db = getDb(ws.dbFile);
  const mapping = ws.columnMapping || {};

  try {
    switch (type) {
      case 'funnel':
        return handleFunnel(db, mapping, res);
      case 'health_distribution':
        return handleHealthDistribution(db, res);
      case 'market_comparison':
        return handleMarketComparison(db, mapping, res);
      case 'activity_timeline':
        return handleActivityTimeline(db, mapping, res);
      case 'channel_breakdown':
        return handleChannelBreakdown(db, mapping, res);
      default:
        return res.status(400).json({ error: `Unknown metric type: ${type}` });
    }
  } catch (err) {
    console.error('Metrics error:', err);
    res.status(500).json({ error: err.message });
  }
});

function handleFunnel(db, mapping, res) {
  const totalRow = db.prepare('SELECT COUNT(*) as count FROM members').get();
  const total = totalRow.count;
  if (total === 0) return res.json({ stages: [] });

  const all = db.prepare('SELECT * FROM members').all();
  const purchaseCol = getMappedColumn(mapping, 'purchase_date');
  const lastVisitCol = getMappedColumn(mapping, 'last_visit_date');
  const visitsCol = getMappedColumn(mapping, 'total_visits');
  const renewalCol = getMappedColumn(mapping, 'renewal_date');
  const now = new Date();

  // Stage 2: First visit within 14 days
  let firstVisitCount = 0;
  if (purchaseCol && lastVisitCol && visitsCol) {
    for (const m of all) {
      const visits = parseInt(m[visitsCol] || '0', 10) || 0;
      if (visits === 0) continue;
      const purchase = parseDate(m[purchaseCol]);
      const lastVisit = parseDate(m[lastVisitCol]);
      if (!purchase || !lastVisit) continue;
      const totalDays = daysBetween(purchase, lastVisit);
      if (totalDays === null) continue;
      const estimatedFirst = visits === 1 ? totalDays : Math.min(totalDays, Math.max(0, (totalDays / Math.max(1, visits - 1)) * 0.5));
      if (estimatedFirst <= 14) firstVisitCount++;
    }
  }

  // Stage 3: Reached 4+ visits
  let fourPlusCount = 0;
  if (visitsCol) {
    for (const m of all) {
      if ((parseInt(m[visitsCol] || '0', 10) || 0) >= 4) fourPlusCount++;
    }
  }

  // Stage 4: Approaching renewal (within 90 days)
  let approachingRenewal = 0;
  if (renewalCol) {
    for (const m of all) {
      const renewal = parseDate(m[renewalCol]);
      if (!renewal) continue;
      const days = daysBetween(now, renewal);
      if (days !== null && days >= 0 && days <= 90) approachingRenewal++;
    }
  } else if (purchaseCol) {
    // Estimate renewal as purchase_date + 1 year
    for (const m of all) {
      const purchase = parseDate(m[purchaseCol]);
      if (!purchase) continue;
      const estimatedRenewal = new Date(purchase);
      estimatedRenewal.setFullYear(estimatedRenewal.getFullYear() + 1);
      const days = daysBetween(now, estimatedRenewal);
      if (days !== null && days >= 0 && days <= 90) approachingRenewal++;
    }
  }

  const stages = [
    { name: 'Total Members', count: total, conversionRate: 100 },
    { name: 'First Visit Within 14 Days', count: firstVisitCount, conversionRate: total > 0 ? Math.round((firstVisitCount / total) * 100 * 10) / 10 : 0 },
    { name: 'Reached 4+ Visits', count: fourPlusCount, conversionRate: total > 0 ? Math.round((fourPlusCount / total) * 100 * 10) / 10 : 0 },
    { name: 'Approaching Renewal', count: approachingRenewal, conversionRate: total > 0 ? Math.round((approachingRenewal / total) * 100 * 10) / 10 : 0 },
  ];

  res.json({ stages });
}

function handleHealthDistribution(db, res) {
  const rows = db.prepare('SELECT "_health_score" as score FROM members WHERE "_health_score" IS NOT NULL ORDER BY "_health_score"').all();

  if (rows.length === 0) {
    return res.json({ bins: [], mean: 0, median: 0 });
  }

  const scores = rows.map((r) => r.score);
  const bins = [];
  for (let i = 0; i < 10; i++) {
    const low = i * 10;
    const high = i * 10 + 10;
    const label = `${low}-${high === 10 ? 10 : high}`;
    const range = i === 9 ? `91-100` : `${low + (i === 0 ? 0 : 1)}-${high}`;
    const count = scores.filter((s) => {
      if (i === 0) return s >= 0 && s <= 10;
      if (i === 9) return s >= 91 && s <= 100;
      return s >= i * 10 + 1 && s <= (i + 1) * 10;
    }).length;
    bins.push({ range: i === 0 ? '0-10' : `${i * 10 + 1}-${(i + 1) * 10}`, count });
  }

  const sum = scores.reduce((a, b) => a + b, 0);
  const mean = Math.round(sum / scores.length);
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];

  res.json({ bins, mean, median });
}

function handleMarketComparison(db, mapping, res) {
  const marketCol = getMappedColumn(mapping, 'market');
  if (!marketCol) return res.json([]);

  const visitsCol = getMappedColumn(mapping, 'total_visits');
  const purchaseCol = getMappedColumn(mapping, 'purchase_date');
  const lastVisitCol = getMappedColumn(mapping, 'last_visit_date');

  const all = db.prepare('SELECT * FROM members').all();
  const byMarket = {};

  for (const m of all) {
    const market = m[marketCol] || 'Unknown';
    if (!byMarket[market]) {
      byMarket[market] = { members: [], ghostCount: 0, healthSum: 0, firstUseCount: 0 };
    }
    byMarket[market].members.push(m);
    if (m._segment === 'ghost') byMarket[market].ghostCount++;
    byMarket[market].healthSum += (m._health_score || 0);

    // First use rate calc
    if (visitsCol && purchaseCol && lastVisitCol) {
      const visits = parseInt(m[visitsCol] || '0', 10) || 0;
      if (visits > 0) {
        const purchase = parseDate(m[purchaseCol]);
        const lastVisit = parseDate(m[lastVisitCol]);
        if (purchase && lastVisit) {
          const totalDays = daysBetween(purchase, lastVisit);
          if (totalDays !== null) {
            const estFirst = visits === 1 ? totalDays : Math.min(totalDays, Math.max(0, (totalDays / Math.max(1, visits - 1)) * 0.5));
            if (estFirst <= 14) byMarket[market].firstUseCount++;
          }
        }
      }
    }
  }

  const result = Object.entries(byMarket).map(([market, data]) => {
    const total = data.members.length;
    return {
      market,
      totalMembers: total,
      ghostPercent: total > 0 ? Math.round((data.ghostCount / total) * 100 * 10) / 10 : 0,
      avgHealthScore: total > 0 ? Math.round(data.healthSum / total) : 0,
      firstUseRate: total > 0 ? Math.round((data.firstUseCount / total) * 100 * 10) / 10 : 0,
    };
  });

  res.json(result);
}

function handleActivityTimeline(db, mapping, res) {
  const lastVisitCol = getMappedColumn(mapping, 'last_visit_date');
  const visitsCol = getMappedColumn(mapping, 'total_visits');

  if (!lastVisitCol) return res.json([]);

  // Group by month based on last_visit_date, using visits count
  const all = db.prepare('SELECT * FROM members').all();
  const byMonth = {};

  for (const m of all) {
    const dateStr = m[lastVisitCol];
    const d = parseDate(dateStr);
    if (!d) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const visits = visitsCol ? (parseInt(m[visitsCol] || '0', 10) || 0) : 1;
    byMonth[key] = (byMonth[key] || 0) + visits;
  }

  const result = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, visits]) => ({ date, visits }));

  res.json(result);
}

function handleChannelBreakdown(db, mapping, res) {
  const channelCol = getMappedColumn(mapping, 'acquisition_channel');
  if (!channelCol) return res.json([]);

  const visitsCol = getMappedColumn(mapping, 'total_visits');
  const all = db.prepare('SELECT * FROM members').all();
  const byChannel = {};

  for (const m of all) {
    const channel = m[channelCol] || 'Unknown';
    if (!byChannel[channel]) {
      byChannel[channel] = { count: 0, visitsSum: 0, healthSum: 0, ghostCount: 0 };
    }
    byChannel[channel].count++;
    byChannel[channel].visitsSum += visitsCol ? (parseInt(m[visitsCol] || '0', 10) || 0) : 0;
    byChannel[channel].healthSum += (m._health_score || 0);
    if (m._segment === 'ghost') byChannel[channel].ghostCount++;
  }

  const result = Object.entries(byChannel).map(([channel, data]) => ({
    channel,
    memberCount: data.count,
    avgVisits: data.count > 0 ? Math.round((data.visitsSum / data.count) * 10) / 10 : 0,
    avgHealthScore: data.count > 0 ? Math.round(data.healthSum / data.count) : 0,
    ghostPercent: data.count > 0 ? Math.round((data.ghostCount / data.count) * 100 * 10) / 10 : 0,
  }));

  res.json(result);
}

// ---------------------------------------------------------------------------
// GET /api/data/interventions
// ---------------------------------------------------------------------------
router.get('/interventions', (req, res) => {
  const ws = resolveWorkspace(req.query.workspace);
  if (!ws) return res.json([]);

  try {
    const db = getDb(ws.dbFile);
    const mapping = ws.columnMapping || {};
    const all = db.prepare('SELECT * FROM members').all();
    const now = new Date();
    const interventions = [];

    const visitsCol = getMappedColumn(mapping, 'total_visits');
    const purchaseCol = getMappedColumn(mapping, 'purchase_date');
    const lastVisitCol = getMappedColumn(mapping, 'last_visit_date');
    const renewalCol = getMappedColumn(mapping, 'renewal_date');
    const fnameCol = getMappedColumn(mapping, 'first_name');
    const lnameCol = getMappedColumn(mapping, 'last_name');
    const marketCol = getMappedColumn(mapping, 'market');
    const memberIdCol = getMappedColumn(mapping, 'member_id');

    for (const m of all) {
      const segment = m._segment;
      const healthScore = m._health_score;
      const visits = visitsCol ? (parseInt(m[visitsCol] || '0', 10) || 0) : 0;
      const purchaseDate = purchaseCol ? parseDate(m[purchaseCol]) : null;
      const lastVisitDate = lastVisitCol ? parseDate(m[lastVisitCol]) : null;
      const renewalDate = renewalCol ? parseDate(m[renewalCol]) : null;
      const daysSincePurchase = daysBetween(purchaseDate, now);
      const daysSinceLastVisit = daysBetween(lastVisitDate, now);

      // Estimate renewal if not mapped
      let estRenewal = renewalDate;
      if (!estRenewal && purchaseDate) {
        estRenewal = new Date(purchaseDate);
        estRenewal.setFullYear(estRenewal.getFullYear() + 1);
      }
      const daysUntilRenewal = estRenewal ? daysBetween(now, estRenewal) : null;

      const name = [
        fnameCol ? m[fnameCol] : '',
        lnameCol ? m[lnameCol] : '',
      ].filter(Boolean).join(' ') || `Member ${m.id}`;

      const memberId = memberIdCol ? m[memberIdCol] : m.id;
      const market = marketCol ? (m[marketCol] || null) : null;

      let triggerReason = null;
      let recommendedAction = null;

      if (segment === 'ghost' && daysSincePurchase !== null && daysSincePurchase >= 30 && visits === 0) {
        triggerReason = '30+ days since purchase, 0 visits';
        recommendedAction = 'Trigger First Use Fast campaign';
      } else if (segment === 'one_and_done' && daysSinceLastVisit !== null && daysSinceLastVisit >= 45 && visits === 1) {
        triggerReason = '45+ days since last visit, 1 visit';
        recommendedAction = 'Send personalized follow-up';
      } else if (segment === 'approaching_threshold' && daysUntilRenewal !== null && daysUntilRenewal <= 60 && visits >= 2 && visits <= 3) {
        triggerReason = '60 or fewer days until renewal, 2-3 visits';
        recommendedAction = 'Nudge toward 4th visit';
      } else if (segment === 'in_the_zone' && daysUntilRenewal !== null && daysUntilRenewal <= 60) {
        triggerReason = '60 days before renewal';
        recommendedAction = 'Pre-renewal value recap';
      } else if (segment === 'power_user' && visits >= 10) {
        triggerReason = '10+ visits, highly engaged';
        recommendedAction = 'Activate referral program';
      }

      if (triggerReason) {
        interventions.push({
          memberId,
          name,
          segment,
          triggerReason,
          recommendedAction,
          status: 'pending',
          healthScore,
          market,
        });
      }
    }

    res.json(interventions);
  } catch (err) {
    console.error('Interventions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/data/segment  (re-run segmentation)
// ---------------------------------------------------------------------------
router.post('/segment', (req, res) => {
  const ws = resolveWorkspace(req.query.workspace);
  if (!ws) return res.status(404).json({ error: 'Workspace not found' });

  try {
    const db = getDb(ws.dbFile);
    const mapping = ws.columnMapping || {};
    const thresholds = ws.thresholds || DEFAULT_THRESHOLDS;
    const result = runSegmentation(db, mapping, thresholds);

    // Update workspace config with new segmentation results
    ws.segmentation = result;
    const wsFile = path.join(WORKSPACES_DIR, `${ws.id}.json`);
    fs.writeFileSync(wsFile, JSON.stringify(ws, null, 2));

    res.json(result);
  } catch (err) {
    console.error('Segmentation error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
