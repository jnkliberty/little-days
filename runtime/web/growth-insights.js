globalThis.LittleDaysGrowthInsights = (() => {
  const validDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  const positive = value => Number.isFinite(value) && value > 0;
  // WHO reference tables are omitted until written reuse permission is granted (see runtime/web/README.md).
  const chartSex = () => '';

  const measures = [
    { key: 'kg', resource: 'weight', title: ['Recorded weight', 'Peso registrado'] },
    { key: 'cm', resource: 'height', title: ['Recorded length', 'Longitud registrada'] },
  ];
  function cards({ entries = [], child, today, permissions, lang, units, unavailable = [] } = {}) {
    const allowed = resource => permissions?.resources?.[resource]?.view === true && !unavailable.includes(resource);
    if (!child?.id || !validDate(today) || !allowed('children')) return [];
    const es = lang === 'es', label = (en, spanish) => es ? spanish : en;
    const locale = es ? 'es-MX' : 'en-US';
    const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
    const day = value => dateFormat.format(new Date(value));
    const shortFormat = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const short = value => shortFormat.format(new Date(value)).replace('.', '');
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
    const inches = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const ounces = kg => Math.round(kg / 0.0283495);
    const formatOunces = value => value < 16 ? `${value} oz` : `${Math.floor(value / 16)} lb ${value % 16} oz`;
    const size = (key, value) => {
      if (key === 'kg' && units === 'us') return formatOunces(ounces(value));
      // Inches at one decimal (about 2.5 mm), like the 0.1 kg and 0.1 cm steps of the metric records.
      if (key === 'cm' && units === 'us') return `${inches.format(value / 2.54)} ${label('in', 'pulg')}`;
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
      // Card mix (owner, 2026-11-19): the latest value as the headline. With one record it is only the number;
      // with more, a line through every record (one per date) and the change since the record before.
      let look = { headline: size(key, latest[key]), big: true, note: label(`Recorded ${short(latest.date)}`, `Registrado el ${short(latest.date)}`) };
      if (previous) {
        const usWeight = key === 'kg' && units === 'us';
        const delta = usWeight ? ounces(latest[key]) - ounces(previous[key]) : latest[key] - previous[key];
        const change = usWeight ? formatOunces(Math.abs(delta)) : size(key, Math.abs(delta));
        const signed = `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${change}`;
        body += `. ${day(previous.date)} · ${size(key, previous[key])}. ${label('Change', 'Cambio')} ${signed}`;
        const byDate = [...new Map(records.slice().reverse().map(entry => [entry.date, entry])).values()];
        look = { headline: size(key, latest[key]), note: label(`${signed} since ${short(previous.date)}`, `${signed} desde el ${short(previous.date)}`),
          // The screen-reader label names every drawn point (review r1, 2026-11-19).
          viz: { kind: 'growth', first: short(byDate[0].date), last: short(latest.date),
            label: `${label(...title)}, ${byDate.length} ${label('records', 'registros')}: ${byDate.map(entry => `${short(entry.date)} · ${size(key, entry[key])}`).join(', ')}.`,
            points: byDate.map(entry => ({ d: Date.parse(entry.date) / 864e5, v: entry[key] })) } };
      }
      facts.push({ id: `growth:${resource}:${today}`, kind: 'record', topic: resource, title: label(...title), body, ...look,
        evidence: (previous ? [latest, previous] : [latest]).map(evidence) });
    }
    return facts;
  }
  return { cards, chartSex };
})();
