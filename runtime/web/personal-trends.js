globalThis.LittleDaysPersonalTrends = (() => {
  const DAY = 1440, DAY_MS = 86400000;
  const iso = ms => new Date(ms).toISOString().slice(0, 10);
  const range = (first, end) => Array.from({length:end - first}, (_, i) => first + i);
  const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const median = values => {
    const sorted = values.slice().sort((a,b) => a - b);
    return (sorted[Math.floor(sorted.length / 2)] + sorted[Math.floor((sorted.length - 1) / 2)]) / 2;
  };
  const resources = {feed:'feedings', bottle:'feedings', diaper:'changes', sleep:'sleep'};

  function calendar(today) {
    if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
    const midnight = Date.parse(today);
    if (!Number.isFinite(midnight) || iso(midnight) !== today) return null;
    const [year, month] = today.split('-').map(Number);
    const from = monthsAgo => (Date.UTC(year, month - 1 - monthsAgo, 1) - midnight) / DAY_MS;
    return {date:day => iso(midnight + day * DAY_MS), month:range(from(1), from(0)), earlier:range(from(2), from(1))};
  }

  function historyStart(today) {
    const dates = calendar(today);
    return dates?.date(dates.earlier[0] - 1);
  }

  function pool({entries, child, today, nowMinutes, readDates, permissions, lang, units} = {}) {
    const dates = calendar(today);
    if (!dates || !Number.isFinite(nowMinutes) || nowMinutes < 0 || nowMinutes >= DAY || !readDates?.has(today)) return [];
    const {sleepWithin, sleepEnd, feedSessionKey, DAY_START, NIGHT_START, WINDOW} = LittleDaysTrends;
    const es = lang === 'es', text = (en, spanish) => es ? spanish : en;
    const locale = text('en-US', 'es-MX');
    const numbers = new Intl.NumberFormat(locale, {maximumFractionDigits:1});
    const clocks = new Intl.DateTimeFormat(locale, {timeZone:'UTC', hour:'numeric', minute:'2-digit', hour12:true});
    // Spanish clock times read "10:23 p. m." (some ICU versions give "p.m.") with non-breaking spaces, so a time never breaks across lines.
    // English ICU already puts a no-break space before AM and PM.
    const clock = minute => { const time = clocks.format(Math.floor(minute) * 60000); return es ? time.replace(/\s?([ap])\.\s?m\./, "\u00a0$1.\u00a0m.") : time; };
    const weekdays = new Intl.DateTimeFormat(locale, {timeZone:'UTC', weekday:'narrow'});
    const shortDates = new Intl.DateTimeFormat(locale, {timeZone:'UTC', month:'short', day:'numeric'});
    const shortDate = day => shortDates.format(new Date(dates.date(day))).replace('.', '');
    const number = value => numbers.format(value);
    // Sleep reads as hours and minutes ("14 h 7 min"), not as a count of minutes (owner, 2026-11-18).
    const minutes = value => {
      const whole = Math.round(value), hours = Math.floor(whole / 60), rest = whole % 60;
      return hours ? (rest ? `${hours} h ${rest} min` : `${hours} h`) : `${rest} min`;
    };
    // mL reads as a whole number and oz keeps one decimal (owner, 2026-11-19). Each amount is rounded once, here, from the
    // unrounded value; Intl rounds a half up, so 52.5 mL reads "53 mL".
    const wholes = new Intl.NumberFormat(locale, {maximumFractionDigits:0});
    // Floating point turns 64.1 - 63.6 into 0.4999999999999929; clearing the noise below 1e-6 first lets that half round up (Codex r1).
    const volumeNumber = ml => units === 'us' ? number(ml / 29.5735) : wholes.format(Math.round(ml * 1e6) / 1e6);
    const volume = value => volumeNumber(value) + (units === 'us' ? ' oz' : ' mL');
    const allowed = name => permissions?.resources?.[name]?.view === true;
    const dayOf = minute => Math.floor(minute / DAY);
    const firstDay = dates.earlier[0] - 1;
    const read = day => day >= firstDay && day <= 0 && readDates.has(dates.date(day));
    const fromBirth = day => !child?.birthDate || dates.date(day) >= child.birthDate;
    const validRead = (day, prior) => fromBirth(day) && read(day) && (!prior || !fromBirth(day - 1) || read(day - 1));
    const covered = (start, end, prior) => validRead(dayOf(start), prior) && range(dayOf(start), dayOf(end) + 1).every(read);
    const seen = new Set();
    const records = (Array.isArray(entries) ? entries : []).filter(entry => {
      if (!entry || typeof entry.id !== 'string' || !entry.id || seen.has(entry.id) || entry.live ||
        !Number.isFinite(entry.t) || !read(dayOf(entry.t)) || !fromBirth(dayOf(entry.t)) ||
        entry.t > nowMinutes || !allowed(resources[entry.type])) return false;
      seen.add(entry.id);
      return true;
    }).sort((a,b) => a.t - b.t);
    const sessions = new Map(), bottles = [], diapers = [], sleeps = [];
    for (const entry of records) {
      if (entry.type === 'feed' || entry.type === 'bottle') {
        const key = feedSessionKey(entry);
        if (!sessions.has(key)) sessions.set(key, []);
        sessions.get(key).push(entry);
        if (entry.type === 'bottle') bottles.push(entry);
      } else if (entry.type === 'diaper' && ['W','D','B'].includes(entry.kind)) {
        diapers.push(entry);
      } else if (entry.type === 'sleep' && Number.isFinite(entry.dur) && entry.dur > 0 && entry.dur <= DAY && sleepEnd(entry) <= nowMinutes) {
        sleeps.push(entry);
      }
    }
    const groups = [...sessions.values()];
    const includes = (entry, start, end, inclusive) => entry.t >= start && (entry.t < end || inclusive && entry.t === end);
    const feedEnd = entry => Number.isFinite(entry.dur) ? sleepEnd(entry) : entry.t;
    const feedPartsWithin = (start, end, inclusive) => groups.filter(group => includes(group[0], start, end, inclusive))
      .map(group => group.filter(entry => includes(entry, start, end, inclusive) && (!inclusive || feedEnd(entry) <= end)))
      .filter(group => group.length);
    const cards = [];
    // `look` is the card's graph: {headline, note, viz}. The body stays the full sentence (Ask and screen readers use it).
    const add = (topic, window, title, body, evidence, look = {}) => {
      const unique = [...new Map(evidence.map(entry => [entry.id, entry])).values()].sort((a,b) => b.t - a.t);
      cards.push({id:`trend:${topic}:${window}:${today}`, kind:'record', topic, title, body, ...look,
        evidence:unique.map(entry => ({kind:'record',id:entry.id,label:text('View record','Ver registro'),date:dates.date(dayOf(entry.t))}))});
    };
    const metrics = [
      {topic:'feeds', name:text('Feeds','Tomas'), noun:text(['feed','feeds'],['toma','tomas']), format:number, prior:true, has:groups.length,
        measure(start, end, inclusive) {
          const selected = feedPartsWithin(start, end, inclusive);
          return {value:selected.length, evidence:selected.flat()};
        }},
      {topic:'diapers', name:text('Diaper changes','Cambios de pañal'), noun:text(['diaper change','diaper changes'],['cambio de pañal','cambios de pañal']), format:number, has:diapers.length,
        // The Spanish card title and its one-line note use the short words ("Pañales a esta hora", "8 cambios"), card mix 2026-11-19.
        short:text('Diaper changes','Pañales'), shortNoun:text(['diaper change','diaper changes'],['cambio','cambios']),
        measure(start, end, inclusive) {
          const evidence = diapers.filter(entry => includes(entry, start, end, inclusive));
          return {value:evidence.length, evidence};
        }},
      {topic:'sleep', name:text('Sleep','Sueño'), format:minutes, prior:true, has:sleeps.length,
        measure(start, end, inclusive) {
          // Same-time comparisons only use sleeps that had finished by each cutoff.
          const sleep = sleepWithin(inclusive ? sleeps.filter(entry => sleepEnd(entry) <= end) : sleeps, start, end);
          return {value:sleep.total, evidence:sleep.evidence};
        }},
    ];
    const week = range(-WINDOW, 0), earlierWeek = range(-2 * WINDOW, -WINDOW);
    const samples = (metric, days, until = DAY) => days.map(day => validRead(day, metric.prior)
      ? metric.measure(day * DAY, day * DAY + until, until < DAY) : null);
    const complete = days => days.every(day => day?.value > 0);
    const evidenceFor = days => days.flatMap(day => day?.evidence || []);
    const valuesOf = days => days.map(day => day.value);
    const byHour = text(`By ${clock(nowMinutes)}`, `Hasta las ${clock(nowMinutes)}`);
    const byClock = text(`by ${clock(nowMinutes)}`, `hasta las ${clock(nowMinutes)}`);
    // A sentence that ends on a clock time ("10:23 p.m.") gets no second period.
    const close = sentence => sentence.endsWith('.') ? sentence : sentence + '.';
    // Sleep compares the rounded minutes that the card shows, so "1 h" and "1 h" never differ by "1 min". Time is "less", a count is "fewer".
    const gap = (current, past, format) => format === minutes ? Math.round(current) - Math.round(past) : current - past;
    function difference(current, past, format) {
      const delta = gap(current, past, format), amount = format(Math.abs(delta));
      if (amount === format(0)) return text('no change','sin cambio');
      return delta > 0 ? text(`${amount} more`, `${amount} más`) : text(`${amount} ${format === minutes ? 'less' : 'fewer'}`, `${amount} menos`);
    }
    // An amount with its unit: "32 min", "1 feed", "2 diaper changes".
    const counted = (value, format, noun) => noun ? `${format(value)} ${noun[Number(value !== 1)]}` : format(value);

    // The headline of a by-this-time card is a verdict against the drawn past days, in neutral words (owner, 2026-11-19).
    // It never says low, high, good, bad or normal: this is not medical advice.
    // With gaps (fewer past days with records than days in the window) it names "the days with records".
    function verdictDays(n, gaps) {
      if (n === 1) return gaps ? [text('the day with records', 'el día con registros')] : [text('the last day', 'el último día')];
      return gaps ? [text(`each of the ${n} days with records`, `cada uno de los ${n} días con registros`), text(`any of the ${n} days with records`, `cualquiera de los ${n} días con registros`)]
        : [text(`each of the last ${n} days`, `cada uno de los últimos ${n} días`), text(`any of the last ${n} days`, `cualquiera de los últimos ${n} días`)];
    }
    function verdict(today, past, format, windowDays) {
      const round = format === minutes ? Math.round : value => value;
      const shown = past.map(round), now = round(today), low = Math.min(...shown), high = Math.max(...shown);
      // One past day with no gaps (a newborn's first week) reads "the last day", never "the last 1 days".
      const days = verdictDays(past.length, past.length < windowDays);
      if (low === high && now === low) return {same:true, headline:text(`Same as ${days[0]}`, `Igual que ${days[0]}`)};
      if (now < low) return {headline:text(`Less than ${days.at(-1)}`, `Menos que ${days.at(-1)}`)};
      if (now > high) return {headline:text(`More than ${days.at(-1)}`, `Más que ${days.at(-1)}`)};
      return {headline:text('About usual', 'Cerca de lo usual')};
    }
    // The gray line under the verdict: the amount and the clock time.
    // One line (card mix, 2026-11-19): the title already says "by this time", so the note leaves out the clock time.
    function usualNote(today, usual, format, noun) {
      const delta = gap(today, usual, format), amount = counted(Math.abs(delta), format, noun), typical = format(usual);
      if (format(Math.abs(delta)) === format(0)) return text(`The usual is ${typical}`, `Lo usual es ${typical}.`);
      // Spanish reads as two short sentences, so no number stands alone between commas.
      const spanish = `${amount} ${delta < 0 ? 'menos' : 'más'}. Lo usual es ${typical}.`;
      return text(`${amount} ${delta < 0 ? 'under' : 'over'} the usual ${typical}`, spanish);
    }
    function baselineLook(daily, days, eligible, weekCount, metric) {
      const values = valuesOf(eligible);
      // A duration draws the rounded minutes that the note and the verdict use (review, 2026-11-19).
      // A count is whole too (owner, 2026-11-19): the median of an even count of days (9.5) reads 10, a half rounds up.
      const {format, noun} = metric, round = Math.round;
      const usual = round(median(values)), {same, headline} = verdict(daily.value, values, format, weekCount);
      if (same) return {headline, note:`${counted(daily.value, format, metric.shortNoun || noun)} ${byClock}`};
      return {headline, note:usualNote(daily.value, usual, format, noun),
        viz:{kind:'columns', usual, floor:format === minutes ? 0 : 2, days:weekCount, usualLabel:text('usual','lo usual'), span:weekCount === 1 ? text('Last day', 'Último día') : text(`Last ${weekCount} days`, `Últimos ${weekCount} días`),
          todayLabel:text('Today','Hoy'), bars:[...days.map(day => ({value:eligible.includes(day) ? round(day.value) : null})), {value:round(daily.value), today:true}]}};
    }
    // The today card, used only when there is no by-this-time card: today against yesterday at the same clock time.
    function dayLook(daily, yesterday, metric) {
      const {format, noun} = metric, delta = gap(daily.value, yesterday.value, format), amount = counted(Math.abs(delta), format, noun);
      const headline = format(Math.abs(delta)) === format(0) ? text('Same as yesterday', 'Igual que ayer')
        : delta > 0 ? text(`${amount} more than yesterday`, `${amount} más que ayer`)
          : text(`${amount} ${format === minutes ? 'less' : 'fewer'} than yesterday`, `${amount} menos que ayer`);
      const past = counted(yesterday.value, format, noun);
      return {headline, note:text(`Yesterday ${byClock}: ${past}.`, `Ayer ${byClock}: ${past}.`),
        viz:{kind:'columns', bars:[{label:text('Yesterday','Ayer'), value:yesterday.value}, {label:text('Today','Hoy'), value:daily.value, today:true}]}};
    }

    for (const metric of metrics.filter(item => item.has)) {
      const {topic, name, noun, format} = metric;
      const [daily, yesterday] = samples(metric, [0,-1], nowMinutes);
      if (daily?.value) {
        const current = format(daily.value), past = yesterday?.value ? format(yesterday.value) : null;
        const value = noun ? `${current} ${noun[Number(daily.value !== 1)]}` : current;
        const weekDays = week.filter(fromBirth);
        const days = samples(metric, weekDays, nowMinutes);
        // A day has a record when it has a value or evidence; a recorded value that rounds to 0 still counts and draws (review, 2026-11-19).
        const recorded = day => Boolean(day) && (day.value > 0 || day.evidence?.length > 0);
        const eligible = days.filter(recorded), values = valuesOf(eligible);
        // One card per care type: the today card is only the fallback when there is no by-this-time card (owner, 2026-11-19).
        if (days.every(Boolean) && values.length) {
          const usual = format(Math.round(median(values))), low = format(Math.min(...values)), high = format(Math.max(...values));
          const count = values.length, dayLabel = count === 1 ? text('day','día') : text('days','días');
          add(topic, 'baseline', text(`${name} by this time`, `${metric.short || name} a esta hora`),
            text(`${byHour}, ${current} logged today. Last week, median ${usual}, range ${low} to ${high} across ${count} ${dayLabel} with logs by this time.`,
              `${byHour}, ${current} en el registro de hoy. La última semana, mediana ${usual}, rango de ${low} a ${high} en ${count} ${dayLabel} con registros a esta hora.`),
            [...daily.evidence, ...evidenceFor(eligible)], baselineLook(daily, days, eligible, weekDays.length, metric));
        } else {
          const logged = text(`${byHour}, ${value} logged today`, `${byHour}, ${value} en el registro de hoy`);
          const change = past && difference(daily.value, yesterday.value, format);
          add(topic, 'day', text(`${name} today`, `${name} hoy`), past
            ? text(`${logged} and ${past} yesterday (${change}).`, `${logged} y ${past} ayer (${change}).`) : logged + '.',
            [...daily.evidence, ...(past ? yesterday.evidence : [])],
            past ? dayLook(daily, yesterday, metric)
              : {headline:value, note:validRead(-1, metric.prior) ? text('Nothing logged yesterday by this time.', 'Nada en el registro de ayer a esta hora.') : ''});
        }
      }

    }

    // Last 7 days (card mix, owner, 2026-11-19): one card with a row per care type that has all 7 finished days.
    // It replaces the three "Last 7 finished days" cards, the week and month comparisons and the coverage cards.
    // The change against the 7 days before shows only when that week is complete too (14 finished days).
    const TONES = {feeds:'c-feed', diapers:'c-dia', sleep:'c-sleep'};
    function weekRow(metric) {
      const recent = samples(metric, week), previous = samples(metric, earlierWeek);
      if (!complete(recent)) return null;
      const {name, format} = metric, round = format === minutes ? Math.round : value => Math.round(value * 10) / 10;
      // The change comes from the unrounded averages and is rounded once (review r1, 2026-11-19).
      const exact = average(valuesOf(recent)), now = round(exact), delta = complete(previous) ? round(exact - average(valuesOf(previous))) : null;
      const avg = text(`${format(now)} a day`, `${format(now)} al día`), amount = delta === null ? '' : format(Math.abs(delta));
      const change = delta === null ? '' : delta === 0 ? '0' : `${delta > 0 ? '+' : '−'}${amount}`;
      const more = delta > 0 ? text(`${amount} more`, `${amount} más`) : text(`${amount} ${format === minutes ? 'less' : 'fewer'}`, `${amount} menos`);
      const compared = delta === null ? '' : delta === 0 ? text(' (the same as the 7 days before)', ' (igual que los 7 días anteriores)')
        : text(` (${more} than the 7 days before)`, ` (${more} que los 7 días anteriores)`);
      return {tone:TONES[metric.topic], name, avg, change, days:valuesOf(recent).map(round), evidence:evidenceFor(delta === null ? recent : [...recent, ...previous]),
        label:text(`${name}: ${avg} over the last 7 days${compared}.`, `${name}: ${avg} en los últimos 7 días${compared}.`)};
    }
    const weekRows = metrics.filter(item => item.has).map(weekRow).filter(Boolean);
    if (weekRows.length) {
      const changed = weekRows.some(row => row.change);
      add('week', 'seven', text('Last 7 days', 'Últimos 7 días'), weekRows.map(row => row.label).join(' '), weekRows.flatMap(row => row.evidence),
        {viz:{kind:'week', change:changed, head:text('vs. the week before', 'vs. semana anterior'),
          rows:weekRows.map(({evidence, ...row}) => row)}});
    }

    const currentBottles = bottles.filter(entry => entry.t >= 0 && feedEnd(entry) <= nowMinutes);
    if (currentBottles.length) {
      const priorBottles = bottles.filter(entry => entry.t >= -DAY && feedEnd(entry) <= nowMinutes - DAY);
      const hasAmount = entry => entry.unit === 'ml' && Number.isFinite(entry.ml) && entry.ml > 0;
      const known = list => list.length && list.every(hasAmount);
      const total = list => list.reduce((sum, entry) => sum + entry.ml, 0);
      const comparing = known(currentBottles) && known(priorBottles);
      function breakdown(list) {
        const count = text(`${list.length} ${list.length === 1 ? 'bottle' : 'bottles'}`, `${list.length} ${list.length === 1 ? 'biberón' : 'biberones'}`);
        const measured = list.filter(hasAmount);
        const missing = text(`${count} logged, with an amount missing`, `${count} en el registro, con volumen sin registrar`);
        if (!measured.length) return missing;
        const sum = volume(total(measured)), typical = volume(total(measured) / measured.length);
        if (measured.length < list.length) return text(`${missing}. Measured bottles: ${sum} total, ${typical} per bottle`,
          `${missing}. Biberones con volumen: ${sum} en total, ${typical} por biberón`);
        return text(`${count} logged, ${sum} total, ${typical} per bottle`, `${count} en el registro, ${sum} en total, ${typical} por biberón`);
      }
      const nursing = validRead(0, true) ? feedPartsWithin(0, nowMinutes, true).filter(group => group.some(entry => entry.type === 'feed')) : [];
      const count = nursing.length;
      const nurseNote = count ? text(` ${count} nursing ${count === 1 ? 'session' : 'sessions'} logged today.`,
        ` ${count} ${count === 1 ? 'toma al pecho registrada' : 'tomas al pecho registradas'} hoy.`) : '';
      const current = text(`${byHour} today, ${breakdown(currentBottles)}.`, `${byHour} de hoy, ${breakdown(currentBottles)}.`);
      const change = comparing && difference(total(currentBottles), total(priorBottles), volume);
      const past = comparing ? text(` Yesterday, ${breakdown(priorBottles)} at that time (${change} today).`,
        ` Ayer, ${breakdown(priorBottles)} a esa hora (${change} hoy).`) : '';
      const bottlesN = currentBottles.length, missing = currentBottles.filter(entry => !hasAmount(entry)).length;
      // The headline counts every bottle, measured or not; the mL total and yesterday stay in the body sentence (owner, 2026-11-19).
      // Spanish "7 biberones · 2 al pecho" wraps at 320 px, so in Spanish the nursing count moves to the note, beside its dot.
      const headline = [text(`${bottlesN} ${bottlesN === 1 ? 'bottle' : 'bottles'}`, `${bottlesN} ${bottlesN === 1 ? 'biberón' : 'biberones'}`),
        count && text(`${count} nursing`, '')].filter(Boolean).join(' · ');
      const notes = [
        count && text('Nursing.', `${count} al pecho.`),
        missing && text(`${missing} ${missing === 1 ? 'bottle has' : 'bottles have'} no amount.`, `${missing} ${missing === 1 ? 'biberón' : 'biberones'} sin cantidad.`),
      ].filter(Boolean);
      // The bar numbers are bare, so the title names the unit (owner review, 2026-11-19).
      const unit = units === 'us' ? 'oz' : 'mL';
      add('bottles', 'breakdown', text(`Bottle volumes, ${unit}`, `Biberones, ${unit}`), current + past + nurseNote,
        [...currentBottles, ...(comparing ? priorBottles : []), ...nursing.flat()],
        {headline, note:notes.join(' '), noteMark:count ? 'nurse' : '',
          viz:{kind:'timeline', now:nowMinutes,
            marks:[
            ...currentBottles.map(entry => ({t:entry.t, ml:hasAmount(entry) ? entry.ml : null, shown:hasAmount(entry) ? volumeNumber(entry.ml) : '?'})),
            ...nursing.map(group => group.find(entry => entry.type === 'feed')).filter(Boolean).map(entry => ({t:entry.t, nurse:true}))]}});
    }

    function nightCard() {
      // "Last night" is the night that ended at 7 AM today. Before 7 AM that night is still running, so there is no card (review r1, 2026-11-19).
      if (!sleeps.length || nowMinutes < DAY_START) return;
      const last = -1;
      const recent = range(last - WINDOW + 1, last + 1).map(day => {
        const start = day * DAY + DAY_START + NIGHT_START, stop = (day + 1) * DAY + DAY_START;
        return covered(start, stop, true) ? {day, ...sleepWithin(sleeps, start, stop)} : null;
      }).filter(night => night?.total);
      // Card mix (owner, 2026-11-19): last night against the average per night, drawn like the by-this-time cards.
      // The card needs last night and at least one night before it; the longest stretch stays in the full sentence.
      if (recent.length > 1 && recent.at(-1).day === last) {
        const totals = recent.map(night => Math.round(night.total)), tonight = totals.at(-1), mean = Math.round(average(totals));
        const middle = minutes(median(recent.map(night => night.longest))), past = totals.slice(0, -1), n = past.length;
        const nightsBefore = n === 1 ? text('the night before', 'la noche anterior') : text(`any of the ${n} nights before`, `cualquiera de las ${n} noches anteriores`);
        // Same verdict rule as by-this-time: outside the range of the nights before, or about average.
        const headline = tonight < Math.min(...past) ? text(`Less than ${nightsBefore}`, `Menos que ${nightsBefore}`)
          : tonight > Math.max(...past) ? text(`More than ${nightsBefore}`, `Más que ${nightsBefore}`) : text('About average', 'Cerca del promedio');
        const delta = tonight - mean, amount = minutes(Math.abs(delta)), avg = minutes(mean);
        const note = !delta ? text(`The average is ${avg}`, `Promedio: ${avg}.`)
          : text(`${amount} ${delta < 0 ? 'under' : 'over'} the average ${avg}`, `${amount} ${delta < 0 ? 'menos' : 'más'}. Promedio: ${avg}.`);
        const over = recent.length === WINDOW ? text('the last 7 completed nights', 'las últimas 7 noches completas') : text(`${recent.length} completed nights`, `${recent.length} noches completas`);
        const compared = !delta ? text(`the same as the average over ${over}`, `igual que el promedio de ${over}`)
          : text(`${amount} ${delta < 0 ? 'under' : 'over'} the average of ${avg} over ${over}`, `${amount} ${delta < 0 ? 'menos' : 'más'} que el promedio de ${avg} en ${over}`);
        add('sleep', 'night', text('Night sleep · 7 PM to 7 AM', 'Noche · 7 p. m. a 7 a. m.'),
          text(`Last night, ${minutes(tonight)} logged, ${compared}. Median longest stretch ${middle}.`,
            `Anoche, ${minutes(tonight)} en el registro, ${compared}. Mediana del tramo más largo: ${middle}.`), evidenceFor(recent),
          {headline, note, viz:{kind:'columns', usual:mean, floor:0, usualLabel:text('average', 'promedio'),
            letters:recent.map(night => weekdays.format(new Date(dates.date(night.day)))),
            bars:recent.map((night, i) => ({value:totals[i], today:i === recent.length - 1}))}});
      }
    }
    nightCard();
    aboutHer({text, add, dates, child, read, sleeps, bottles, groups, diapers, minutes, volume, shortDate, dayOf, nowMinutes});
    return cards;
  }

  // About-her facts (card mix, owner, 2026-11-19): records only, no AI. Home loads about the last 1 to 2 months of records.
  // With every day since birth loaded the cards say "so far"; otherwise they name the first loaded day and the
  // round-number cards (a count since birth) do not show. A tie keeps the earliest record.
  const ROUND = [50, 100, 250, 500, 1000];
  function aboutHer({text, add, dates, child, read, sleeps, bottles, groups, diapers, minutes, volume, shortDate, dayOf, nowMinutes}) {
    const birth = child?.birthDate ? Math.round((Date.parse(child.birthDate) - Date.parse(dates.date(0))) / DAY_MS) : null;
    // The loaded window is the run of loaded days that ends today; a gap starts it after the gap (review r1, 2026-11-19).
    let loadedFrom = 0;
    while (read(loadedFrom - 1)) loadedFrom--;
    // One window for the title, the records and "so far" (review r2, 2026-11-19): from birth when the run reaches it, else from the
    // first day of the run. It needs at least 7 days, so a baby under 7 days old gets no about-her card.
    const full = birth !== null && birth >= loadedFrom, start = full ? birth : loadedFrom;
    if (1 - start < 7) return;
    const since = shortDate(start), inWindow = entry => dayOf(entry.t) >= start;
    sleeps = sleeps.filter(inWindow); bottles = bottles.filter(inWindow); groups = groups.filter(group => inWindow(group[0])); diapers = diapers.filter(inWindow);
    const best = (list, value) => list.reduce((top, entry) => value(entry) > value(top) ? entry : top, list[0]);
    const record = (topic, window, entry, [en, es], headline) => {
      const date = shortDate(dayOf(entry.t));
      add(topic, window, text(en, es), text(`${en}: ${headline}, logged ${date}.`, `${es}: ${headline}, registrado el ${date}.`),
        [entry], {headline, note:date, big:true, fun:true});
    };
    if (sleeps.length) {
      const top = best(sleeps, entry => entry.dur);
      record('sleep', 'longest', top, full ? ['Longest sleep so far', 'El sueño más largo'] : [`Longest sleep since ${since}`, `El sueño más largo desde el ${since}`], minutes(top.dur));
    }
    const measured = bottles.filter(entry => entry.unit === 'ml' && Number.isFinite(entry.ml) && entry.ml > 0);
    if (measured.length) {
      const top = best(measured, entry => entry.ml);
      record('bottles', 'largest', top, full ? ['Largest bottle so far', 'El biberón más grande'] : [`Largest bottle since ${since}`, `El biberón más grande desde el ${since}`], volume(top.ml));
    }
    if (!full) return;
    const counts = [
      {topic:'feeds', list:groups.map(group => group[0]), title:n => text(`Feed number ${n}`, `Toma número ${n}`)},
      {topic:'diapers', list:diapers, title:n => text(`Diaper number ${n}`, `Pañal número ${n}`)},
    ];
    // The note says where the count starts, not a total: more may follow the round number on the same day (review r1).
    for (const {topic, list, title} of counts) {
      const n = ROUND.findLast(round => round <= list.length), reached = list[n - 1];
      if (!reached || dayOf(reached.t) !== 0 || reached.t > nowMinutes) continue;
      add(topic, `number-${n}`, title(n), text(`${title(n)} was logged today, counting since ${since}.`, `${title(n)}: registrado hoy, contando desde el ${since}.`),
        [reached], {headline:text('Today', 'Hoy'), note:text(`Counted since ${since}`, `Contados desde el ${since}`), big:true, fun:true});
    }
  }

  return {pool, historyStart};
})();
