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

  function pool({entries, child, today, nowMinutes, readDates, permissions, lang, units, handoffAt} = {}) {
    const dates = calendar(today);
    if (!dates || !Number.isFinite(nowMinutes) || nowMinutes < 0 || nowMinutes >= DAY || !readDates?.has(today)) return [];
    const {sleepWithin, sleepEnd, feedSessionKey, DAY_START, NIGHT_START, WINDOW} = LittleDaysTrends;
    const es = lang === 'es', text = (en, spanish) => es ? spanish : en;
    const locale = text('en-US', 'es-MX');
    const numbers = new Intl.NumberFormat(locale, {maximumFractionDigits:1});
    const clocks = new Intl.DateTimeFormat(locale, {timeZone:'UTC', hour:'numeric', minute:'2-digit', hour12:true});
    const months = new Intl.DateTimeFormat(locale, {timeZone:'UTC', month:'long', year:'numeric'});
    const clock = minute => clocks.format(Math.floor(minute) * 60000);
    const number = value => numbers.format(value);
    const minutes = value => number(value) + ' min';
    const volume = value => units === 'us' ? number(value / 29.5735) + ' oz' : number(value) + ' mL';
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
    const add = (topic, window, title, body, evidence) => {
      const unique = [...new Map(evidence.map(entry => [entry.id, entry])).values()].sort((a,b) => b.t - a.t);
      cards.push({id:`trend:${topic}:${window}:${today}`, kind:'record', topic, title, body,
        evidence:unique.map(entry => ({kind:'record',id:entry.id,label:text('View record','Ver registro'),date:dates.date(dayOf(entry.t))}))});
    };
    const metrics = [
      {topic:'feeds', name:text('Feeds','Tomas'), noun:text(['feed','feeds'],['toma','tomas']), format:number, prior:true, has:groups.length,
        measure(start, end, inclusive) {
          const selected = feedPartsWithin(start, end, inclusive);
          return {value:selected.length, evidence:selected.flat()};
        }},
      {topic:'diapers', name:text('Diaper changes','Cambios de pañal'), noun:text(['diaper change','diaper changes'],['cambio de pañal','cambios de pañal']), format:number, has:diapers.length,
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
    function difference(current, past, format) {
      const delta = current - past, amount = format(Math.abs(delta));
      if (amount === format(0)) return text('no change','sin cambio');
      return delta > 0 ? text(`${amount} more`, `${amount} más`) : text(`${amount} fewer`, `${amount} menos`);
    }

    const longer = [];
    for (const metric of metrics.filter(item => item.has)) {
      const {topic, name, noun, format} = metric;
      const [daily, yesterday] = samples(metric, [0,-1], nowMinutes);
      if (daily?.value) {
        const current = format(daily.value), past = yesterday?.value ? format(yesterday.value) : null;
        const days = samples(metric, week.filter(fromBirth), nowMinutes);
        const eligible = days.filter(day => day?.value > 0), values = valuesOf(eligible);
        if (days.every(Boolean) && values.length) {
          const usual = format(median(values)), low = format(Math.min(...values)), high = format(Math.max(...values));
          const count = values.length, dayLabel = count === 1 ? text('day','día') : text('days','días');
          add(topic, 'baseline', text(`${name} by this time`, `${name} a esta hora`),
            text(`${byHour}, ${current} logged today. Last week, median ${usual}, range ${low} to ${high} across ${count} ${dayLabel} with logs by this time.`,
              `${byHour}, ${current} en el registro de hoy. La última semana, mediana ${usual}, rango de ${low} a ${high} en ${count} ${dayLabel} con registros a esta hora.`),
            [...daily.evidence, ...evidenceFor(eligible)]);
        }
        const value = noun ? `${current} ${noun[Number(daily.value !== 1)]}` : current;
        const logged = text(`${byHour}, ${value} logged today`, `${byHour}, ${value} en el registro de hoy`);
        const change = past && difference(daily.value, yesterday.value, format);
        add(topic, 'day', text(`${name} today`, `${name} hoy`), past
          ? text(`${logged} and ${past} yesterday (${change}).`, `${logged} y ${past} ayer (${change}).`) : logged + '.',
          [...daily.evidence, ...(past ? yesterday.evidence : [])]);
      }

      longer.push(() => {
        function coverage(window, days, label) {
          if (!days.every(Boolean)) return;
          const count = days.filter(day => day.value > 0).length, total = days.length;
          if (!count || count === total) return;
          add(topic, window, `${name} · ${label}`, text(`${name} logged on ${count} of ${total} days.`,
            `${name} en el registro de ${count} de ${total} días.`), evidenceFor(days));
        }
        function compare(window, left, right, first, second) {
          const current = average(valuesOf(left)), past = average(valuesOf(right));
          const change = difference(current, past, format);
          add(topic, window, text(`${name} per day`, `${name} por día`),
            text(`${format(current)} logged per day ${first} and ${format(past)} ${second} (${change} per day).`,
              `${format(current)} por día en el registro de ${first} y ${format(past)} en ${second} (${change} por día).`), evidenceFor([...left,...right]));
        }
        const recent = samples(metric, week), previous = samples(metric, earlierWeek);
        const weekLabel = text('Last 7 finished days','Últimos 7 días completos');
        if (complete(recent)) {
          const daily = format(average(valuesOf(recent)));
          add(topic, 'seven', `${name} · ${weekLabel}`,
            text(`${daily} logged per day over the last 7 finished days.`, `${daily} por día en el registro de los últimos 7 días completos.`), evidenceFor(recent));
          if (complete(previous)) compare('week', recent, previous, text('over the last 7 finished days','los últimos 7 días completos'),
            text('over the preceding 7 days','los 7 días anteriores'));
        } else {
          coverage('seven', recent, weekLabel);
        }
        const recentMonth = samples(metric, dates.month), earlierMonth = samples(metric, dates.earlier);
        const [first, second] = [dates.month, dates.earlier].map(days => months.format(new Date(dates.date(days[0]))));
        if (complete(recentMonth) && complete(earlierMonth)) {
          compare('month', recentMonth, earlierMonth, text('in ' + first, first), text('in ' + second, second));
        } else {
          coverage('month-coverage', recentMonth, first);
          coverage('previous-month-coverage', earlierMonth, second);
        }
      });
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
      add('bottles', 'breakdown', text('Bottle volumes','Volumen de los biberones'), current + past + nurseNote,
        [...currentBottles, ...(comparing ? priorBottles : []), ...nursing.flat()]);
    }

    const needsPrior = allowed('feedings') || allowed('sleep');
    const hasHandoff = Number.isFinite(handoffAt) && handoffAt <= nowMinutes && handoffAt >= dates.earlier[0] * DAY && covered(handoffAt, nowMinutes, needsPrior);
    const start = hasHandoff ? handoffAt : DAY_START - (nowMinutes < DAY_START ? DAY : 0);
    if (covered(start, nowMinutes, needsPrior)) {
      const logged = metrics.map(metric => ({metric, ...metric.measure(start, nowMinutes, true)})).filter(item => item.value > 0);
      const evidence = evidenceFor(logged);
      if (evidence.length) {
        const latest = Math.max(...evidence.map(entry => entry.type === 'sleep' ? sleepEnd(entry) : entry.t));
        const dateTime = minute => dayOf(minute) === 0 ? clock(minute) : `${clock(minute)} · ${dates.date(dayOf(minute))}`;
        const summary = logged.map(({metric,value}) => `${metric.name} ${metric.format(value)}`).join(' · ');
        const title = hasHandoff ? text(`Since the handoff at ${dateTime(start)}`, `Desde el relevo a las ${dateTime(start)}`)
          : text(`Since ${dateTime(start)}`, `Desde las ${dateTime(start)}`);
        add('handoff', 'handoff', title, text(`Logged: ${summary}. Latest activity at ${dateTime(latest)}.`,
          `Registro: ${summary}. Última actividad a las ${dateTime(latest)}.`), evidence);
      }
    }

    if (sleeps.length) {
      const last = nowMinutes >= DAY_START ? -1 : -2;
      function nights(first, end) {
        return range(first, end).map(day => {
          const start = day * DAY + DAY_START + NIGHT_START, stop = (day + 1) * DAY + DAY_START;
          return covered(start, stop, true) ? sleepWithin(sleeps, start, stop) : null;
        }).filter(night => night?.total);
      }
      const recent = nights(last - WINDOW + 1, last + 1), earlier = nights(last - 2 * WINDOW + 1, last - WINDOW + 1);
      if (recent.length) {
        const middle = list => minutes(median(list.map(night => night.longest)));
        const total = list => minutes(average(list.map(night => night.total)));
        const summary = text(`Over ${recent.length} of the last 7 completed nights, ${total(recent)} logged per night. Median longest stretch ${middle(recent)}.`,
          `En ${recent.length} de las últimas 7 noches completas, ${total(recent)} por noche en el registro. Mediana del tramo más largo de ${middle(recent)}.`);
        const compare = recent.length === WINDOW && earlier.length === WINDOW;
        const past = compare ? text(` The previous week averaged ${total(earlier)} per night, with a median longest stretch of ${middle(earlier)}.`,
          ` La semana anterior tuvo un promedio de ${total(earlier)} por noche y una mediana del tramo más largo de ${middle(earlier)}.`) : '';
        add('sleep', 'night', text('Night sleep · 7 PM to 7 AM','Sueño nocturno · 7 p. m. a 7 a. m.'), summary + past,
          evidenceFor(compare ? [...recent,...earlier] : recent));
      }
    }
    longer.forEach(addPeriod => addPeriod());
    return cards;
  }

  return {pool, historyStart};
})();
