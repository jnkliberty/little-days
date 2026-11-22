/* Sleep plan data (approved STOP 0 text from research/2026-11-21-age-norms.md, lines 95-162)
   and schedule calculations for Group 4 (plan 2026-11-21, lines 255-267).
   Plain data + pure functions: no DOM, no network, no AI call. Safe sleep is never copied here;
   it is loaded from LittleDaysCareGuidance.byId('care-safe-sleep', spanish). */
globalThis.LittleDaysSleepGuides = (() => {
  'use strict';
  const SETTLING_AGE_DAYS = 183; // D4: 6 months (30.44 * 6 = 182.64 -> day 183)
  const DAY = 1440;
  const trends = () => globalThis.LittleDaysTrends;
  const cryLog = () => globalThis.LittleDaysCryLog;
  const fc = () => globalThis.LittleDaysForecast;
  const guidance = () => globalThis.LittleDaysCareGuidance;
  const round5 = m => Math.round(m / 5) * 5;
  const clockOf = m => ((Math.round(m) % DAY) + DAY) % DAY;

  const BANDS = [
    {
      id: 'A', fromDays: 0, toDays: 121,
      label: ['0 to 3 months', '0 a 3 meses'],
      strategies: [
        {
          code: 'A1', settling: false, src: 'NHS', read: '2026-11-21',
          url: 'https://www.nhs.uk/baby/caring-for-a-newborn/helping-your-baby-to-sleep/',
          text: [
            'Show your baby that day and night are different. In the day, open the curtains, play, and do not worry about normal noise while your baby sleeps.',
            'Enséñele a su bebé que el día y la noche son distintos. De día, abra las cortinas, juegue y no se preocupe por los ruidos normales mientras su bebé duerme.',
          ],
          quote: '"It\'s a good idea to teach your baby that night-time is different from daytime from the start. During the day, open curtains, play games and do not worry too much about everyday noises when they sleep."',
        },
        {
          code: 'A2', settling: false, src: 'AAP', read: '2026-11-21',
          url: 'https://www.healthychildren.org/English/ages-stages/baby/sleep/Pages/getting-your-baby-to-sleep.aspx',
          text: [
            'Keep nights calm and quiet. During night feeds and changes, try not to wake your baby more. If you talk, talk softly.',
            'Mantenga las noches tranquilas y en silencio. Al darle de comer o cambiar el pañal de noche, trate de no despertar más a su bebé. Si habla, hable en voz baja.',
          ],
          quote: '"Stay calm & quiet at night. Try not to stimulate or wake babies when you feed or change them during the night. If you speak, speak softly."',
        },
        {
          code: 'A3', settling: false, src: 'MedlinePlus', read: '2026-11-21',
          url: 'https://medlineplus.gov/ency/article/002392.htm',
          text: [
            "Learn your baby's sleepy signs: crying, eye rubbing and fussiness.",
            'Aprenda las señales de sueño de su bebé: llanto, frotarse los ojos e inquietud.',
          ],
          quote: '"Signs that your baby is becoming sleepy include:" followed by the list items "Crying", "Eye rubbing", "Fussiness"',
        },
        {
          code: 'A4', settling: false, src: 'MedlinePlus', read: '2026-11-21',
          url: 'https://medlineplus.gov/ency/article/002392.htm',
          text: [
            'Try to put your baby to bed sleepy, but not yet asleep.',
            'Intente acostar a su bebé cuando tenga sueño, pero antes de que se duerma.',
          ],
          quote: '"Try putting your baby to bed sleepy, but not yet asleep."',
        },
        {
          code: 'A5', settling: false, src: 'MedlinePlus', read: '2026-11-21',
          url: 'https://medlineplus.gov/ency/article/002392.htm',
          text: [
            'When your baby wakes at night to eat, keep the room dark and quiet.',
            'Cuando su bebé se despierte de noche para comer, mantenga el cuarto oscuro y en silencio.',
          ],
          quote: '"When your baby wakes up at night to eat, keep the room dark and quiet."',
        },
      ],
      weeks: [
        ['Week 1: Do A1 each day and A2 each night.', 'Semana 1: Haga A1 cada día y A2 cada noche.'],
        ['Week 2: Watch for the sleepy signs in A3 and note which ones you see.', 'Semana 2: Fíjese en las señales de sueño de A3 y anote cuáles ve.'],
        ['Week 3: Try A4 at one sleep each day.', 'Semana 3: Pruebe A4 en un sueño cada día.'],
        ['Week 4: Keep A5 at every night feed.', 'Semana 4: Siga A5 en cada toma de la noche.'],
      ],
    },
    {
      id: 'B', fromDays: 122, toDays: 182,
      label: ['4 to 5 months', '4 a 5 meses'],
      strategies: [
        {
          code: 'B1', settling: false, src: 'AAP', read: '2026-11-21',
          url: 'https://www.healthychildren.org/English/ages-stages/baby/sleep/Pages/getting-your-baby-to-sleep.aspx',
          text: [
            'Put your baby to bed drowsy, not asleep. This helps your baby learn to fall asleep alone, in their own bed.',
            'Acueste a su bebé con sueño, antes de que se duerma. Así aprende a dormirse por su cuenta, en su propia cama.',
          ],
          quote: '"Put babies to bed when they are drowsy. Do not wait until babies are asleep. This helps babies learn to fall asleep on their own, in their own bed."',
        },
        {
          code: 'B2', settling: false, src: 'AAP', read: '2026-11-21',
          url: 'https://www.healthychildren.org/English/healthy-living/sleep/Pages/healthy-sleep-habits-how-many-hours-does-your-child-need.aspx',
          text: [
            'Keep the same times each day for waking, meals, naps and play. This helps your baby feel secure and makes bedtime smoother.',
            'Mantenga los mismos horarios cada día para despertar, comer, tomar siestas y jugar. Esto le da seguridad a su bebé y facilita la hora de dormir.',
          ],
          quote: '"Keep to a regular daily routine. The same waking time (both on weekdays and weekends), mealtimes, nap time and play times will help your child feel secure and comfortable, and help with a smooth bedtime."',
        },
        {
          code: 'B3', settling: false, src: 'NHS', read: '2026-11-21',
          url: 'https://www.nhs.uk/baby/caring-for-a-newborn/helping-your-baby-to-sleep/',
          text: [
            'Start a simple, soothing bedtime routine. It may help your baby settle.',
            'Empiece una rutina sencilla y tranquila antes de dormir. Puede ayudar a que su bebé se calme.',
          ],
          quote: '"Getting your baby into a simple, soothing bedtime routine may help them settle and can be a great opportunity to have 1-to-1 time with your baby."',
        },
        {
          code: 'B4', settling: false, src: 'MedlinePlus', read: '2026-11-21',
          url: 'https://medlineplus.gov/ency/article/002392.htm',
          text: [
            'Give the last night feed shortly before bed. Do not put your baby to bed with a bottle. It can cause tooth decay.',
            'Dé la última toma de la noche poco antes de acostar a su bebé. No acueste a su bebé con el biberón. Puede causar caries.',
          ],
          quote: '"Give the last nighttime feeding shortly before putting the baby to bed. Never put your baby to bed with a bottle, as it can cause baby bottle tooth decay."',
        },
        {
          code: 'B5', settling: false, src: 'AAP', read: '2026-11-21',
          url: 'https://www.healthychildren.org/English/healthy-living/sleep/Pages/healthy-sleep-habits-how-many-hours-does-your-child-need.aspx',
          text: [
            'Starting solid food early will not help your baby sleep through the night. The AAP says not before about 6 months.',
            'Empezar antes con alimentos sólidos no ayuda a que su bebé duerma toda la noche. La AAP dice que no antes de los 6 meses, más o menos.',
          ],
          quote: '"Don\'t start giving solids before about 6 months of age. Starting solid food sooner will not help your baby sleep through the night."',
        },
      ],
      weeks: [
        ['Week 1: Keep the same daily times from B2.', 'Semana 1: Mantenga los mismos horarios de B2.'],
        ['Week 2: Do the bedtime routine from B3 every night.', 'Semana 2: Haga la rutina de B3 cada noche.'],
        ['Week 3: Try B1 at bedtime, and give the last feed as in B4.', 'Semana 3: Pruebe B1 a la hora de dormir y dé la última toma como en B4.'],
        ['Week 4: Try B1 at naps too.', 'Semana 4: Pruebe B1 también en las siestas.'],
      ],
    },
    {
      id: 'C', fromDays: 183, toDays: 273,
      label: ['6 to 8 months', '6 a 8 meses'],
      strategies: [
        {
          code: 'C1', settling: true, src: 'AAP', read: '2026-11-21',
          url: 'https://www.healthychildren.org/English/ages-stages/baby/sleep/Pages/getting-your-baby-to-sleep.aspx',
          text: [
            'Do not rush in at the first cry. Babies need time to learn to fall back asleep on their own. At 6 months it is normal to wake at night and fall back asleep after a few minutes.',
            'No corra a calmar a su bebé con el primer llanto. Los bebés necesitan tiempo para aprender a volver a dormirse por su cuenta. A los 6 meses es normal despertarse de noche y volver a dormirse después de unos minutos.',
          ],
          quote: '"Do not rush in to soothe a crying baby. Babies need time to put themselves back to sleep, and they need to learn how to fall back asleep on their own. It is normal for a 6-month-old to wake up during the night and then go back to sleep after a few minutes."',
        },
        {
          code: 'C2', settling: true, src: 'AAP', read: '2026-11-21',
          url: 'https://www.healthychildren.org/English/tips-tools/Symptom-Checker/Pages/symptomviewer.aspx?symptom=Crying+Child+-+3+Months+and+Older',
          text: [
            'Check-in method: put your baby in the crib sleepy but awake. Do not take your baby out again. If needed, check on your baby about every 10 minutes until asleep. Use a loving, calm voice.',
            'Método de visitas: acueste a su bebé en la cuna con sueño, pero antes de que se duerma. No vuelva a sacar a su bebé de la cuna. Si hace falta, vaya a ver a su bebé cada 10 minutos, más o menos, hasta que se duerma. Hágalo con cariño y con voz tranquila.',
          ],
          quote: '"Place your child in the crib "sleepy but awake."" / "Once placed in the crib, don\'t take your child out again." / "If needed, visit your child every 10 minutes or so until asleep." / "Do all of this in a loving way with a calm voice." (consecutive list items, guide "Crying Child - 3 Months and Older", Barton Schmitt MD, FAAP)',
        },
        {
          code: 'C3', settling: false, src: 'AAP', read: '2026-11-21',
          url: 'https://www.healthychildren.org/English/tips-tools/Symptom-Checker/Pages/symptomviewer.aspx?symptom=Crying+Child+-+3+Months+and+Older',
          text: [
            'When your baby wakes at night, it is fine to hold your baby until calm.',
            'Si su bebé se despierta de noche, puede cargar a su bebé hasta que se calme.',
          ],
          quote: '"For waking at night, it\'s fine to hold your child until calm."',
        },
        {
          code: 'C4', settling: false, src: 'MedlinePlus', read: '2026-11-21',
          url: 'https://medlineplus.gov/ency/article/002392.htm',
          text: [
            'Keep night feeds short and quiet. Do not play. After the feed, burp and calm your baby, then put your baby back to bed.',
            'Haga las tomas de la noche cortas y tranquilas. No juegue con su bebé. Después de la toma, sáquele el aire, calme a su bebé y vuelva a acostar a su bebé en la cama.',
          ],
          quote: '"Keep the feeding as brief and low-key as possible. Don\'t entertain your baby." / "When your baby has been fed, burped, and calmed, return them to bed."',
        },
        {
          code: 'C5', settling: false, src: 'AAP', read: '2026-11-21',
          url: 'https://www.healthychildren.org/English/healthy-living/sleep/Pages/healthy-sleep-habits-how-many-hours-does-your-child-need.aspx',
          text: [
            "Talk with your pediatrician about your baby's sleep. Most sleep problems are easily treated.",
            'Hable con el pediatra sobre el sueño de su bebé. La mayoría de los problemas de sueño se tratan con facilidad.',
          ],
          quote: '"Talk to your child\'s pediatrician about sleep. Discuss your child\'s sleep habits and problems with your pediatrician, as most sleep problems are easily treated."',
        },
      ],
      weeks: [
        ['Week 1: Keep every night feed as in C4.', 'Semana 1: Haga cada toma de la noche como en C4.'],
        ['Week 2: Use C2 at bedtime only.', 'Semana 2: Use C2 solo a la hora de dormir.'],
        ['Week 3: Use C2 at naps too. At night waking, use C1, then C3 if needed.', 'Semana 3: Use C2 también en las siestas. Si se despierta de noche, use C1 y después C3 si hace falta.'],
        ['Week 4: Keep the same steps. If sleep is still hard, see C5.', 'Semana 4: Siga los mismos pasos. Si el sueño sigue difícil, vea C5.'],
      ],
    },
    {
      id: 'D', fromDays: 274, toDays: 365,
      label: ['9 to 12 months', '9 a 12 meses'],
      strategies: [
        {
          code: 'D1', settling: true, src: 'MedlinePlus', read: '2026-11-21',
          url: 'https://medlineplus.gov/ency/article/002392.htm',
          text: [
            'If your baby cries in bed because they do not want to be away from you, go in, speak calmly and rub their back or head. Do not take your baby out of bed. When your baby is calm, leave the room.',
            'Si su bebé llora en la cama porque no quiere separarse de usted, entre, hable con voz tranquila y sóbele la espalda o la cabeza. No saque a su bebé de la cama. Cuando se calme, salga del cuarto.',
          ],
          quote: '"Your baby may cry when you lay them in their bed, because they fear being away from you. This is called separation anxiety. Simply go in, speak in a calm voice, and rub your baby\'s back or head. Don\'t take your baby out of the bed. Once they have calmed down, leave the room."',
        },
        {
          code: 'D2', settling: true, src: 'AAP', read: '2026-11-21',
          url: 'https://www.healthychildren.org/English/tips-tools/Symptom-Checker/Pages/symptomviewer.aspx?symptom=Crying+Child+-+3+Months+and+Older',
          text: [
            'End the feed before your baby falls asleep.',
            'Termine la toma antes de que su bebé se duerma.',
          ],
          quote: '"Never feed until asleep. Always stop before asleep."',
        },
        {
          code: 'D3', settling: false, src: 'NHS', read: '2026-11-21',
          url: 'https://www.nhs.uk/baby/caring-for-a-newborn/helping-your-baby-to-sleep/',
          text: [
            'Keep a similar bedtime routine as your baby grows. Avoid too much excitement right before bed.',
            'Mantenga una rutina parecida antes de dormir mientras su bebé crece. Evite mucha emoción justo antes de acostarse.',
          ],
          quote: '"As your child gets older, it can be helpful to keep to a similar bedtime routine. Too much excitement and stimulation just before bedtime can wake your child up again."',
        },
        {
          code: 'D4', settling: false, src: 'AAP', read: '2026-11-21',
          url: 'https://www.healthychildren.org/English/healthy-living/sleep/Pages/healthy-sleep-habits-how-many-hours-does-your-child-need.aspx',
          text: [
            'Use sleep routines you can do anywhere, so you can help your baby sleep wherever you are.',
            'Use rutinas de sueño que pueda hacer en cualquier lugar, para ayudar a su bebé a dormir donde esté.',
          ],
          quote: '"Make sure the sleep routines you use can be used anywhere, so you can help your child get to sleep wherever you may be."',
        },
        {
          code: 'D5', settling: false, src: 'MedlinePlus', read: '2026-11-21',
          url: 'https://medlineplus.gov/ency/article/002392.htm',
          text: [
            'By 9 months, most babies can sleep at least 8 to 10 hours without a night feed. They still wake at night, and over time they learn to settle and fall back asleep.',
            'A los 9 meses, la mayoría de los bebés pueden dormir al menos 8 a 10 horas sin comer de noche. Todavía se despiertan, y con el tiempo aprenden a calmarse y volver a dormirse.',
          ],
          quote: '"By age 9 months, if not sooner, most infants are able to sleep for at least 8 to 10 hours without needing a nighttime feeding. Infants will still wake up during the night. However, over time, your infant will learn to self-soothe and fall back asleep."',
        },
      ],
      weeks: [
        ['Week 1: Keep the routine from D3, in a form that works anywhere (D4).', 'Semana 1: Siga la rutina de D3, de una forma que funcione en cualquier lugar (D4).'],
        ['Week 2: Use D2 at the bedtime feed.', 'Semana 2: Use D2 en la toma antes de dormir.'],
        ['Week 3: Use D1 when your baby cries at bedtime.', 'Semana 3: Use D1 cuando su bebé llore a la hora de dormir.'],
        ['Week 4: Use D1 at night waking too.', 'Semana 4: Use D1 también cuando se despierte de noche.'],
      ],
    },
  ];

  function planForAge(ageDays, spanish = false) {
    const lang = spanish ? 1 : 0;
    const safeSleep = guidance().byId('care-safe-sleep', spanish);
    if (typeof ageDays !== 'number' || !Number.isFinite(ageDays) || ageDays < 0) {
      return {band: null, safeSleep, strategies: [], weeks: [], settlingUnlocked: false, hasBirthDate: false, over12Months: false};
    }
    const raw = BANDS.find(b => ageDays >= b.fromDays && ageDays <= b.toDays) || BANDS[BANDS.length - 1];
    const settlingUnlocked = ageDays >= SETTLING_AGE_DAYS;
    const strategies = raw.strategies
      .filter(s => !s.settling || settlingUnlocked)
      .map(s => ({code: s.code, settling: s.settling, src: s.src, read: s.read, url: s.url, text: s.text[lang], quote: s.quote}));
    return {
      band: {id: raw.id, fromDays: raw.fromDays, toDays: raw.toDays, label: raw.label[lang]},
      safeSleep,
      strategies,
      weeks: raw.weeks.map(w => w[lang]),
      settlingUnlocked,
      hasBirthDate: true,
      over12Months: ageDays > 365,
    };
  }

  function mergedSleeps(entries, stopMin) {
    const list = cryLog().sleepPoints(Array.isArray(entries) ? entries : [], stopMin);
    return list.reduce((out, p) => {
      const prev = out[out.length - 1];
      if (prev && p.start <= prev.end) prev.end = Math.max(prev.end, p.end);
      else out.push({start: p.start, end: p.end});
      return out;
    }, []);
  }

  function daySleepMetrics(sleeps, endOffset) {
    const {startOf, NIGHT_START} = trends();
    const napCounts = [], napDurs = [], bedRels = [], wakeRels = [];
    for (let off = endOffset - 7; off < endOffset; off++) {
      const base = startOf(off), nightStart = base + NIGHT_START, nightEnd = base + DAY;
      const dayNaps = sleeps.filter(p => p.start >= base && p.start < nightStart);
      const evening = sleeps.filter(p => p.start >= nightStart - 120 && p.start < nightEnd && p.end > nightStart);
      if (dayNaps.length || evening.length) napCounts.push(dayNaps.length);
      for (const p of dayNaps) napDurs.push(Math.max(5, p.end - p.start));
      if (evening.length) {
        bedRels.push(evening[0].start - base);
        const morning = evening.filter(p => p.end >= nightStart + 360);
        wakeRels.push((morning.length ? morning[morning.length - 1] : evening[evening.length - 1]).end - base);
      }
    }
    return {napCounts, napDurs, bedRels, wakeRels};
  }

  function buildScheduleRows(wakeMin, bedMin, napCount, awakeMin, napMin, shiftMin) {
    const rows = [{kind: 'wake', usualMin: wakeMin, shiftedMin: wakeMin, changed: false}];
    const bedRel = bedMin != null ? (bedMin < wakeMin ? bedMin + DAY : bedMin) : wakeMin + 13 * 60;
    let cursor = wakeMin;
    for (let i = 1; i <= napCount; i++) {
      const start = round5(cursor + awakeMin);
      if (start >= bedRel - 30) break;
      const shifted = i === 1 ? start : Math.max(wakeMin + awakeMin + 15, round5(start - shiftMin));
      rows.push({kind: 'nap', index: i, usualMin: clockOf(start), shiftedMin: clockOf(shifted), changed: i > 1 && shifted !== start});
      cursor = start + napMin;
    }
    const usualBed = clockOf(bedRel);
    const shiftedBed = clockOf(Math.max(cursor - shiftMin + awakeMin, bedRel - shiftMin));
    rows.push({kind: 'bed', usualMin: usualBed, shiftedMin: shiftedBed, changed: shiftedBed !== usualBed});
    return rows;
  }

  function scheduleFromEntries({entries = [], nowMin} = {}) {
    const minGaps = fc().MIN_GAPS;
    if (!Number.isFinite(nowMin)) return {ready: false, gaps: 0, minGaps};
    const endOffset = trends().offsetOf(nowMin);
    const stopMin = trends().startOf(endOffset);
    const sleeps = mergedSleeps(entries, stopMin);
    const gaps = cryLog().gapsOf(sleeps, stopMin, 'day');
    if (gaps.length < minGaps) return {ready: false, gaps: gaps.length, minGaps};

    const sortedGaps = [...gaps].sort((a, b) => a - b);
    const awakeMedianMin = Math.max(15, round5(fc().quantile(sortedGaps, 0.5)));
    const awakeP25Min = Math.max(15, round5(fc().quantile(sortedGaps, 0.25)));
    const awakeP75Min = Math.max(awakeP25Min + 5, round5(fc().quantile(sortedGaps, 0.75)));
    const {napCounts, napDurs, bedRels, wakeRels} = daySleepMetrics(sleeps, endOffset);
    const avgNaps = napCounts.length ? Math.round((napCounts.reduce((a, b) => a + b, 0) / napCounts.length) * 10) / 10 : 3;
    const sortedNaps = [...napDurs].sort((a, b) => a - b);
    const typicalNapMin = sortedNaps.length ? Math.max(20, round5(fc().quantile(sortedNaps, 0.5))) : 60;
    const medRel = list => list.length ? clockOf(trends().DAY_START + round5(fc().quantile([...list].sort((a, b) => a - b), 0.5))) : null;
    const typicalBedtimeMin = medRel(bedRels);
    const typicalWakeMin = medRel(wakeRels);
    const shortNapMin = typicalNapMin > 30 ? 30 : Math.max(15, round5(typicalNapMin / 2));
    const shiftMin = Math.max(5, typicalNapMin - shortNapMin);
    const napCount = Math.max(1, Math.min(4, Math.round(avgNaps || 3)));
    const rows = buildScheduleRows(typicalWakeMin ?? 420, typicalBedtimeMin, napCount, awakeMedianMin, typicalNapMin, shiftMin);
    return {
      ready: true,
      gaps: gaps.length,
      minGaps,
      avgNaps,
      awakeMedianMin,
      awakeP25Min,
      awakeP75Min,
      typicalNapMin,
      typicalBedtimeMin,
      typicalWakeMin,
      shortNapMin,
      shiftMin,
      rows,
    };
  }

  return {BANDS, SETTLING_AGE_DAYS, planForAge, scheduleFromEntries};
})();
