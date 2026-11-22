// Brief paraphrases of primary sources opened on 2026-11-09; these are not individual assessments.
// Shared by the server (server/care-guidance.ts) and the browser (Reports, Group 3).
globalThis.LittleDaysCareGuidance = (() => {
  const milestoneUrl = age => 'https://www.cdc.gov/act-early/milestones/' + (age === 12 ? '1-year' : age + '-months') + '.html';
  const earlyUrl = milestoneUrl(2);
  const passages = [
    {id: 'care-milestones-2', ageMonths: 2, url: earlyUrl, title: ['CDC: milestones by 2 months', 'CDC: hitos a los 2 meses'], body: ['By 2 months, most babies smile in response, make sounds besides crying, watch movement, and lift their head during tummy time.', 'A los 2 meses, la mayoría sonríe en respuesta, hace sonidos además del llanto, observa movimientos y levanta la cabeza boca abajo.']},
    {id: 'care-milestones-4', ageMonths: 4, url: milestoneUrl(4), title: ['CDC: milestones by 4 months', 'CDC: hitos a los 4 meses'], body: ['By 4 months, most babies coo, answer speech with sounds, hold their head steady when held, bring hands to mouth, and push onto forearms on their tummy.', 'A los 4 meses, la mayoría hace sonidos como «ooo» y «aaah», responde con sonidos, sostiene la cabeza al cargarlo, lleva las manos a la boca y se apoya en antebrazos boca abajo.']},
    {id: 'care-milestones-6', ageMonths: 6, url: milestoneUrl(6), title: ['CDC: milestones by 6 months', 'CDC: hitos a los 6 meses'], body: ['By 6 months, most babies laugh, take turns making sounds, reach for toys, roll from tummy to back, and support sitting with their hands.', 'A los 6 meses, la mayoría ríe, toma turnos con sonidos, alcanza juguetes, se voltea de boca abajo a boca arriba y se apoya en las manos al sentarse.']},
    {id: 'care-milestones-9', ageMonths: 9, url: milestoneUrl(9), title: ['CDC: milestones by 9 months', 'CDC: hitos a los 9 meses'], body: ['By 9 months, most babies respond to their name, babble repeated sounds, enjoy peekaboo, transfer objects between hands, and sit without support.', 'A los 9 meses, la mayoría responde a su nombre, repite sonidos, disfruta los juegos de esconder y mostrar la cara, pasa objetos entre manos y se sienta sin apoyo.']},
    {id: 'care-milestones-12', ageMonths: 12, url: milestoneUrl(12), title: ['CDC: milestones by 1 year', 'CDC: hitos al año'], body: ['By 1 year, most babies wave goodbye, use a special name for a parent, pull up to stand, and walk holding furniture. These checklists describe most children, not a diagnosis or screening test. If skills are missing, lost, or concerning, discuss developmental screening with the child’s clinician.', 'Al año, la mayoría se despide con la mano, usa un nombre especial para un progenitor, se levanta y camina apoyándose en muebles. Las listas describen a la mayoría; no diagnostican ni sustituyen una evaluación. Ante hitos ausentes, pérdida de habilidades o inquietudes, consulte al profesional sobre una evaluación del desarrollo.']},
    {id: 'care-early-play', url: earlyUrl, title: ['CDC: early play and communication', 'CDC: juego y comunicación tempranos'], body: ['In the early months, talk, read, sing, and answer baby’s sounds. For tummy time, baby must be awake and supervised. If sleepy, move baby onto their back in a safe sleep space. Turning away, yawning, or fussing can signal a play break.', 'En los primeros meses, hable, lea, cante y responda a sus sonidos. Boca abajo, el bebé debe estar despierto y supervisado. Si tiene sueño, colóquelo boca arriba en un espacio seguro para dormir. Apartar la mirada, bostezar o inquietarse puede indicar que necesita una pausa.']},
    {id: 'care-comfort', url: earlyUrl, title: ['CDC: comforting and caregiver breaks', 'CDC: consuelo y pausas del cuidador'], body: ['Try gentle holding, rocking, a soft voice, or singing to comfort an upset baby. If overwhelmed by crying, place baby safely and take a break, checking every 5–10 minutes. Never shake a baby.', 'Pruebe cargarlo, mecerlo suavemente, hablar bajo o cantar para consolarlo. Si el llanto lo abruma, deje al bebé en un lugar seguro y tome una pausa; revíselo cada 5–10 minutos. Nunca sacuda a un bebé.']},
    {id: 'care-safe-sleep', url: 'https://safetosleep.nichd.nih.gov/reduce-risk/safe-sleep-environment', title: ['NICHD: safe sleep space', 'NICHD: espacio seguro para dormir'], body: ['Use a separate infant sleep space with a firm, flat, level surface and fitted sheet only. Keep pillows, blankets, toys, bumpers, and weighted items out. Pillows and soft bedding can cause suffocation and other sleep-related harm. Sharing a room is safer than sharing a bed. Adult beds, sofas, and armchairs are unsafe infant sleep spaces. Move a sleeping baby from a sitting or carrying device to their regular safe sleep space as soon as possible.', 'Use un espacio separado para el bebé, con una superficie firme, plana, horizontal y solo una sábana ajustable. Retire almohadas, cobijas, juguetes, protectores y artículos con peso. Las almohadas y la ropa de cama blanda pueden causar asfixia y otros daños durante el sueño. Compartir habitación es más seguro que compartir cama. Las camas de adultos, sofás y sillones no son espacios seguros para dormir. Si se duerme sentado o en un portabebés, páselo a su espacio seguro cuanto antes.']},
    {id: 'care-feeding-cues', url: 'https://www.cdc.gov/infant-toddler-nutrition/mealtime/signs-your-child-is-hungry-or-full.html', title: ['CDC: hunger and fullness cues', 'CDC: señales de hambre y saciedad'], body: ['From birth to 5 months, hands to mouth, turning toward breast or bottle, and lip movements may signal hunger. Closing the mouth, turning away, and relaxed hands may signal fullness. Crying is often a late hunger sign. Do not force a baby to finish a bottle. Discuss concerns about intake with their clinician.', 'Del nacimiento a los 5 meses, llevar manos a la boca, buscar pecho o biberón y mover los labios puede indicar hambre. Cerrar la boca, girar la cabeza y relajar las manos puede indicar saciedad. El llanto suele ser una señal tardía de hambre. No obligue a terminar el biberón. Consulte las inquietudes sobre la ingesta con su profesional.']},
    {id: 'care-solids', url: 'https://www.cdc.gov/infant-toddler-nutrition/foods-and-drinks/when-what-and-how-to-introduce-solid-foods.html', title: ['CDC: starting solid foods', 'CDC: inicio de alimentos sólidos'], body: ['Introduce solids at about 6 months; before 4 months is not recommended. Readiness includes sitting with support, head and neck control, opening the mouth, and swallowing rather than pushing food out. Use textures suited to development and supervise eating. Severe eczema or egg allergy warrants clinician advice before introducing peanuts.', 'Introduzca sólidos alrededor de los 6 meses; no se recomienda antes de los 4 meses. Las señales incluyen sentarse con apoyo, controlar cabeza y cuello, abrir la boca y tragar sin expulsar la comida. Adapte las texturas al desarrollo y supervise las comidas. Ante eccema grave o alergia al huevo, consulte antes de introducir cacahuates.']},
    {id: 'care-urgent', url: 'https://www.nhs.uk/conditions/baby/health/is-your-baby-or-toddler-seriously-ill/', title: ['NHS: urgent illness signs', 'NHS: señales de enfermedad urgente'], body: ['Seek immediate medical help for trouble breathing, blue or grey lips, difficulty waking, seizures, a rash that does not fade under pressure, or no urine for 12 hours. A temperature of 38°C or higher under 3 months requires immediate medical help. These signs are not exhaustive; serious concern itself warrants immediate help. Use local emergency services, not UK-specific numbers outside the UK.', 'Busque ayuda médica inmediata ante dificultad respiratoria, labios azules o grises, dificultad para despertar, convulsiones, sarpullido que no palidece al presionarlo o falta de orina durante 12 horas. Una temperatura de 38°C o más antes de los 3 meses requiere ayuda médica inmediata. La lista no es completa; una preocupación grave también requiere ayuda inmediata. Use los servicios locales de emergencia, no números británicos fuera del Reino Unido.']},
  ];

  const format = ({title, body, ...source}, spanish) => ({
    ...source,
    scope: 'general guidance',
    title: title[spanish ? 1 : 0],
    body: body[spanish ? 1 : 0],
    date: 'Checked 2026-11-09',
  });

  const careGuidance = spanish => passages.map(item => format(item, spanish));
  const byId = (id, spanish) => {
    const found = passages.find(item => item.id === id);
    return found ? format(found, spanish) : null;
  };
  const AGE_STEPS = [
    [45, 'care-early-play'],
    [90, 'care-milestones-2'],
    [150, 'care-milestones-4'],
    [225, 'care-milestones-6'],
    [315, 'care-milestones-9'],
  ];
  const forAge = (ageDays, spanish) => {
    if (!Number.isFinite(ageDays) || ageDays < 0) return byId('care-early-play', spanish);
    const step = AGE_STEPS.find(([limit]) => ageDays < limit);
    return byId(step ? step[1] : 'care-milestones-12', spanish);
  };

  return {careGuidance, byId, forAge};
})();
