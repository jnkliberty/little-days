/* Typical ranges by age for "Is this normal?" (plan 2026-11-21, Group 2; look A approved by owner 2026-11-22). Plain data.
   Every row is a row of the table the owner approved at STOP 0 (research/2026-11-21-age-norms.md), with the answers of 2026-11-21:
   the newborn rows end at day 28, Feeds use CDC 8 to 12, no WHO curves. test/age-norms.test.ts checks each quote against the table.
   A metric or an age with no row has no band and no range. Sets globalThis.LittleDaysAgeNorms; no browser object. */
globalThis.LittleDaysAgeNorms = (() => {
  const CDC_BREAST = {name: ['CDC, breastfeeding', 'CDC, lactancia (en inglés)'], url: 'https://www.cdc.gov/infant-toddler-nutrition/breastfeeding/how-much-and-how-often.html',
    quote: 'Your baby will breastfeed about 8 to 12 times in 24 hours.'};
  const CDC_FORMULA = {name: ['CDC, formula', 'CDC, fórmula (en inglés)'], url: 'https://www.cdc.gov/infant-toddler-nutrition/formula-feeding/how-much-and-how-often.html',
    quote: 'Most infant formula-fed newborns will feed 8 to 12 times in 24 hours.'};
  const AAP = {name: ['AAP, HealthyChildren.org', 'AAP, HealthyChildren.org (en inglés)'], url: 'https://www.healthychildren.org/English/ages-stages/baby/feeding-nutrition/Pages/How-often-and-how-much-should-your-baby-eat.aspx',
    quote: 'After the first 4 to 5 days, a baby should have at least 5 to 6 wet diapers a day.'};
  const AASM_UNDER4 = {name: ['AASM, 2016', 'AASM, 2016 (en inglés)'], url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4877308',
    quote: 'Recommendations for infants younger than 4 months are not included'};
  const AASM = {...AASM_UNDER4, quote: 'Infants* 4 months to 12 months should sleep 12 to 16 hours per 24 hours'};

  // kind: 'range' (low to high), 'atLeast' (low, open at the top; high is the figure's upper words only), 'under4' (sentence, no band).
  const ROWS = [
    {metric: 'feeds', fromDays: 0, toDays: 28, low: 8, high: 12, kind: 'range', sources: [CDC_BREAST, CDC_FORMULA]},
    {metric: 'wet', fromDays: 5, toDays: 28, low: 5, high: 6, kind: 'atLeast', sources: [AAP]},
    {metric: 'sleepHours', fromDays: 0, toDays: 121, kind: 'under4', sources: [AASM_UNDER4]},
    {metric: 'sleepHours', fromDays: 122, toDays: 365, low: 12, high: 16, kind: 'range', sources: [AASM]},
  ];

  const normFor = (metric, ageDays) => Number.isFinite(ageDays)
    ? ROWS.find(r => r.metric === metric && ageDays >= r.fromDays && ageDays <= r.toDays) || null : null;

  // Where her average sits. Plain words only, no color (J11). An "at least" row has no above.
  const place = (value, row) => {
    if (!row || row.kind === 'under4' || !Number.isFinite(value)) return null;
    if (value < row.low) return 'below';
    return row.kind === 'range' && value > row.high ? 'above' : 'inside';
  };

  return {ROWS, normFor, place};
})();
