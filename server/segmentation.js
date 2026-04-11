/**
 * Segmentation Engine
 * Assigns behavioral segments and health scores to members based on
 * visit patterns, recency, and renewal proximity.
 */

export const DEFAULT_THRESHOLDS = {
  ghost: { maxVisits: 0, minDaysSincePurchase: 30 },
  one_and_done: { maxVisits: 1, minDaysSinceLastVisit: 45 },
  approaching_threshold: { minVisits: 2, maxVisits: 3 },
  in_the_zone: { minVisits: 4, maxVisits: 10 },
  power_user: { minVisits: 11 },
};

export const SEGMENT_COLORS = {
  ghost: '#EF4444',
  one_and_done: '#F97316',
  approaching_threshold: '#EAB308',
  in_the_zone: '#22C55E',
  power_user: '#3B82F6',
  new_member: '#8B5CF6',
};

/**
 * Parse a date string safely, returning null on failure.
 */
function parseDate(val) {
  if (!val || val === '' || val === 'null' || val === 'undefined') return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Get the value for a canonical field from a member row using the mapping.
 */
function getMapped(member, mapping, canonicalName) {
  const col = mapping[canonicalName];
  if (!col) return undefined;
  return member[col];
}

/**
 * Calculate days between two dates. Returns null if either date is invalid.
 */
function daysBetween(d1, d2) {
  if (!d1 || !d2) return null;
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Assign a segment to a member based on threshold rules.
 *
 * @param {object} member - A row from the members table
 * @param {Record<string, string>} mapping - Canonical-to-column mapping
 * @param {object} thresholds - Segment thresholds
 * @returns {string} Segment name
 */
export function assignSegment(member, mapping, thresholds = DEFAULT_THRESHOLDS) {
  const totalVisits = parseInt(getMapped(member, mapping, 'total_visits') || '0', 10) || 0;
  const purchaseDateStr = getMapped(member, mapping, 'purchase_date');
  const lastVisitDateStr = getMapped(member, mapping, 'last_visit_date');
  const purchaseDate = parseDate(purchaseDateStr);
  const lastVisitDate = parseDate(lastVisitDateStr);
  const now = new Date();

  const daysSincePurchase = daysBetween(purchaseDate, now);
  const daysSinceLastVisit = daysBetween(lastVisitDate, now);

  // New member: purchased within last 30 days
  if (daysSincePurchase !== null && daysSincePurchase < 30) {
    return 'new_member';
  }

  // Ghost: 0 visits and 30+ days since purchase
  const ghostT = thresholds.ghost;
  if (
    totalVisits <= ghostT.maxVisits &&
    daysSincePurchase !== null &&
    daysSincePurchase >= ghostT.minDaysSincePurchase
  ) {
    return 'ghost';
  }

  // One-and-done: 1 visit and 45+ days since last visit
  const oadT = thresholds.one_and_done;
  if (
    totalVisits <= oadT.maxVisits &&
    totalVisits >= 1 &&
    daysSinceLastVisit !== null &&
    daysSinceLastVisit >= oadT.minDaysSinceLastVisit
  ) {
    return 'one_and_done';
  }

  // Power user: 11+ visits (check before approaching/in_the_zone)
  const puT = thresholds.power_user;
  if (totalVisits >= puT.minVisits) {
    return 'power_user';
  }

  // In the zone: 4-10 visits
  const itzT = thresholds.in_the_zone;
  if (totalVisits >= itzT.minVisits && totalVisits <= itzT.maxVisits) {
    return 'in_the_zone';
  }

  // Approaching threshold: 2-3 visits
  const atT = thresholds.approaching_threshold;
  if (totalVisits >= atT.minVisits && totalVisits <= atT.maxVisits) {
    return 'approaching_threshold';
  }

  // Fallback: if 1 visit but not enough days for one_and_done
  if (totalVisits === 1) {
    return 'one_and_done';
  }

  // Default fallback
  return 'approaching_threshold';
}

/**
 * Calculate a 0-100 health score for a member.
 *
 * Components:
 * - Visit frequency: 0-40 points (based on total visits relative to membership duration)
 * - Recency: 0-30 points (how recently they visited)
 * - Time utilization: 0-20 points (visits per month of membership)
 * - Renewal proximity: 0-10 points (bonus if renewal is approaching and they are active)
 *
 * @param {object} member - A row from the members table
 * @param {Record<string, string>} mapping - Canonical-to-column mapping
 * @returns {number} Health score 0-100
 */
export function calculateHealthScore(member, mapping) {
  const totalVisits = parseInt(getMapped(member, mapping, 'total_visits') || '0', 10) || 0;
  const purchaseDate = parseDate(getMapped(member, mapping, 'purchase_date'));
  const lastVisitDate = parseDate(getMapped(member, mapping, 'last_visit_date'));
  const renewalDate = parseDate(getMapped(member, mapping, 'renewal_date'));
  const now = new Date();

  let score = 0;

  // Visit frequency: 0-40 points
  // Scale: 0 visits = 0, 1 visit = 5, 4 visits = 20, 10+ visits = 40
  const visitScore = Math.min(40, totalVisits * 4);
  score += visitScore;

  // Recency: 0-30 points
  // Based on days since last visit (or purchase if no visits)
  const referenceDate = lastVisitDate || purchaseDate;
  if (referenceDate) {
    const daysSince = daysBetween(referenceDate, now) || 0;
    if (daysSince <= 7) score += 30;
    else if (daysSince <= 14) score += 25;
    else if (daysSince <= 30) score += 20;
    else if (daysSince <= 60) score += 12;
    else if (daysSince <= 90) score += 6;
    else if (daysSince <= 180) score += 2;
    // 180+ days = 0 recency points
  }

  // Time utilization: 0-20 points
  // Visits per month of membership
  if (purchaseDate) {
    const monthsActive = Math.max(1, daysBetween(purchaseDate, now) / 30);
    const visitsPerMonth = totalVisits / monthsActive;
    // 2+ visits/month = max score
    const utilScore = Math.min(20, Math.round(visitsPerMonth * 10));
    score += utilScore;
  }

  // Renewal proximity: 0-10 points
  // Bonus for active members approaching renewal
  if (renewalDate) {
    const daysUntilRenewal = daysBetween(now, renewalDate);
    if (daysUntilRenewal !== null && daysUntilRenewal >= 0 && daysUntilRenewal <= 90) {
      // Active members near renewal get bonus points
      if (totalVisits >= 4) score += 10;
      else if (totalVisits >= 2) score += 5;
      else score += 2;
    }
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

/**
 * Run segmentation on all members in the database.
 * Adds _segment and _health_score columns, then updates every row.
 *
 * @param {import('better-sqlite3').Database} db - Database instance
 * @param {Record<string, string>} mapping - Canonical-to-column mapping
 * @param {object} thresholds - Segment thresholds
 * @returns {{ totalMembers: number, segmentCounts: Record<string, number>, avgHealthScore: number }}
 */
export function runSegmentation(db, mapping, thresholds = DEFAULT_THRESHOLDS) {
  // Ensure _segment and _health_score columns exist
  const tableInfo = db.prepare("PRAGMA table_info('members')").all();
  const existingCols = tableInfo.map((c) => c.name);

  if (!existingCols.includes('_segment')) {
    db.exec('ALTER TABLE members ADD COLUMN "_segment" TEXT');
  }
  if (!existingCols.includes('_health_score')) {
    db.exec('ALTER TABLE members ADD COLUMN "_health_score" INTEGER');
  }

  // Create indexes on new columns
  db.exec('CREATE INDEX IF NOT EXISTS idx_segment ON members("_segment")');
  db.exec('CREATE INDEX IF NOT EXISTS idx_health_score ON members("_health_score")');

  // Read all members
  const members = db.prepare('SELECT * FROM members').all();

  // Update each member
  const update = db.prepare('UPDATE members SET "_segment" = ?, "_health_score" = ? WHERE id = ?');
  const segmentCounts = {};
  let totalHealth = 0;

  const updateAll = db.transaction(() => {
    for (const member of members) {
      const segment = assignSegment(member, mapping, thresholds);
      const healthScore = calculateHealthScore(member, mapping);

      update.run(segment, healthScore, member.id);

      segmentCounts[segment] = (segmentCounts[segment] || 0) + 1;
      totalHealth += healthScore;
    }
  });

  updateAll();

  const totalMembers = members.length;
  const avgHealthScore = totalMembers > 0 ? Math.round(totalHealth / totalMembers) : 0;

  const memberCount = totalMembers;
  console.log(`Segmentation complete: ${memberCount} members processed, segments: ${JSON.stringify(segmentCounts)}`);

  return { totalMembers, segmentCounts, avgHealthScore };
}
