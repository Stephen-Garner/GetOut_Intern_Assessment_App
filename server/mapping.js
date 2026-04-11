/**
 * Column Mapping Module
 * Auto-maps CSV column names to canonical field names using exact match,
 * synonym matching, and fuzzy containment.
 */

export const CANONICAL_FIELDS = {
  member_id: { synonyms: ['customer_id', 'user_id', 'id', 'memberid', 'cust_id', 'subscriber_id'], required: true },
  first_name: { synonyms: ['fname', 'first', 'given_name', 'firstname'] },
  last_name: { synonyms: ['lname', 'last', 'surname', 'lastname', 'family_name'] },
  email: { synonyms: ['email_address', 'e_mail', 'contact_email'] },
  market: { synonyms: ['city', 'metro', 'region', 'location', 'area', 'dma'] },
  zip_code: { synonyms: ['zip', 'postal_code', 'postal', 'zipcode'] },
  purchase_date: { synonyms: ['signup_date', 'join_date', 'created_at', 'start_date', 'enrollment_date', 'registration_date'] },
  renewal_date: { synonyms: ['expiry_date', 'expiration_date', 'end_date', 'expires_at', 'renewal'] },
  acquisition_channel: { synonyms: ['source', 'channel', 'utm_source', 'referral_source', 'how_found', 'acquisition_source'] },
  total_visits: { synonyms: ['visits', 'num_visits', 'visit_count', 'redemptions', 'redemption_count', 'times_redeemed', 'num_uses', 'uses'], required: true },
  last_visit_date: { synonyms: ['last_visit', 'last_redeemed', 'last_redemption', 'last_use', 'last_active', 'last_activity'] },
  plan_tier: { synonyms: ['plan', 'tier', 'membership_type', 'pass_type', 'plan_name', 'subscription_type'] },
  plan_price: { synonyms: ['price', 'amount', 'cost', 'annual_price', 'membership_price', 'revenue'] },
  venue_name: { synonyms: ['venue', 'attraction', 'location_name', 'place', 'business_name'] },
  venue_type: { synonyms: ['category', 'type', 'venue_category', 'attraction_type'] },
  visit_date: { synonyms: ['date', 'redemption_date', 'activity_date', 'used_date'] },
};

/**
 * Normalize a string for comparison: lowercase, strip non-alphanumeric chars
 */
function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

/**
 * Auto-map CSV column headers to canonical field names.
 * Strategy order: exact match, synonym match, fuzzy containment.
 *
 * @param {string[]} csvHeaders - Column names from the CSV
 * @returns {{ mapping: Record<string, string>, unmapped: string[], missing: string[] }}
 */
export function autoMapColumns(csvHeaders) {
  const mapping = {};
  const used = new Set();

  const normalizedHeaders = csvHeaders.map((h) => ({
    original: h,
    normalized: normalize(h),
  }));

  // Pass 1: Exact match (normalized canonical name === normalized header)
  for (const [canonical, config] of Object.entries(CANONICAL_FIELDS)) {
    const normalizedCanonical = normalize(canonical);
    for (const header of normalizedHeaders) {
      if (used.has(header.original)) continue;
      if (header.normalized === normalizedCanonical) {
        mapping[canonical] = header.original;
        used.add(header.original);
        break;
      }
    }
  }

  // Pass 2: Synonym match
  for (const [canonical, config] of Object.entries(CANONICAL_FIELDS)) {
    if (mapping[canonical]) continue;
    const normalizedSynonyms = config.synonyms.map(normalize);

    for (const header of normalizedHeaders) {
      if (used.has(header.original)) continue;
      if (normalizedSynonyms.includes(header.normalized)) {
        mapping[canonical] = header.original;
        used.add(header.original);
        break;
      }
    }
  }

  // Pass 3: Fuzzy containment (header contains canonical name or synonym, or vice versa)
  for (const [canonical, config] of Object.entries(CANONICAL_FIELDS)) {
    if (mapping[canonical]) continue;
    const normalizedCanonical = normalize(canonical);
    const allTerms = [normalizedCanonical, ...config.synonyms.map(normalize)];

    for (const header of normalizedHeaders) {
      if (used.has(header.original)) continue;
      const match = allTerms.some(
        (term) => header.normalized.includes(term) || term.includes(header.normalized)
      );
      if (match) {
        mapping[canonical] = header.original;
        used.add(header.original);
        break;
      }
    }
  }

  const unmapped = csvHeaders.filter((h) => !used.has(h));
  const missing = Object.entries(CANONICAL_FIELDS)
    .filter(([canonical, config]) => config.required && !mapping[canonical])
    .map(([canonical]) => canonical);

  return { mapping, unmapped, missing };
}
