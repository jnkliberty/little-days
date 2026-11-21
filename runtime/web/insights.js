globalThis.LittleDaysInsights = (() => {
  const resource = entry => ({feed:'feedings', bottle:'feedings', diaper:'changes', sleep:'sleep'}[entry.type]
    || (entry.type === 'other' ? {tummy:'tummy-times', mile:'notes'}[entry.what] : null));
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
  const shiftDate = (date, days) => new Date(Date.parse(date) + days * 86400000).toISOString().slice(0,10);
  const yesterday = today => shiftDate(today, -1);

  // Tummy time: one card. The headline is today's minutes (large number), the note gives the sessions and yesterday.
  // With no tummy time today, the card reads yesterday's. A session without a finished duration counts as a session only.
  function tummyCard([todayList, yesterdayList], today, nowMinutes, text) {
    const timed = list => list.filter(entry => Number.isFinite(entry.dur) && entry.dur > 0 && entry.dur <= 1440 && entry.t + entry.dur <= nowMinutes);
    const minutesOf = list => Math.round(timed(list).reduce((sum, entry) => sum + entry.dur, 0));
    const sessions = n => text(`${n} ${n === 1 ? 'session' : 'sessions'}`, `${n} ${n === 1 ? 'sesión' : 'sesiones'}`);
    const amount = list => timed(list).length ? `${minutesOf(list)} min` : sessions(list.length);
    const isToday = todayList.length > 0, main = isToday ? todayList : yesterdayList;
    if (!main.length) return null;
    const period = isToday ? text('today', 'hoy') : text('yesterday', 'ayer');
    const minutes = minutesOf(main), duration = timed(main).length ? text(`; ${minutes} minutes with recorded duration`, `; ${minutes} minutos con duración registrada`) : '';
    const body = text(`${main.length} ${main.length === 1 ? 'session' : 'sessions'} recorded ${period}${duration}.`,
      `${main.length} ${main.length === 1 ? 'sesión registrada' : 'sesiones registradas'} ${period}${duration}.`);
    const note = [timed(main).length ? sessions(main.length) : '', isToday && yesterdayList.length ? text(`yesterday ${amount(yesterdayList)}`, `ayer ${amount(yesterdayList)}`) : ''].filter(Boolean).join(' · ');
    return {id:`record:tummy:${today}`, kind:'record', topic:'tummy', title:text('Tummy time','Tiempo boca abajo'), body,
      headline:`${amount(main)} ${period}`, note, big:true,
      evidence:[...todayList, ...yesterdayList].map(entry => ({kind:'record', id:entry.id, label:text('View record','Ver registro'), date:entry.t < 0 ? yesterday(today) : today}))};
  }

  // Home order (owner, 2026-11-19): fun, stat, fun, stat. A fun card is a daily fact, a milestone or an about-her fact.
  // When one kind runs out, the rest of the other kind follow. A fact with the same id or the same body shows once.
  function mix(facts) {
    const ids = new Set(), bodies = new Set(), fun = [], stat = [];
    for (const fact of Array.isArray(facts) ? facts : []) {
      const body = typeof fact?.body === 'string' ? fact.body.trim().toLowerCase() : '';
      if (!fact?.id || ids.has(fact.id) || (body && bodies.has(body))) continue;
      ids.add(fact.id);
      if (body) bodies.add(body);
      (fact.kind === 'source' || fact.fun ? fun : stat).push(fact);
    }
    const ordered = [];
    for (let i = 0; i < Math.max(fun.length, stat.length); i++) {
      if (fun[i]) ordered.push(fun[i]);
      if (stat[i]) ordered.push(stat[i]);
    }
    return ordered;
  }

  // A model wrote the daily facts as [English, Spanish] pairs and the server checks only that each slot has text.
  // A card is shown in a language only when that language's slots read as that language, so one card is one language.
  const EN_WORDS = new Set('the and of to is are with your you baby babies when this that from for by can most may they their how while after before'.split(' '));
  const ES_WORDS = new Set('el la los las de del y en un una su sus que por con para al se es más como cuando bebé bebés puede pueden'.split(' '));
  const fitsLanguage = (text, es) => {
    // Quoted words and hyphen-joined syllables ("la-la-la") are examples, not the language of the sentence.
    const own = (typeof text === 'string' ? text : '').replace(/["“”«»][^"“”«»]*["“”«»]|(^|[\s(])['‘][^'’]*['’](?=[\s.,;:!?)]|$)/g, ' ').replace(/[a-záéíóúñü]+(?:-[a-záéíóúñü]+)+/gi, ' ');
    // Distinct marker words count once, so a repeated word or syllable ("la, la, la") does not outvote the sentence.
    const words = new Set(own.toLowerCase().match(/[a-záéíóúñü]+/g) || []);
    const en = [...words].filter(word => EN_WORDS.has(word)).length, sp = [...words].filter(word => ES_WORDS.has(word)).length;
    return es ? en <= sp : sp <= en;
  };
  const pair = value => Array.isArray(value) && value.length >= 2;

  function pool({entries, child, permissions, today, nowMinutes, lang, developmentCards = []} = {}) {
    if (!validDate(today) || !Number.isFinite(nowMinutes) || nowMinutes < 0 || nowMinutes >= 1440) return [];
    const es = lang === 'es', text = (en, spanish) => es ? spanish : en;
    const allowed = name => permissions?.resources?.[name]?.view === true;
    const seen = new Set();
    const records = (Array.isArray(entries) ? entries : []).filter(entry => {
      if (!entry || typeof entry.id !== 'string' || !entry.id || !Number.isFinite(entry.t)
        || entry.t < -1440 || entry.t > nowMinutes || !allowed(resource(entry)) || seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
    const sessions = new Map();
    for (const entry of records.filter(entry => entry.type === 'feed' || entry.type === 'bottle')) {
      const key = entry.sid ? `session:${entry.sid}` : entry.id;
      if (!sessions.has(key)) sessions.set(key, []);
      sessions.get(key).push(entry);
    }
    const facts = [], tummyDays = [];
    for (const offset of [0, -1]) {
      const date = offset === 0 ? today : yesterday(today);
      const period = text(offset === 0 ? 'today' : 'yesterday', offset === 0 ? 'hoy' : 'ayer');
      const inDay = entry => Math.floor(entry.t / 1440) === offset;
      const day = records.filter(inDay);
      const add = (topic, title, body, evidence) => facts.push({id:`record:${topic}:${date}`, kind:'record', topic, title, body,
        evidence:evidence.map(entry => ({kind:'record',id:entry.id,label:text('View record','Ver registro'),date:entry.t < 0 ? yesterday(today) : today}))});
      const feeds = [...sessions.values()].filter(parts => inDay(parts.reduce((first, entry) => entry.t < first.t ? entry : first)));
      if (feeds.length) add('feeds',text('Recorded feeds','Tomas registradas'),text(`${feeds.length} ${feeds.length === 1 ? 'feed' : 'feeds'} recorded ${period}.`,`${feeds.length} ${feeds.length === 1 ? 'toma registrada' : 'tomas registradas'} ${period}.`),feeds.flat());
      tummyDays.push(day.filter(entry => entry.type === 'other' && entry.what === 'tummy'));
      const diapers = day.filter(entry => entry.type === 'diaper' && ['W','D','B'].includes(entry.kind));
      if (diapers.length) add('diapers',text('Recorded diapers','Pañales registrados'),text(`${diapers.length} ${diapers.length === 1 ? 'diaper' : 'diapers'} recorded ${period}.`,`${diapers.length} ${diapers.length === 1 ? 'pañal registrado' : 'pañales registrados'} ${period}.`),diapers);
      const sleeps = day.filter(entry => entry.type === 'sleep' && !entry.live && Number.isFinite(entry.dur) && entry.dur > 0 && entry.dur <= 1440 && entry.t + entry.dur <= nowMinutes);
      if (sleeps.length) {
        const longest = sleeps.reduce((a,b) => a.dur >= b.dur ? a : b);
        add('sleep',text('Longest recorded sleep','Sueño registrado más largo'),text(`${Math.round(longest.dur)} minutes in the longest sleep recorded with a start ${period}.`,`${Math.round(longest.dur)} minutos en el sueño registrado más largo que empezó ${period}.`),[longest]);
      }
      const milestones = day.filter(entry => entry.type === 'other' && entry.what === 'mile' && typeof entry.title === 'string' && entry.title.trim());
      if (milestones.length) {
        const latest = milestones.reduce((a,b) => a.t >= b.t ? a : b);
        add('milestone',text('Milestone','Hito'),text(`Recorded ${period}: ${latest.title.trim()}.`,`Registrado ${period}: ${latest.title.trim()}.`),[latest]);
        facts.at(-1).fun = true;
      }
    }
    const tummy = tummyCard(tummyDays, today, nowMinutes, text);
    if (tummy) facts.push(tummy);
    if (allowed('children')) {
      const slot = es ? 1 : 0;
      // Today's facts, then the 6 days before, newest first (the server sends them in that order; the sort keeps it).
      const first = shiftDate(today, -6);
      const daily = developmentCards.filter(card => validDate(card?.date) && card.date <= today && card.date >= first && pair(card.title) && pair(card.body))
        .map((card, index) => ({card, index})).sort((a, b) => b.card.date.localeCompare(a.card.date) || a.index - b.index).map(item => item.card);
      for (const card of daily) {
        if (!fitsLanguage(card.title[slot], es) || !fitsLanguage(card.body[slot], es)) continue;
        // The server gives the English article title as the label in both languages. A Spanish label that only repeats it
        // is left out; the link keeps its own word. A label with its own Spanish wording ("... · inglés") stays.
        const copied = es && pair(card.source) && card.source[1] === card.source[0] && /\S+\s+\S+\s+\S+/.test(card.source[0]);
        const label = pair(card.source) && !copied ? card.source[slot] : '';
        facts.push({id:`source:${card.id}`,kind:'source',topic:card.topic[0],title:card.title[slot],body:card.body[slot],evidence:[{kind:'source',id:card.id,label,url:card.url,date:card.sourceDate}]});
      }
    }
    return facts;
  }

  function next(facts, currentId, recentIds = []) {
    if (!Array.isArray(facts) || !facts.length) return null;
    if (facts.length === 1) return facts[0];
    const current = facts.find(fact => fact.id === currentId);
    const others = facts.filter(fact => fact.id !== currentId);
    const fresh = others.filter(fact => !recentIds.includes(fact.id));
    let candidates = fresh.length ? fresh : others;
    const otherKind = current ? candidates.filter(fact => fact.kind !== current.kind) : [];
    if (otherKind.length) candidates = otherKind;
    return candidates.find(fact => fact.topic !== current?.topic) || candidates[0];
  }
  return {pool,next,mix};
})();
