globalThis.LittleDaysGrowthInsights = (() => {
  // WHO Child Growth Standards (2006). Percentile weights in kg at 45–110 cm by 0.5 cm.
  // Columns: 3rd, 15th, 50th, 85th and 97th.
  const tables = {
    // https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-length-height/tab_wfl_girls_p_0_2.xlsx?sfvrsn=9957c4f_7
    // SHA-256 e4649e14cbeb9e7dd79e321309aaa5bfbc7e57ab5d467dad230457f0a433e79a
    girls: [
      [2.1,2.2,2.5,2.7,2.9], [2.2,2.3,2.5,2.8,3], [2.2,2.4,2.6,2.9,3.1], [2.3,2.5,2.7,3,3.2], [2.4,2.6,2.8,3.1,3.3],
      [2.4,2.6,2.9,3.2,3.4], [2.5,2.7,3,3.3,3.5], [2.6,2.8,3.1,3.4,3.7], [2.7,2.9,3.2,3.5,3.8], [2.8,3,3.3,3.6,3.9],
      [2.8,3.1,3.4,3.7,4], [2.9,3.2,3.5,3.8,4.1], [3,3.2,3.6,3.9,4.3], [3.1,3.4,3.7,4,4.4], [3.2,3.5,3.8,4.2,4.5],
      [3.3,3.6,3.9,4.3,4.7], [3.4,3.7,4,4.4,4.8], [3.5,3.8,4.2,4.6,5], [3.6,3.9,4.3,4.7,5.1], [3.7,4,4.4,4.9,5.3],
      [3.9,4.1,4.5,5,5.4], [4,4.3,4.7,5.2,5.6], [4.1,4.4,4.8,5.3,5.8], [4.2,4.5,5,5.5,5.9], [4.3,4.6,5.1,5.6,6.1],
      [4.4,4.8,5.2,5.7,6.2], [4.5,4.9,5.4,5.9,6.4], [4.6,5,5.5,6,6.5], [4.8,5.1,5.6,6.2,6.7], [4.9,5.2,5.7,6.3,6.9],
      [5,5.4,5.9,6.5,7], [5.1,5.5,6,6.6,7.2], [5.2,5.6,6.1,6.7,7.3], [5.3,5.7,6.3,6.9,7.5], [5.4,5.8,6.4,7,7.6],
      [5.5,5.9,6.5,7.2,7.8], [5.6,6,6.6,7.3,7.9], [5.7,6.1,6.7,7.4,8], [5.8,6.2,6.9,7.5,8.2], [5.9,6.3,7,7.7,8.3],
      [6,6.5,7.1,7.8,8.5], [6.1,6.6,7.2,7.9,8.6], [6.2,6.7,7.3,8,8.7], [6.3,6.8,7.4,8.2,8.9], [6.4,6.9,7.5,8.3,9],
      [6.5,7,7.6,8.4,9.1], [6.6,7.1,7.7,8.5,9.2], [6.7,7.2,7.9,8.6,9.4], [6.7,7.3,8,8.8,9.5], [6.8,7.3,8.1,8.9,9.6],
      [6.9,7.4,8.2,9,9.7], [7,7.5,8.3,9.1,9.9], [7.1,7.6,8.4,9.2,10], [7.2,7.7,8.5,9.3,10.1], [7.3,7.8,8.6,9.4,10.2],
      [7.4,7.9,8.7,9.5,10.3], [7.4,8,8.8,9.6,10.4], [7.5,8.1,8.9,9.7,10.6], [7.6,8.2,9,9.9,10.7], [7.7,8.3,9.1,10,10.8],
      [7.8,8.3,9.1,10.1,10.9], [7.8,8.4,9.2,10.2,11], [7.9,8.5,9.3,10.3,11.1], [8,8.6,9.4,10.4,11.2], [8.1,8.7,9.5,10.5,11.3],
      [8.2,8.8,9.6,10.6,11.4], [8.2,8.9,9.7,10.7,11.5], [8.3,8.9,9.8,10.8,11.7], [8.4,9,9.9,10.9,11.8], [8.5,9.1,10,11,11.9],
      [8.6,9.2,10.1,11.1,12], [8.7,9.3,10.2,11.2,12.1], [8.8,9.4,10.3,11.3,12.2], [8.8,9.5,10.4,11.4,12.4], [8.9,9.6,10.5,11.6,12.5],
      [9,9.7,10.6,11.7,12.6], [9.1,9.8,10.7,11.8,12.8], [9.2,9.9,10.9,11.9,12.9], [9.3,10,11,12.1,13.1], [9.4,10.1,11.1,12.2,13.2],
      [9.5,10.2,11.2,12.3,13.3], [9.6,10.4,11.3,12.5,13.5], [9.8,10.5,11.5,12.6,13.6], [9.9,10.6,11.6,12.7,13.8], [10,10.7,11.7,12.9,13.9],
      [10.1,10.8,11.8,13,14.1], [10.2,10.9,12,13.2,14.2], [10.3,11,12.1,13.3,14.4], [10.4,11.2,12.2,13.4,14.5], [10.5,11.3,12.3,13.6,14.7],
      [10.6,11.4,12.5,13.7,14.8], [10.7,11.5,12.6,13.8,15], [10.8,11.6,12.7,14,15.1], [10.9,11.7,12.8,14.1,15.3], [11,11.8,13,14.2,15.4],
      [11.1,12,13.1,14.4,15.6], [11.2,12.1,13.2,14.5,15.7], [11.3,12.2,13.3,14.7,15.9], [11.4,12.3,13.5,14.8,16], [11.5,12.4,13.6,14.9,16.2],
      [11.6,12.5,13.7,15.1,16.3], [11.8,12.6,13.8,15.2,16.5], [11.9,12.7,14,15.4,16.6], [12,12.9,14.1,15.5,16.8], [12.1,13,14.2,15.6,16.9],
      [12.2,13.1,14.4,15.8,17.1], [12.3,13.2,14.5,15.9,17.3], [12.4,13.3,14.6,16.1,17.4], [12.5,13.5,14.8,16.2,17.6], [12.6,13.6,14.9,16.4,17.8],
      [12.7,13.7,15,16.5,17.9], [12.9,13.8,15.2,16.7,18.1], [13,14,15.3,16.9,18.3], [13.1,14.1,15.5,17,18.5], [13.2,14.2,15.6,17.2,18.6],
      [13.3,14.4,15.8,17.4,18.8], [13.5,14.5,15.9,17.5,19], [13.6,14.6,16.1,17.7,19.2], [13.7,14.8,16.2,17.9,19.4], [13.9,14.9,16.4,18.1,19.6],
      [14,15.1,16.5,18.2,19.8], [14.1,15.2,16.7,18.4,20], [14.3,15.4,16.9,18.6,20.2], [14.4,15.5,17.1,18.8,20.4], [14.5,15.7,17.2,19,20.6],
      [14.7,15.8,17.4,19.2,20.9], [14.8,16,17.6,19.4,21.1], [15,16.2,17.8,19.6,21.3], [15.1,16.3,18,19.8,21.5], [15.3,16.5,18.1,20,21.8],
      [15.4,16.7,18.3,20.2,22],
    ],
    // https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-length-height/tab_wfl_boys_p_0_2.xlsx?sfvrsn=556712b2_7
    // SHA-256 d292aed354b206dc7df133fe716cfd2c19943219c997475dc5ab25cc45da2266
    boys: [
      [2.1,2.2,2.4,2.7,2.9], [2.1,2.3,2.5,2.8,3], [2.2,2.4,2.6,2.9,3.1], [2.3,2.5,2.7,3,3.2], [2.4,2.5,2.8,3.1,3.3],
      [2.4,2.6,2.9,3.1,3.4], [2.5,2.7,2.9,3.2,3.5], [2.6,2.8,3,3.3,3.6], [2.7,2.9,3.1,3.4,3.7], [2.7,2.9,3.2,3.5,3.8],
      [2.8,3,3.3,3.7,4], [2.9,3.1,3.4,3.8,4.1], [3,3.2,3.5,3.9,4.2], [3.1,3.3,3.6,4,4.3], [3.2,3.4,3.8,4.1,4.5],
      [3.3,3.6,3.9,4.3,4.6], [3.4,3.7,4,4.4,4.7], [3.5,3.8,4.1,4.5,4.9], [3.6,3.9,4.3,4.7,5], [3.8,4,4.4,4.8,5.2],
      [3.9,4.2,4.5,5,5.4], [4,4.3,4.7,5.1,5.5], [4.1,4.4,4.8,5.3,5.7], [4.3,4.6,5,5.4,5.9], [4.4,4.7,5.1,5.6,6],
      [4.5,4.8,5.3,5.8,6.2], [4.6,5,5.4,5.9,6.4], [4.8,5.1,5.6,6.1,6.5], [4.9,5.2,5.7,6.2,6.7], [5,5.4,5.9,6.4,6.9],
      [5.1,5.5,6,6.5,7], [5.3,5.6,6.1,6.7,7.2], [5.4,5.8,6.3,6.8,7.4], [5.5,5.9,6.4,7,7.5], [5.6,6,6.5,7.1,7.7],
      [5.7,6.1,6.7,7.3,7.8], [5.8,6.2,6.8,7.4,8], [5.9,6.3,6.9,7.5,8.1], [6,6.5,7,7.7,8.2], [6.1,6.6,7.1,7.8,8.4],
      [6.3,6.7,7.3,7.9,8.5], [6.4,6.8,7.4,8.1,8.7], [6.5,6.9,7.5,8.2,8.8], [6.6,7,7.6,8.3,8.9], [6.7,7.1,7.7,8.4,9.1],
      [6.8,7.2,7.9,8.6,9.2], [6.9,7.3,8,8.7,9.3], [7,7.4,8.1,8.8,9.5], [7.1,7.5,8.2,8.9,9.6], [7.1,7.6,8.3,9.1,9.7],
      [7.2,7.7,8.4,9.2,9.9], [7.3,7.8,8.5,9.3,10], [7.4,8,8.6,9.4,10.1], [7.5,8.1,8.8,9.6,10.3], [7.6,8.2,8.9,9.7,10.4],
      [7.7,8.3,9,9.8,10.5], [7.8,8.4,9.1,9.9,10.7], [7.9,8.4,9.2,10,10.8], [8,8.5,9.3,10.1,10.9], [8.1,8.6,9.4,10.3,11],
      [8.2,8.7,9.5,10.4,11.2], [8.2,8.8,9.6,10.5,11.3], [8.3,8.9,9.7,10.6,11.4], [8.4,9,9.8,10.7,11.5], [8.5,9.1,9.9,10.8,11.6],
      [8.6,9.2,10,10.9,11.7], [8.7,9.3,10.1,11,11.8], [8.7,9.3,10.2,11.1,12], [8.8,9.4,10.3,11.2,12.1], [8.9,9.5,10.4,11.3,12.2],
      [9,9.6,10.4,11.4,12.3], [9.1,9.7,10.5,11.5,12.4], [9.1,9.8,10.6,11.6,12.5], [9.2,9.9,10.7,11.7,12.6], [9.3,10,10.8,11.8,12.7],
      [9.4,10.1,10.9,11.9,12.8], [9.5,10.1,11,12,13], [9.6,10.3,11.2,12.2,13.1], [9.7,10.4,11.3,12.3,13.2], [9.8,10.5,11.4,12.4,13.3],
      [9.9,10.6,11.5,12.5,13.5], [10,10.7,11.6,12.7,13.6], [10.1,10.8,11.7,12.8,13.7], [10.2,10.9,11.9,12.9,13.9], [10.3,11,12,13.1,14],
      [10.4,11.2,12.1,13.2,14.2], [10.6,11.3,12.2,13.3,14.3], [10.7,11.4,12.4,13.5,14.4], [10.8,11.5,12.5,13.6,14.6], [10.9,11.6,12.6,13.7,14.7],
      [11,11.7,12.7,13.8,14.9], [11.1,11.8,12.8,14,15], [11.2,11.9,13,14.1,15.1], [11.3,12,13.1,14.2,15.3], [11.4,12.2,13.2,14.4,15.4],
      [11.5,12.3,13.3,14.5,15.5], [11.6,12.4,13.4,14.6,15.7], [11.7,12.5,13.5,14.7,15.8], [11.8,12.6,13.7,14.9,16], [11.9,12.7,13.8,15,16.1],
      [12,12.8,13.9,15.1,16.2], [12.1,12.9,14,15.3,16.4], [12.2,13,14.1,15.4,16.5], [12.3,13.1,14.3,15.5,16.7], [12.4,13.2,14.4,15.7,16.8],
      [12.5,13.4,14.5,15.8,17], [12.6,13.5,14.6,15.9,17.1], [12.7,13.6,14.8,16.1,17.3], [12.8,13.7,14.9,16.2,17.4], [12.9,13.8,15,16.4,17.6],
      [13,13.9,15.2,16.5,17.8], [13.2,14.1,15.3,16.7,17.9], [13.3,14.2,15.4,16.8,18.1], [13.4,14.3,15.6,17,18.3], [13.5,14.5,15.7,17.2,18.5],
      [13.6,14.6,15.9,17.3,18.6], [13.8,14.7,16,17.5,18.8], [13.9,14.8,16.2,17.7,19], [14,15,16.3,17.8,19.2], [14.1,15.1,16.5,18,19.4],
      [14.2,15.3,16.6,18.2,19.6], [14.4,15.4,16.8,18.4,19.8], [14.5,15.5,16.9,18.5,20], [14.6,15.7,17.1,18.7,20.2], [14.8,15.8,17.3,18.9,20.4],
      [14.9,16,17.4,19.1,20.6], [15,16.1,17.6,19.3,20.8], [15.2,16.3,17.8,19.5,21], [15.3,16.4,17.9,19.6,21.2], [15.4,16.6,18.1,19.8,21.4],
      [15.6,16.7,18.3,20,21.6],
    ],
  };
  const percentiles = [3, 15, 50, 85, 97];
  const source = {
    girls: 'https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-length-height/wfl-girls-0-2-percentiles.pdf?sfvrsn=52288d78_9',
    boys: 'https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-length-height/wfl-boys-0-2-percentiles.pdf?sfvrsn=aaf0909f_9',
  };
  const validDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  const positive = value => Number.isFinite(value) && value > 0;
  const knownChart = sex => sex === 'girls' || sex === 'boys';
  const chartSex = (preferences, childId) => childId && String(preferences?.growthChart?.childId) === String(childId)
    && knownChart(preferences.growthChart.sex) ? preferences.growthChart.sex : '';

  function percentileBand(sex, kg, cm, es) {
    const position = (cm - 45) * 2;
    const row = tables[sex][Math.floor(position)], next = tables[sex][Math.ceil(position)];
    const values = row.map((value, index) => value + (next[index] - value) * (position % 1));
    const ordinal = value => es ? String(value) : `${value}${value === 3 ? 'rd' : 'th'}`;
    const at = values.findIndex(value => Math.abs(value - kg) <= 1e-9);
    if (at >= 0) return es ? `percentil ${ordinal(percentiles[at])}` : `${ordinal(percentiles[at])} percentile`;
    const above = values.findIndex(value => value > kg);
    if (above === 0) return es ? 'por debajo del percentil 3' : 'below the 3rd percentile';
    if (above === -1) return es ? 'por encima del percentil 97' : 'above the 97th percentile';
    const low = ordinal(percentiles[above - 1]), high = ordinal(percentiles[above]);
    return es ? `percentiles ${low} a ${high}` : `${low} to ${high} percentile`;
  }

  function pairedMeasurement(entries, birthDate) {
    if (!validDate(birthDate)) return undefined;
    const secondBirthday = new Date(birthDate);
    secondBirthday.setUTCFullYear(secondBirthday.getUTCFullYear() + 2);
    const limit = secondBirthday.toISOString().slice(0, 10);
    const weights = new Map(entries.filter(entry => entry.growthPair && positive(entry.kg)).map(entry => [entry.growthPair, entry]));
    for (const length of entries) {
      if (length.recumbent !== true || !positive(length.cm) || length.cm < 45 || length.cm > 110
        || length.date < birthDate || length.date >= limit) continue;
      const weight = weights.get(length.growthPair);
      if (weight?.date === length.date) return { weight, length };
    }
  }

  const measures = [
    { key: 'kg', resource: 'weight', title: ['Recorded weight', 'Peso registrado'] },
    { key: 'cm', resource: 'height', title: ['Recorded length', 'Longitud registrada'] },
  ];
  function cards({ entries = [], child, today, permissions, lang, units, chartSex, unavailable = [] } = {}) {
    const allowed = resource => permissions?.resources?.[resource]?.view === true && !unavailable.includes(resource);
    if (!child?.id || !validDate(today) || !allowed('children')) return [];
    const es = lang === 'es', label = (en, spanish) => es ? spanish : en;
    const locale = es ? 'es-MX' : 'en-US';
    const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
    const day = value => dateFormat.format(new Date(value));
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
    const ounces = kg => Math.round(kg / 0.0283495);
    const formatOunces = value => value < 16 ? `${value} oz` : `${Math.floor(value / 16)} lb ${value % 16} oz`;
    const size = (key, value) => {
      if (key === 'kg' && units === 'us') return formatOunces(ounces(value));
      if (key === 'cm' && units === 'us') return `${number.format(value / 2.54)} ${label('in', 'pulg')}`;
      return `${number.format(value)} ${key}`;
    };
    const dated = entries.filter(entry => entry?.type === 'growth' && typeof entry.id === 'string' && entry.id
      && validDate(entry.date) && entry.date <= today).sort((a, b) => b.date.localeCompare(a.date)
      || b.id.localeCompare(a.id, undefined, { numeric: true }));
    const evidence = entry => ({ kind: 'record', id: entry.id, label: label('View record', 'Ver registro'), date: entry.date });
    const facts = [];
    for (const { key, resource, title } of measures.filter(measure => allowed(measure.resource))) {
      const records = dated.filter(entry => positive(entry[key]));
      const latest = records[0];
      if (!latest) continue;
      const previous = records.find(entry => entry.date < latest.date);
      let body = `${day(latest.date)} · ${size(key, latest[key])}`;
      if (previous) {
        const usWeight = key === 'kg' && units === 'us';
        const delta = usWeight ? ounces(latest[key]) - ounces(previous[key]) : latest[key] - previous[key];
        const change = usWeight ? formatOunces(Math.abs(delta)) : size(key, Math.abs(delta));
        body += `. ${day(previous.date)} · ${size(key, previous[key])}. ${label('Change', 'Cambio')} ${delta > 0 ? '+' : delta < 0 ? '−' : ''}${change}`;
      }
      facts.push({ id: `growth:${resource}:${today}`, kind: 'record', topic: resource, title: label(...title), body,
        evidence: (previous ? [latest, previous] : [latest]).map(evidence) });
    }
    if (!allowed('weight') || !allowed('height') || !knownChart(chartSex)) return facts;
    const pair = pairedMeasurement(dated, child.birthDate);
    if (!pair) return facts;
    const { weight, length } = pair;
    const band = percentileBand(chartSex, weight.kg, length.cm, es);
    const group = chartSex === 'girls' ? label('girls', 'niñas') : label('boys', 'niños');
    const body = label(
      `${day(weight.date)} · ${size('kg', weight.kg)} at ${size('cm', length.cm)}. Approximate result: ${band} on the WHO chart for ${group} under 2 years.`,
      `${day(weight.date)} · ${size('kg', weight.kg)} con ${size('cm', length.cm)}. Resultado aproximado: ${band} en la tabla de la OMS para ${group} menores de 2 años.`,
    );
    facts.push({ id: `growth:weight-for-length:${today}`, kind: 'record', topic: 'weight-for-length',
      title: label('Weight for length', 'Peso para la longitud'), body,
      evidence: [evidence(weight), evidence(length), { kind: 'source', id: `who-wfl-${chartSex}`, label: label('WHO percentile table', 'Tabla de percentiles de la OMS'), url: source[chartSex], date: '2006' }] });
    return facts;
  }
  return { cards, chartSex };
})();
