(typeof window !== 'undefined' ? window : globalThis).LITTLE_DAYS_DEVELOPMENT = (() => {
  const host = typeof window !== 'undefined' ? window : globalThis;
  const storageKey = 'little-days-development-dismissed';
  const reviewed = '2026-11-08';
  const earlyCards = [
    {id:'early-talk',topic:['Language','Lenguaje'],title:['Talk, read, and sing','Hable, lea y cante'],body:['In the early months, talk, read, and sing to your baby to support communication.','En los primeros meses, hable, lea y cante a su bebé para apoyar la comunicación.']},
    {id:'early-turns',topic:['Communication','Comunicación'],title:['Take turns with sounds','Tomen turnos con sonidos'],body:['Respond when your baby makes sounds. Taking turns helps your baby learn to communicate.','Responda cuando su bebé haga sonidos. Tomar turnos ayuda a su bebé a aprender a comunicarse.']},
    {id:'early-comfort',topic:['Connection','Vínculo'],title:['Hold and respond','Abrace y responda'],body:['Hold, cuddle, and respond to your baby in the early months. This helps your baby feel safe and cared for.','En los primeros meses, cargue, abrace y responda a su bebé. Esto le ayuda a sentirse seguro y cuidado.']},
    {id:'early-break',topic:['Play','Juego'],title:['Watch for a break','Observe si necesita una pausa'],body:['During early play, watch for signs your baby needs a break, such as turning away, yawning, or becoming fussy.','Durante el juego en los primeros meses, observe si su bebé necesita una pausa, por ejemplo si aparta la mirada, bosteza o se inquieta.']},
  ].map(card => ({...card,from:0,to:3,source:['CDC · 2-month milestones · English','CDC · logros a los 2 meses · inglés'],url:'https://www.cdc.gov/act-early/milestones/2-months.html',sourceDate:'Updated 2026-05-16',checked:'2026-11-08'}));
  const cards = [...earlyCards,
    {id:'vision-near',from:0,to:2,topic:['Vision','Visión'],title:['Faces are easiest to see nearby','Los rostros se ven mejor de cerca'],body:['Newborns see light, shapes, and faces. A distance of about 20–30 cm (8–12 inches), like the distance during feeding, is easiest for them to see.','Los recién nacidos ven la luz, las formas y los rostros. Pueden ver mejor a unos 20–30 cm, como la distancia durante la toma.'],source:['American Academy of Pediatrics · English','American Academy of Pediatrics · inglés'],url:'https://www.healthychildren.org/English/ages-stages/baby/Pages/Babys-Vision-Development.aspx',sourceDate:'Updated 2024-11-05'},
    {id:'vision-tracking',from:2,to:4,topic:['Vision','Visión'],title:['Faces and moving objects','Rostros y objetos en movimiento'],body:['Around 3 months, babies can focus on faces and nearby objects and follow a moving object with their eyes.','Alrededor de los 3 meses, los bebés pueden enfocar rostros y objetos cercanos, y seguir con la mirada un objeto en movimiento.'],source:['American Academy of Pediatrics · English','American Academy of Pediatrics · inglés'],url:'https://www.healthychildren.org/English/ages-stages/baby/Pages/Babys-Vision-Development.aspx',sourceDate:'Updated 2024-11-05'},
    {id:'talk-back',from:2,to:5,topic:['Language and social development','Lenguaje y desarrollo social'],title:['Talk back when your baby makes sounds','Responda cuando su bebé haga sonidos'],body:['By 4 months, most babies make cooing sounds and make sounds back when someone talks to them. Try answering and talking together.','A los 4 meses, la mayoría de los bebés hace sonidos como arrullos y responde con sonidos cuando alguien les habla. Intente responderle y conversar.'],source:['CDC · 4-month milestones · English','CDC · logros a los 4 meses · inglés'],url:'https://www.cdc.gov/act-early/milestones/4-months.html',sourceDate:'Updated 2026-05-15'},
    {id:'movement-rolling',from:4,to:7,topic:['Movement','Movimiento'],title:['New ways to reach and explore','Nuevas formas de alcanzar y explorar'],body:['By 6 months, most babies roll from tummy to back, push up with straight arms, or lean on their hands while sitting. Put a safe toy nearby for your baby to reach while you stay close.','A los 6 meses, la mayoría de los bebés se voltea boca arriba, se empuja con los brazos extendidos o se apoya en las manos al sentarse. Coloque cerca un juguete seguro para que intente alcanzarlo mientras usted permanece cerca.'],source:['CDC · 6-month milestones · English','CDC · logros a los 6 meses · inglés'],url:'https://www.cdc.gov/act-early/milestones/6-months.html',sourceDate:'Updated 2026-05-15'},
    {id:'solids-readiness',from:5,to:8,topic:['Feeding','Alimentación'],title:['Signs that your baby may be ready for solids','Señales de que su bebé podría estar listo para comer sólidos'],body:['Around 6 months, signs of readiness for solids include sitting with support, controlling the head, opening the mouth, and swallowing food. Solids before 4 months are not recommended.','Alrededor de los 6 meses, las señales para empezar sólidos incluyen sentarse con apoyo, controlar la cabeza, abrir la boca y tragar. No se recomienda empezar antes de los 4 meses.'],source:['CDC · solid foods · English','CDC · alimentos sólidos · inglés'],url:'https://www.cdc.gov/infant-toddler-nutrition/foods-and-drinks/when-what-and-how-to-introduce-solid-foods.html',sourceDate:'Updated 2026-04-14'},
    {id:'sleep-range',from:4,to:13,topic:['Sleep and development','Sueño y desarrollo'],title:['A general sleep range for this age','Un rango general de sueño para esta edad'],body:['For infants 4–12 months old, a sleep medicine consensus recommends 12–16 hours per 24 hours, including naps. Needs vary; this range does not assess an individual baby.','Para bebés de 4–12 meses, un consenso de medicina del sueño recomienda de 12 a 16 horas por cada 24 horas, incluidas las siestas. Las necesidades varían; este rango no evalúa a cada bebé.'],source:['American Academy of Sleep Medicine · English','American Academy of Sleep Medicine · inglés'],url:'https://aasm.org/resources/pdf/pediatricsleepdurationconsensus.pdf',sourceDate:'Consensus published 2016-06'},
    {id:'many-ways-to-move',from:8,to:13,topic:['Movement','Movimiento'],title:['Babies move in different ways','Los bebés se mueven de distintas maneras'],body:['Babies may crawl on hands and knees, scoot on their bottom, slide on their tummy, or use another way to move. Not every baby crawls in the same way.','Algunos bebés gatean con manos y rodillas, se desplazan sentados, se arrastran boca abajo o se mueven de otra manera. No todos gatean igual.'],source:['American Academy of Pediatrics · English','American Academy of Pediatrics · inglés'],url:'https://www.healthychildren.org/English/ages-stages/baby/Pages/Crawling-Styles.aspx',sourceDate:'Updated 2021-09-15'},
    {id:'nine-month-social-language',from:8,to:11,topic:['Language and social development','Lenguaje y desarrollo social'],title:['Sounds and back-and-forth play','Sonidos y juegos por turnos'],body:['By 9 months, most babies make repeated sounds such as “mamamama” and “babababa,” look when their name is called, and enjoy games like peekaboo. Try repeating your baby’s sounds.','A los 9 meses, la mayoría de los bebés repite sonidos como “mamamama” y “babababa”, mira cuando escucha su nombre y disfruta juegos como esconderse y aparecer. Intente repetir los sonidos de su bebé.'],source:['CDC · 9-month milestones · English','CDC · logros a los 9 meses · inglés'],url:'https://www.cdc.gov/act-early/milestones/9-months.html',sourceDate:'Updated 2026-05-15'}
  ];
  const parts = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number), date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? [year, month, day] : null;
  };
  function ageMonths(birthDate, today) {
    const birth = parts(birthDate), current = parts(today);
    if (!birth || !current) return null;
    let age = (current[0] - birth[0]) * 12 + current[1] - birth[1];
    if (current[2] < birth[2]) age--;
    return age < 0 ? null : age;
  }
  function dismissed() {
    try {
      const saved = JSON.parse(host.localStorage.getItem(storageKey) || '[]');
      return Array.isArray(saved) ? saved.filter(id => cards.some(card => card.id === id)) : [];
    } catch { return []; }
  }
  function dismiss(id) {
    const hidden = dismissed();
    if (!cards.some(card => card.id === id) || hidden.includes(id)) return;
    try { host.localStorage.setItem(storageKey, JSON.stringify([...hidden, id])); } catch { /* keep the card visible if storage is unavailable */ }
  }
  function cardsForAge(birthDate, today) {
    const age = ageMonths(birthDate, today);
    return age === null ? [] : cards.filter(card => age >= card.from && age < card.to);
  }
  function cardsFor(birthDate, today) {
    const hidden = new Set(dismissed());
    return cardsForAge(birthDate, today).filter(card => !hidden.has(card.id));
  }
  return Object.freeze({cardsFor, cardsForAge, dismiss, ageMonths, reviewed});
})();
