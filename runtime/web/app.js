/* ---------- words: [English, Spanish (Mexico, usted)] ---------- */
const W = {
  factPrevious:['Previous fact','Dato anterior'], factNext:['Next fact','Dato siguiente'], factPosition:[(n,total)=>`Fact ${n} of ${total}`,(n,total)=>`Dato ${n} de ${total}`],
  askAI:['Ask AI','Preguntar a IA'], factSource:['Source','Fuente'], bunnyTap:['Make the bunny hop','Hacer saltar al conejito'], factLog:['View log','Ver historial'], askShort:['Ask','Preguntar'],
  factEmpty:['A little more to discover','Hay más por descubrir'], factEmptyBody:['Facts will appear as her age and care records become available.','Los datos aparecerán cuando estén disponibles su edad y sus registros de cuidado.'],
  askAbout:[name=>`Ask AI about ${name}`,name=>`Preguntar a IA sobre ${name}`], aiNotice:['Not medical advice. For urgent symptoms, call your doctor or your local emergency number.','No es consejo médico. Con síntomas urgentes, llame a su médico o al número de emergencias.'],aiBlank:[name=>`What would you like to know about ${name}?`,name=>`¿Qué le gustaría saber sobre ${name}?`],
  aiSend:['Send','Enviar'], aiWaiting:['Reading her records…','Consultando sus registros…'], aiSources:['Sources','Fuentes'],
  aiChecking:['Checking availability…','Comprobando disponibilidad…'], aiUnavailable:['Ask AI is not connected yet.','La IA todavía no está conectada.'],
  aiFailed:['No answer arrived.','No llegó una respuesta.'], aiRetry:['Try again','Intentar de nuevo'], aiLimit:['The daily question limit has been reached. Try again tomorrow.','Se alcanzó el límite diario de preguntas. Inténtelo mañana.'],
  glance: ['At a glance', 'De un vistazo'],
  chartDiapers: ['Diapers', 'Pañales'],
  dailyRhythm: ['Daily rhythm', 'Ritmo diario'],
  chartPeriod: [n => n===1?'Daily average for the last full day':`Daily averages for the last ${n} full days`, n => n===1?'Promedio diario del último día completo':`Promedios diarios de los últimos ${n} días completos`],
  chartNoneYet: ['No records yet.', 'Todavía no hay registros.'],
  chartNoDayRecords: ['No records', 'Sin registros'],
  chartNoDiapers: ['No diapers logged.', 'Sin pañales registrados.'],
  chartFeedsAvg: [v => `${v} feeds`, v => `${v} tomas`],
  chartSleepAvg: [v => `${v} of sleep`, v => `${v} de sueño`],
  chartBottleSub: [v => `${v} from the bottle`, v => `${v} de biberón`],
  chartLongestSub: [v => `Longest sleep ${v}`, v => `Sueño más largo ${v}`],
  chartDiaperAvg: [(w,d) => `Wet ${w} · Dirty ${d}`, (w,d) => `Pipí ${w} · Popó ${d}`],
  chartDuration: [(h,m) => h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`, (h,m) => h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`],
  chartToday: ['Today so far', 'Hoy hasta ahora'],
  chartDay: ['Day', 'Día'], chartNaps: ['Naps', 'Siestas'], chartNightShort: ['Night', 'Noche'],
  chartFeedTip: [(n,b,k) => `${n} ${n===1?'feed':'feeds'}. Breast ${b}, bottle ${k}`, (n,b,k) => `${n} ${n===1?'toma':'tomas'}. Pecho ${b}, biberón ${k}`],
  chartSleepTip: [(total,night,nap) => `${total}. Night ${night}, naps ${nap}`, (total,night,nap) => `${total}. Noche ${night}, siestas ${nap}`],
  chartWetTip: [n => `${n} wet ${n===1?'diaper':'diapers'}`, n => `${n} ${n===1?'pañal':'pañales'} con pipí`],
  chartDirtyTip: [n => `${n} dirty ${n===1?'diaper':'diapers'}`, n => `${n} ${n===1?'pañal':'pañales'} con popó`],
  chartNumbers: ['Show the numbers', 'Mostrar los números'],
  chartSeeTimeline: ['See the timeline', 'Ver el historial'],
  chartRhythmReading: [n => `Sleep and feed times for each of the last ${n} days, from 7 AM to 7 AM. The Timeline lists each record.`, n => `Horas de sueño y tomas de cada uno de los últimos ${n} días, de 7 a. m. a 7 a. m. El historial muestra cada registro.`],
  chartKeyboard: ['Pick a day. Use the left and right arrow keys.', 'Elija un día. Use las flechas izquierda y derecha.'],
  chartNight: ['Night, 7 PM to 7 AM', 'Noche, de 7 p. m. a 7 a. m.'],
  chartFeedsDay: ['Feeds per day', 'Tomas por día'], chartSleepDay: ['Sleep per day', 'Sueño por día'], chartWetDay: ['Wet per day', 'Pipí por día'], chartDirtyDay: ['Dirty per day', 'Popó por día'],
  chartMeasure: ['Measure', 'Medida'], headSize: ['Head size', 'Cabeza'], chartAge: ['Age', 'Edad'], chartBirth: ['Birth', 'Nacimiento'],
  chartWeeks: [n => `${n} ${n===1?'week':'weeks'}`, n => `${n} ${n===1?'semana':'semanas'}`],
  chartLatest: [(v,w) => w<1?`Latest <b>${v}</b> at birth`:`Latest <b>${v}</b> at ${w} ${w===1?'week':'weeks'}`, (v,w) => w<1?`Último <b>${v}</b> al nacer`:`Último <b>${v}</b> con ${w} ${w===1?'semana':'semanas'}`],
  chartKg: ['Kilograms', 'Kilogramos'], chartLb: ['Pounds', 'Libras'], chartCm: ['Centimeters', 'Centímetros'], chartIn: ['Inches', 'Pulgadas'],
  chartGrowthReading: [(what,w) => `${what} from birth to ${Math.floor(w)} weeks`, (what,w) => `${what} desde el nacimiento hasta las ${Math.floor(w)} semanas`],
  loggedBy: ['Logged by', 'Registrado por'],
  chooseLoggedBy: ['Choose who logged this.', 'Elija quién registró esto.'],
  photoLoggedBy: ['A note with a photo is logged by you.', 'Una nota con foto queda registrada a su nombre.'],
  photoEditLoggedBy: ['Logged by cannot change on a note with a photo.', 'No se puede cambiar quién registró una nota con foto.'],
  splitSleep: ['Split around a wake-up', 'Dividir por un despertar'],
  wokeAt: ['Woke up', 'Despertó'], sleptAt: ['Fell asleep again', 'Se durmió otra vez'],
  splitInvalid: ['Choose wake and sleep times inside this sleep, in that order.', 'Elija la hora del despertar y del sueño dentro de este registro, en ese orden.'],
  settings: ['Settings', 'Ajustes'], signedInAs: ['Signed in as', 'Sesión iniciada como'],
  wrongSide: ['Wrong side?', '¿Lado incorrecto?'],
  sideChangedElsewhere: ['The side changed on another phone. Check the side and switch again.', 'El lado cambió en otro teléfono. Revise el lado y vuelva a cambiarlo.'],
  sideChanged: ['Side changed.', 'Se cambió el lado.'],
  switchedEarlier: ['Switched earlier?', '¿Cambió de lado antes?'],
  switchTime: ['Switch time', 'Hora del cambio de lado'],
  hintSwitch: ['Choose a switch time after the start and not in the future.', 'Elija una hora de cambio posterior al inicio y que no esté en el futuro.'],
  searchShort: ['Search', 'Buscar'],
  notSaved: ['Not saved', 'No se guardó'],
  startBottle: ['Start bottle timer', 'Iniciar temporizador de biberón'], finishBottle: ['Finish bottle', 'Terminar biberón'], switchFeedType: ['Switch to', 'Cambiar a'],
  onDuty: [name => `${name} is on duty`, name => `${name} está en turno`],
  feedStarted: [(time,name) => `Started ${time} by ${name}`, (time,name) => `Inició a las ${time} con ${name}`],
  usualGap: [gap => `Usual gap ${gap}`, gap => `Intervalo habitual ${gap}`],
  tabHome: ['Home', 'Inicio'], tabLog: ['Timeline', 'Historial'], tabCharts: ['Charts', 'Gráficas'], tabPhotos: ['Photos', 'Fotos'],
  developmentNote: ['General information, not a developmental screening. If you have concerns or your baby loses a skill, talk with your doctor.', 'Información general, no es una evaluación del desarrollo. Si algo le preocupa o su bebé pierde una habilidad, hable con su médico.'], tabsAria: ['Sections', 'Secciones'], language:['Language','Idioma'], loginRequired:['Choose a household member.','Elija a una persona de la familia.'], loginFailed:['Selection failed. Choose a household member.','No se pudo elegir. Seleccione a una persona de la familia.'],signInEnded:['Your sign-in ended. Enter the household passcode.','Su sesión terminó. Escriba el código de la casa.'],passcodeTitle:['Household passcode','Código de la casa'],passcodeLabel:['Passcode','Código'],passcodeWrong:['That passcode is not right.','Ese código no es correcto.'],passcodeAgain:['Sign-in failed. Enter the household passcode again.','No se pudo entrar. Escriba el código de la casa otra vez.'], signInEndedPick:['Your sign-in ended. Choose your name.','Su sesión terminó. Elija su nombre.'], pickAgain:['Sign-in failed. Choose your name again.','No se pudo entrar. Elija su nombre otra vez.'],passcodeWait:['Too many wrong passcodes. Try again in 15 minutes.','Demasiados códigos incorrectos. Inténtelo de nuevo en 15 minutos.'],passcodeNotSet:['This app has no passcode yet. Ask the person who set it up.','Esta app aún no tiene código. Pregunte a quien la instaló.'],saveAgain:['Signed in. Your last change was not saved. Try it again.','Sesión iniciada. Su último cambio no se guardó. Inténtelo otra vez.'], setupTitle:['Add your baby','Agregue a su bebé'], firstName:['Baby’s first name','Nombre de la bebé'], birthDate:['Birth date (required)','Fecha de nacimiento (obligatoria)'], dueDate:['Due date (optional)','Fecha prevista de parto (opcional)'], saveChild:['Save baby','Guardar bebé'],
  setupInvalid:['Enter the baby’s first name and a birth date from the last 3 years.','Escriba el nombre del bebé y una fecha de nacimiento de los últimos 3 años.'],
  stopPending:['Stopped. Tap Undo to keep the timer running.','Detenido. Toque Deshacer para seguir con el temporizador.'],
  waitUndo:['Wait a few seconds: the last stop can still be undone.','Espere unos segundos: todavía puede deshacer el último temporizador detenido.'],
  hintMilk:['Choose Breast milk or Formula to save.','Elija Leche materna o Fórmula para guardar.'], hintAmount:['Add an amount to save.','Agregue una cantidad para guardar.'], hintSide:['Choose Left or Right to save.','Elija Izquierdo o Derecho para guardar.'], hintDuration:['Enter how many minutes it lasted to save.','Escriba cuántos minutos duró para guardar.'], hintNap:['Choose Nap or Night sleep to continue.','Elija Siesta o Sueño nocturno para continuar.'], hintGeneric:['Fill in the required fields to save.','Complete los campos obligatorios para guardar.'], waitingProfile:['Waiting for an adult who can set up the baby profile.','Se espera a una persona adulta que pueda configurar el perfil del bebé.'], logout:['Choose person','Elegir persona'],
  loading:['Loading your family data…','Cargando los datos de su familia…'], connectionError:['Connection problem','Problema de conexión'], tryAgain:['Check your connection and try again.','Revise su conexión e inténtelo de nuevo.'], retry:['Retry','Reintentar'], retrySame:['The server did not find this request. Retry the same save.','El servidor no encontró esta solicitud. Reintente el mismo guardado.'], signIn:['Choose a person','Elegir persona'], signInGo:['Continue','Continuar'], username:['Person','Persona'], photosEmpty:['No photos have been added.','Todavía no se agregan fotos.'], change: ['Change', 'Cambiar'], saving:['Saving…','Guardando…'],saveFailed:['The server did not save this entry. Your draft is still open.','El servidor no guardó este registro. Su borrador sigue abierto.'],cancelled:['Save cancelled.','Se canceló el guardado.'],unknownSave:['The server returned an unknown save status. Nothing is marked saved.','El servidor devolvió un estado desconocido. No se marcó como guardado.'],pollFailed:['Could not check the save yet.','Todavía no se pudo comprobar el guardado.'],started:['Timer started.','Temporizador iniciado.'],undone:['Undone.','Deshecho.'],portraitSaved:['Portrait saved.','Retrato guardado.'],reminderLimited:['Reminder saved.','Recordatorio guardado.'],
  bottleW: ['Bottle', 'Biberón'],
  bothBreasts: ['Both breasts', 'Ambos pechos'],
  left: ['Left', 'Izquierdo'], right: ['Right', 'Derecho'], next: ['Next', 'Siguiente'],
  feed: ['Feed', 'Toma'], sleep: ['Sleep', 'Sueño'], diaper: ['Diaper', 'Pañal'],
  asleep: ['Asleep', 'Dormida'], dayCounts: [(w, d) => `Wet ${w} · Dirty ${d}`, (w, d) => `Pipí ${w} · Popó ${d}`],
  feedCount: [n => `${n} ${n === 1 ? 'feed' : 'feeds'}`, n => `${n} ${n === 1 ? 'toma' : 'tomas'}`],
  sleepCount: [n => `${n} ${n === 1 ? 'sleep' : 'sleeps'}`, n => `${n} ${n === 1 ? 'sueño' : 'sueños'}`],
  noFeedLogged:['No feed logged','Sin tomas registradas'],noSleepLogged:['No sleep logged','Sin sueño registrado'],startedBy: [n => `Started by ${n}`, n => `Inició ${n}`],
  switchTo: [s => `Switch to ${s}`, s => `Cambiar a ${s}`], stop: ['Stop', 'Detener'],
  cancel: ['Cancel', 'Cancelar'], save: ['Save', 'Guardar'], start: ['Start', 'Iniciar'], close: ['Close', 'Cerrar'],
  breast: ['Breast', 'Pecho'], bottle: ['Bottle', 'Biberón'], pump: ['Pump', 'Extracción'],
  amount: ['Amount', 'Cantidad'], milkBreast: ['Breast milk', 'Leche materna'], milkFormula: ['Formula', 'Fórmula'], milkWhat: ['Milk', 'Leche'],
  more: ['More', 'Más'],
  wet: ['Wet', 'Pipí'], dirty: ['Dirty', 'Popó'], both: ['Both', 'Pipí y popó'],
  texture: ['Texture', 'Textura'], color: ['Color', 'Color'], optional: ['optional', 'opcional'],
  tex: {watery: ['Watery', 'Líquida'], seedy: ['Seedy', 'Granulosa'], soft: ['Soft', 'Blanda'], formed: ['Formed', 'Formada'], hard: ['Hard', 'Dura']},
  col: {yellow: ['Yellow', 'Amarillo'], green: ['Green', 'Verde'], brown: ['Brown', 'Café'], black: ['Black', 'Negro'], red: ['Red', 'Rojo'], pale: ['Pale', 'Pálido']},
  callPed: ['Call the pediatrician', 'Llame al pediatra'],
  appointment: ['Pediatrician appointment', 'Cita con pediatra'], visitRecord:['Visit record','Registro de consulta'], appointmentReason:['Reason for visit','Motivo de la consulta'], provider:['Pediatrician or clinic','Pediatra o clínica'], location:['Location','Lugar'], observations:['Observations','Observaciones'], providerInstructions:['Instructions from provider','Indicaciones del profesional'], followUp:['Follow-up date','Fecha de seguimiento'], upcomingAppointments:['Upcoming appointments','Próximas citas'],
  saved: ['Saved', 'Guardado'], undo: ['Undo', 'Deshacer'],
  savedDia: [k => `${k} diaper saved`, k => `Pañal guardado: ${k}`],
  savedBottle: [v => `Bottle ${v} saved`, v => `Biberón de ${v} guardado`],
  savedPump: [v => `Pump ${v} saved`, v => `Extracción de ${v} guardada`],
  savedFeed: ['Feed saved', 'Toma guardada'], savedSleep: ['Sleep saved', 'Sueño guardado'], savedItem: [n => `${n} saved`, n => `${n} guardado`],
  // A sleep save that crosses saved sleeps names them; spans come from sleepSpanText. A Spanish span ends with "a. m." or "p. m.", whose period also ends the sentence.
  sleepOverlapOne: [s => `This overlaps the sleep from ${s}. Change the start or end, or delete that sleep in the timeline.`, s => `Se cruza con el sueño de ${s} Cambie el inicio o el final, o borre ese sueño en el Historial.`],
  sleepOverlapMany: [(n, s) => `This overlaps ${n} saved sleeps: ${s}. Change the start or end, or delete those sleeps in the timeline.`, (n, s) => `Se cruza con ${n} sueños guardados: ${s} Cambie el inicio o el final, o borre esos sueños en el Historial.`],
  careTitle:['Care hours','Horas de cuidado'],careShare:['Share my confirmations with Health','Compartir mis confirmaciones con Salud'],careStart:['Care start','Inicio del cuidado'],careEnd:['Care end','Fin del cuidado'],careConfirm:['Confirm this care period','Confirmar este periodo'],careInvalid:['Choose a valid period of 24 hours or less.','Elija un periodo válido de 24 horas o menos.'],careEmpty:['No care periods confirmed.','No hay periodos de cuidado confirmados.'],careUnavailable:['Care data could not be loaded. Check the connection and try again.','No se pudieron cargar los datos de cuidado. Revise la conexión e inténtelo de nuevo.'],careSaved:['Care setting saved.','Se guardó la opción de cuidado.'],careConfirmed:['Care period saved.','Se guardó el periodo de cuidado.'],careRevoked:['Care period revoked.','Se revocó el periodo de cuidado.'],careHistory:['Duty history','Historial de turnos'],currentDuty:['Current assignment','Turno actual'],revoke:['Revoke','Revocar'],shareOn:['Sharing is on','El uso compartido está activado'],shareOff:['Sharing is off','El uso compartido está desactivado'],medicine: ['Medicine', 'Medicina'], temp: ['Temperature', 'Temperatura'], note: ['Note', 'Nota'],
  solids: ['Solids', 'Sólidos'], tummy: ['Tummy time', 'Tiempo boca abajo'], bath: ['Bath', 'Baño'], mile: ['Milestone', 'Logro'],
  nap: ['Nap', 'Siesta'], night: ['Night sleep', 'Sueño nocturno'], sleepKind: ['Kind of sleep', 'Tipo de sueño'],
  stopSleep: ['Stop sleep', 'Detener sueño'], stopFeed: ['Stop feed', 'Detener toma'],
  nightRules: ['Bigger buttons at night', 'Botones grandes de noche'],
  addNote: ['Add note', 'Agregar nota'], addDetails: ['Add details', 'Agregar detalles'], diaperTap: ['Tap a type to save it now.', 'Toque un tipo para guardarlo ya.'],
  themeTitle: ['Dim screen', 'Pantalla tenue'], themeAuto: ['Auto', 'Auto'], themeOn: ['On', 'Sí'], themeOff: ['Off', 'No'], themeHint: ['Auto dims the screen from 8 PM to 7 AM.', 'Auto atenúa la pantalla de 8 p. m. a 7 a. m.'], reminderNote: ['Saved to the schedule only. This app sends no alert.', 'Solo se guarda en el calendario. Esta app no envía alertas.'], careListTitle: ['Hours you confirmed', 'Horas que confirmó'],
  medName: ['Medicine name', 'Nombre del medicamento'], dose: ['Dose', 'Dosis'], chooseUnit: ['Choose a unit', 'Elija una unidad'], none: ['None', 'Ninguna'],
  duration: ['Duration (minutes)', 'Duración (minutos)'], food: ['Food', 'Alimento'], amountOptional: ['Amount (optional)', 'Cantidad (opcional)'],
  recipient: ['Who to remind', 'A quién recordar'], handoff: ['Handoff note', 'Nota para el relevo'], moment: ['Moment title', 'Nombre del momento'], photoAdd: ['Add photo', 'Agregar foto'], photoPrep: ['Preparing photo…', 'Preparando la foto…'], search: ['Search notes and moments', 'Buscar notas y momentos'], filter: ['Show', 'Mostrar'], all: ['All', 'Todo'],
  time: ['Time', 'Hora'],
  date: ['Date', 'Fecha'], deleteRecord:['Delete record','Eliminar registro'], deleteShort:['Delete','Eliminar'], saveNote:['Save note','Guardar nota'], editWhat:[w=>`Edit ${w.toLowerCase()}`,w=>`Editar ${w.toLowerCase()}`], confirmDelete:['Delete this record?','¿Eliminar este registro?'],
  min: ['min', 'min'], minute: ['Minute', 'Minuto'], completed: ['Completed', 'Completado'], edit: ['Edit entry', 'Editar registro'], reminderFor: ['Reminder about', 'Recordatorio sobre'], enableReminder: ['Enable reminder', 'Activar recordatorio'],
  keepEditing: ['Keep editing', 'Seguir editando'], discard: ['Discard draft', 'Descartar borrador'], unsaved: ['This entry is not saved.', 'Este registro no está guardado.'],
  removePhoto: ['Remove photo', 'Quitar foto'], photoLimit: ['Choose an image under 25 MB.', 'Elija una imagen de menos de 25 MB.'], photoType: ['Choose a JPEG, PNG, or WebP photo.', 'Elija una foto JPEG, PNG o WebP.'],
  manual: ['Manual entry', 'Registro manual'], hintFeedEnd: ['Enter an end time at or after the start time.', 'Escriba una hora de fin igual o posterior a la de inicio.'],
  gas: ['Gas drops', 'Gotas para gases'], dutyTitle: ['On duty', 'En turno'],
  growthLoading: ['Loading measurements…', 'Cargando medidas…'], growthError: ['Measurements could not load.', 'No se pudieron cargar las medidas.'],
  trendLoading: ['Loading recorded patterns…', 'Cargando patrones registrados…'], trendError: ['Recorded patterns could not load.', 'No se pudieron cargar los patrones registrados.'],
  trendNoLog: ['No log', 'Sin registro'], trendUnavailable: ['Not available for this account', 'No disponible para esta cuenta'],
  confirmT: ['Change timer', 'Temporizador'], confirmGo: ['Change', 'Cambiar'],
  confirmBody: [n => `${n} started this timer. Change it?`, n => `${n} inició este temporizador. ¿Quiere cambiarlo?`],
  correctRange:['End must be after the start, within 24 hours, and no later than now.','El fin debe ser posterior al inicio, dentro de las 24 horas y no después de ahora.'],correctTitle:['Correct timer end','Corregir fin del temporizador'],correctHelp:['Choose the actual end time. It must be before now and within 24 hours of the start.','Elija la hora real de fin. Debe ser anterior a ahora y dentro de las 24 horas desde el inicio.'],startDate:['Start date','Fecha de inicio'],startTime:['Start time','Hora de inicio'],endTime:['End time','Hora de fin'],lengthIs:[v=>`Length: ${v}`,v=>`Duración: ${v}`],hintEnd:['Enter an end time after the start time.','Escriba una hora de fin posterior a la de inicio.'],hintTime:['Enter a time that has passed, like 9:30.','Escriba una hora que ya pasó, como 9:30.'],hintClock:['Enter a time like 9:30.','Escriba una hora como 9:30.'],hintEarlier:['Choose a time in the last 12 hours.','Elija una hora de las últimas 12 horas.'],startedEarlier:['Started earlier?','¿Empezó antes?'],changeStart:['Change start','Cambiar inicio'],saveStart:['Save start','Guardar inicio'],startChanged:[time=>`Start changed to ${time}.`,time=>`Inicio cambiado a las ${time}`],invalidDuration:['The start time plus the duration must be now or earlier.','La hora de inicio más la duración debe ser ahora o antes.'],hintMedName:['Enter the medicine name to save.','Escriba el nombre del medicamento para guardar.'],hintDose:['Enter the dose to save.','Escriba la dosis para guardar.'],hintUnit:['Choose a unit to save.','Elija una unidad para guardar.'],invalidRange:['The end time must be now or earlier.','La hora de fin debe ser ahora o antes.'],saveNotConfirmed:['Save not confirmed. Check again.','No se confirmó el guardado. Revise de nuevo.'],checkAgain:['Check again','Revisar de nuevo'],photoRetry:['Select the same photo to retry this save.','Seleccione la misma foto para reintentar este guardado.'],reviewConflict:['This entry changed elsewhere. Review it before saving again.','Este registro cambió en otro lugar. Revíselo antes de guardarlo de nuevo.'],
  today: ['Today', 'Hoy'], yesterday: ['Yesterday', 'Ayer'], empty: ['Nothing logged yet.', 'Todavía no hay registros.'], now: ['Now', 'Ahora'], notSet: ['Not set', 'Sin indicar'], running: ['running', 'en curso'],
  napW: ['Nap', 'Siesta'], slept: ['Slept', 'Durmió'], of: [(n, m) => `${n} of ${m}`, (n, m) => `${n} de ${m}`],
  photosT: [n => `Photos of ${n}`, n => `Fotos de ${n}`], photosOlder: ['Load older', 'Cargar anteriores'], babyDefault: ['Baby', 'Bebé'],weight: ['Weight', 'Peso'], useBirthDate: ['Use birth date', 'Usar fecha de nacimiento'], length: ['Length', 'Estatura'], head: ['Head circumference', 'Perímetro cefálico'], growth: ['Growth', 'Crecimiento'], unit: ['Unit', 'Unidad'], unitsL: ['Units', 'Unidades'],
  loggedBy: ['Logged by', 'Registrado por'], hrs: ['h', 'h'], min: ['min', 'min'],
  ageDays:[n=>`${n} ${n===1?'day':'days'} old`,n=>`${n} ${n===1?'día':'días'} de edad`], ageWeeks:[n=>`${n} ${n===1?'week':'weeks'} old`,n=>`${n} ${n===1?'semana':'semanas'} de edad`],
  ageMonths:[n=>`${n} ${n===1?'month':'months'} old`,n=>`${n} ${n===1?'mes':'meses'} de edad`], ageYears:[n=>`${n} ${n===1?'year':'years'} old`,n=>`${n} ${n===1?'año':'años'} de edad`],
  latest:['Latest','Más reciente'], seeTimeline:['See the timeline','Ver el historial'], logAria:['Log','Registrar'],
  fedAgo:[x=>`Fed ${x} ago`,x=>`Toma hace ${x}`], awakeFor:[x=>`Awake ${x}`,x=>`Despierta hace ${x}`], changedAgo:[x=>`Changed ${x} ago`,x=>`Cambio hace ${x}`],
  lastNap:[d=>`Last nap · ${d}`,d=>`Última siesta · ${d}`], lastNight:[d=>`Last night sleep · ${d}`,d=>`Último sueño nocturno · ${d}`],
  sideLeft:['Left side','Lado izquierdo'], sideRight:['Right side','Lado derecho'], sideBoth:['Both sides','Ambos lados'], wetDirty:['Wet and dirty','Pipí y popó'],
  homeEmpty:['Nothing logged yet','Todavía no hay registros'], homeEmptyHint:['Tap Feed, Sleep or Diaper to log the first one.','Toque Toma, Sueño o Pañal para el primer registro.'],
  askRow:[name=>`Ask about ${name}`,name=>`Preguntar sobre ${name}`], logElse:['Log something else','Registrar otra cosa'], nextAppt:['Next appointment','Próxima cita'],
  runFeeding:[side=>side==='bottle'?'Feeding · Bottle':`Feeding · ${side==='L'?'Left':'Right'} side`,side=>side==='bottle'?'Tomando · biberón':`Tomando · lado ${side==='L'?'izquierdo':'derecho'}`],
  pausedBy:[n=>`Paused by ${n}`,n=>`En pausa, por ${n}`],
  stopThisFeed:['Stop this feed?','¿Terminar esta toma?'], stopThisSleep:['Stop this sleep?','¿Terminar este sueño?'],
  keepFeeding:['Keep feeding','Seguir con la toma'], keepSleeping:['Keep sleeping','Seguir durmiendo'],
  asleepFor:[d=>`Asleep for ${d}`,d=>`Durmiendo desde hace ${d}`],
  pausedAtBy:[(c,n)=>`Paused at ${c}${n?` by ${n}`:''}`,(c,n)=>`En pausa desde las ${c}${n?` por ${n}`:''}`],
  changeSideTime:['Change side or time','Cambiar lado u hora'],
  dutyAria: ['Change who is on duty', 'Cambiar quién está en turno'],
  // Timeline (look match)
  tlOther: ['Other', 'Otros'], tlEarlier: ['Show the day before', 'Ver el día anterior'], tlNothing: ['Nothing logged this day.', 'No hay registros este día.'], tlSearchLabel: ['Search the timeline', 'Buscar en el historial'], tlCloseSearch: ['Close search', 'Cerrar búsqueda'],
  tlSearchHint: ['Search by word, such as bottle or Sam.', 'Busque por palabra, como biberón o Sam.'], tlNoRecords: ['No records match.', 'Ningún registro coincide.'],
  tlNoType: [w => `No ${w} records this day.`, w => `No hay registros de ${w} este día.`],
  tlNight: ['Night sleep', 'Sueño nocturno'], tlOf: ['of', 'de'], tlTo: ['to', 'a'], tlMidnight: ['Midnight', 'Medianoche'],
  tlWetDirty: ['Wet and dirty', 'Pipí y popó'], tlRunning: ['Running', 'En curso'],
  deleted: ['Deleted', 'Eliminado'], deleteRow: [w => `Delete ${w}`, w => `Eliminar ${w}`],
};
const t = (k, ...a) => { const v = W[k][S.lang === 'es' ? 1 : 0]; return typeof v === 'function' ? v(...a) : v; };
const tt = (grp, k) => W[grp][k][S.lang === 'es' ? 1 : 0];

function childSetupHTML(){if(!resourceAllowed('children','add'))return `<div class="shell-card" role="status" lang="${S.lang}"><h1>${t('setupTitle')}</h1><p>${t('waitingProfile')}</p></div>`;const d=S.setupDraft||{};return `<form class="shell-card" id="child-form" lang="${S.lang}"><h1>${t('setupTitle')}</h1><label>${t('firstName')}<input name="firstName" maxlength="255" value="${esc(d.firstName||'')}" required ${S.busy?'disabled':''}></label><label>${t('birthDate')}<input name="birthDate" type="date" min="${dayISO(-1095)}" max="${dayISO(0)}" value="${esc(d.birthDate||'')}" required ${S.busy?'disabled':''}></label><label>${t('dueDate')}<input name="dueDate" type="date" value="${esc(d.dueDate||'')}" ${S.busy?'disabled':''}></label><button class="btn solid" type="submit" ${S.busy?'disabled':''}>${S.busy?t('saving'):t('saveChild')}</button></form>`;}
// S.people holds names from GET /api/session or person objects from the family state; the picker shows names.
// Two steps: the household passcode first, then the adult names that the server returns for a correct passcode.
// The passcode stays in memory only, never in the page, and is dropped when the sign-in finishes.
let householdPasscode='';
function loginHTML() {
  const error=S.message?`<p class="shell-error" role="alert">${ic('warn')}${esc(S.message)}</p>`:'';
  if(!S.people.length)return `<form class="shell-card shell-signin" id="passcode-form" lang="${S.lang}"><h1>${t('passcodeTitle')}</h1>${error}<label>${t('passcodeLabel')}<input name="passcode" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" required></label><button class="btn solid" type="submit">${t('signInGo')}</button></form>`;
  return `<form class="shell-card shell-signin" id="login-form" lang="${S.lang}"><h1>${t('signIn')}</h1>${error}<label>${t('username')}<select name="username" required>${S.people.map(personName).filter(Boolean).map(person=>`<option value="${esc(person)}"${person===S.loginUser?' selected':''}>${esc(shownName(person))}</option>`).join('')}</select></label><button class="btn solid" type="submit">${t('signInGo')}</button></form>`;
}
// With the passcode off (S.passcodeOff, from the server), the picker comes back with fresh names. With no answer, the connection screen
// offers Retry. A reply that says the passcode is on again shows the passcode form.
async function pickAgain(message){
  let session=null;try{session=await LittleDaysAPI.refreshSession();}catch(_){}
  if(!session){S.auth='error';S.message=t('tryAgain');}
  else{S.passcodeOff=session.passcodeOff===true;S.people=S.passcodeOff&&Array.isArray(session.people)?session.people:[];S.auth='login';S.message=S.passcodeOff?message:t('signInEnded');}
  render();
}
function personName(person) { return typeof person==='string'?person:person?.name||person?.username||person?.id||''; }
// An adult's label from the household file replaces the account name on screen. Display only: names in requests and saved data stay as they are.
function shownName(person) { const n=personName(person),l=LittleDaysAPI.labels[n]; return typeof l==='string'?l:l?.[S.lang]||l?.en||n; }
function resourceAllowed(name,action='view'){const value=S.permissions?.resources?.[name];return !!value&&value[action]===true;}
function canStopRun(){return resourceAllowed('timers','delete')&&S.permissions?.canStopOtherAdultsTimers===true;}
function canStartTimer(){return resourceAllowed('timers','add')&&resourceAllowed('timers','delete')&&S.permissions?.canStopOtherAdultsTimers===true;}

// Reply order. Each state request has a number from one counter (transport.js). The browser keeps, for each day, the number of the newest reply whose
// entries it applied, and the number of the newest reply whose shared fields it applied. An older reply cannot put back what a newer one changed.
// A reply that started before a write result was applied is not applied at all. Returns 'stale' for that, 'old' when the shared fields were not applied, else 'applied'.
const replyOrder={shared:0,days:new Map()};
let homeReads=new Set(),homeDays=new Map(),homeReadAttempts=new Map(),homeReading=null,homeGrowthAt=0,homeGrowthDay='',homeScope=0,growthPending=0;
const stateOwner=me=>String(typeof me==='object'?(me?.id||personName(me)):personName(me));
const hasNewIdentity=state=>stateOwner(state.me)!==meKey()||String(state.child?.id||'')!==String(S.child?.id||'')||state.child?.birthDate!==S.child?.birthDate;
const views=permissions=>['children','feedings','changes','sleep','weight','height','tummy-times','notes'].map(name=>permissions?.resources?.[name]?.view===true).join();
function resetHomeEvidence(){
  homeScope++;homeReads=new Set();homeDays=new Map();homeReadAttempts=new Map();homeReading=null;homeGrowthAt=0;homeGrowthDay='';
}
function shiftEntry(entry,offset){
  return {...entry,t:entry.t+offset,
    ...(Number.isFinite(entry.tEnd)?{tEnd:entry.tEnd+offset}:{}),
    ...(entry.shift?{shift:{...entry.shift,at:entry.shift.at+offset}}:{})};
}
function datedEntries(today){
  if(!S.entryDate||S.entryDate===today)return S.entries;
  const offset=isoDay(S.entryDate,today)*1440;
  return S.entries.map(entry=>shiftEntry(entry,offset));
}
function homeEntries(today){
  const ownDay=date=>(homeDays.get(date)?.seq??0)>(replyOrder.days.get(date)??0);
  const unique=new Map();
  const add=(entry,seq)=>{
    if(!unique.has(entry.id)||unique.get(entry.id).seq<=seq)unique.set(entry.id,{entry,seq});
  };
  for(const entry of datedEntries(today)){
    const date=shiftISO(today,dayOf(entry.t));
    if(!ownDay(date))add(entry,replyOrder.days.get(date)??0);
  }
  for(const [date,{entries,seq}] of homeDays){
    if(!ownDay(date)||!homeReads.has(date))continue;
    const offset=isoDay(date,today)*1440;
    for(const entry of entries)add(shiftEntry(entry,offset),seq);
  }
  return hideDeleted([...unique.values()].map(({entry})=>entry)).sort((a,b)=>a.t-b.t);
}
function applyServerData(state,authoritative=false) {
  if(!state)return 'stale';
  // A state that came with a write result, or a full reload, has no number from a request: it takes the next one and is always applied.
  const ticket=(!authoritative&&LittleDaysAPI.ticketOf(state))||LittleDaysAPI.writeApplied();
  if(ticket.writes!==LittleDaysAPI.writeCount)return 'stale';
  const today=todayISO();
  // A snapshot can cross midnight in transit, but its relative times still use the server's date.
  const serverDay=validDate(state.today)?state.today:today,offset=isoDay(serverDay,today)*1440;
  const shared=ticket.seq>replyOrder.shared;
  const newIdentity=hasNewIdentity(state),newViews=views(state.permissions)!==views(S.permissions);
  if(!shared&&(newIdentity||newViews))return 'stale';
  if(newIdentity||newViews){resetHomeEvidence();factSwipe=null;S.growthRequest++;S.growthEntries=[];S.growthUnavailable=[];S.growthLoading=false;S.growthLoaded=false;}
  if(shared){applyIdentity(state);replyOrder.shared=ticket.seq;}
  S.entries=datedEntries(today);S.entryDate=today;S.homeAccessBlocked=false;
  const entries=applyEntries(state,ticket.seq,today,serverDay,offset);
  if(!shared&&!entries)return 'old';
  S.stateFingerprint=JSON.stringify(state);
  if(!shared)return 'old';
  applySharedFields(state,today,offset);
  return 'applied';
}
// A different adult or child starts clean: the old person's chat, facts and cached days go.
function applyIdentity(state) {
  if(state.sleepPaused!==undefined)S.sleepPaused=state.sleepPaused;
  if(hasNewIdentity(state)){resetChat();S.factId='';S.developmentBatch=null;S.developmentAttempt=null;S.entries=[];S.loadedRanges=new Set();S.photoFrom=null;replyOrder.days.clear();}
  S.me=state.me;S.people=Array.isArray(state.people)?state.people:[];S.child=state.child||null;
}
// The days this reply asked for (the default is yesterday and today) take its entries, but only the days where no newer reply was applied. Returns whether any day did.
function applyEntries(state,seq,today,serverDay,offset) {
  const incoming=Array.isArray(state.entries)?state.entries.map(e=>({...(offset?shiftEntry(e,offset):e),id:String(e.id)})):[];
  const keyOfDay=day=>shiftISO(today,day);
  const from=state.__range?.from||shiftISO(serverDay,-1),to=state.__range?.to||shiftISO(serverDay,1),lo=isoDay(from,today),hi=isoDay(to,today);
  const newer=day=>replyOrder.days.get(keyOfDay(day))>=seq,mine=new Set();
  for(let day=lo;day<hi;day++)if(!newer(day))mine.add(day);
  for(const e of incoming)if(!newer(dayOf(e.t)))mine.add(dayOf(e.t));
  const kept=S.entries.filter(e=>!(dayOf(e.t)>=lo&&dayOf(e.t)<hi&&mine.has(dayOf(e.t)))),taken=incoming.filter(e=>mine.has(dayOf(e.t)));
  const byId=new Map([...kept,...taken].map(e=>[String(e.id),e]));
  // A measurement added, changed or removed on a day loaded before (another adult's save) makes the growth history out of date.
  const seen=new Set([...mine].filter(day=>replyOrder.days.has(keyOfDay(day))));
  const growthOn=()=>JSON.stringify(S.entries.filter(e=>e.type==='growth'&&seen.has(dayOf(e.t))).map(e=>[String(e.id),e.t,e.kg,e.cm,e.head]));
  const growthBefore=growthOn();
  S.entries=hideDeleted([...byId.values()]).sort((a,b)=>a.t-b.t);
  if(growthOn()!==growthBefore)growthChanged();
  for(const day of mine){
    const key=keyOfDay(day);
    replyOrder.days.set(key,seq);
    if(day>=lo&&day<hi)homeReads.add(key);
  }
  return mine.size>0;
}
function applySharedFields(state,today,offset) {
  const timerAt=timer=>{
    if(!offset||!Number.isFinite(timer?.t0))return timer;
    const instant=Date.parse(timer.startedAt),start=Number.isFinite(instant)?localClock(timer.startedAt):null;
    // The timer lookup can cross midnight after the server has built the records.
    const t0=start?isoDay(start.date,today)*1440+start.hour24*60 + +start.minute + Math.floor(instant%60000/1000)/60:timer.t0+offset;
    return {...timer,t0};
  };
  S.upcomingAppointments=Array.isArray(state.upcomingAppointments)?state.upcomingAppointments.map(e=>({...(offset?shiftEntry(e,offset):e),id:String(e.id)})):[];
  S.pendingChildSetup=state.pendingChildSetup||null;
  S.run=state.run===undefined?S.run:timerAt(state.run);S.sleepRun=state.sleepRun===undefined?S.sleepRun:timerAt(state.sleepRun);S.pumpRun=state.pumpRun===undefined?S.pumpRun:timerAt(state.pumpRun);S.timers=Array.isArray(state.timers)?state.timers.map(timerAt):[];S.preferences=state.preferences||{};S.permissions=state.permissions||{};S.dutyNote=state.dutyNote||'';S.dutyNoteBy=state.dutyNoteBy||state.dutyNoteAuthor||'';
  const id=String(typeof S.me==='object'?(S.me.id||personName(S.me)):personName(S.me));
  S.units[id]=S.preferences.units==='us'?'us':'metric';{const saved=S.preferences.lang||S.preferences.language;S.lang=saved==='es'||saved==='en'?saved:DEFAULT_LANG;}S.pal=S.preferences.palette||'Sorbet';S.night=!!S.preferences.night;
  S.duty=personName(S.people.find(p=>p.onDuty||p.on_duty)||S.me)||'';
  S.loadedDay=todayISO();
  queueMicrotask(()=>void loadDailyDevelopment());
  queueMicrotask(()=>void checkAiAvailability());
}
// Home hides the Ask row when Chat is unavailable. One check for each chat; a failed check leaves the row showing.
async function checkAiAvailability(){
  const chat=S.chat;if(!LittleDaysAPI.ai||S.auth!=='ready'||chat.available!==null||chat.checking||chat.homeChecked)return;
  chat.homeChecked=true;
  try{const status=await LittleDaysAPI.aiStatus();if(S.chat===chat&&chat.available===null){chat.available=status.available===true;if(!chat.available)render();}}catch{}
}
async function loadDailyDevelopment(){
  if(!LittleDaysAPI.ai||S.auth!=='ready'||S.homeAccessBlocked||!resourceAllowed('children')||!S.child)return;
  const key=`${meKey()}:${S.child.id}:${S.child.birthDate}:${todayISO()}`;
  if(S.developmentAttempt?.key===key&&Date.now()<S.developmentAttempt.until)return;
  const attempt={key,until:Infinity};S.developmentAttempt=attempt;
  const current=()=>S.developmentAttempt===attempt&&S.auth==='ready'&&resourceAllowed('children')&&key===`${meKey()}:${S.child?.id}:${S.child?.birthDate}:${todayISO()}`;
  // The daily facts arrive after the first Home render. Until someone moves the card, Home opens on the first card of the new mix (a fun card).
  // A reply with the same cards as the loaded batch leaves the shown card in place (the 1-minute retry of a pending reply, review r1 2026-11-20).
  const owner=`${meKey()}:${S.child.id}`,ids=b=>(b?.cards||[]).map(c=>c?.id).join('\n');
  try{const batch=await LittleDaysAPI.development();if(!current())return;
    const changed=S.developmentOwner!==owner||ids(S.developmentBatch)!==ids(batch);
    S.developmentBatch=batch;S.developmentOwner=owner;if(changed&&!factMoved&&!factPaused)S.factId='';
    attempt.until=batch.status==='ready'?Infinity:Date.now()+(batch.status==='pending'?60000:15*60000);renderHomeCard();}
  // A failed request keeps the loaded facts of the same adult and child (a brief network drop must not empty Home for 15 minutes).
  // They go only when the adult or the child changed, or the server refuses access.
  catch(error){if(current()){if(error?.status===403||S.developmentOwner!==owner)S.developmentBatch=null;attempt.until=Date.now()+15*60000;renderHomeCard();}}
}
function loadServerState(state) {
  S.foodRequest=(S.foodRequest||0)+1;S.foodEntries=[];S.foodLoading=false;S.foodError=false;
  applyServerData(state,true);  // a full load: no write result or older reply can make it stale
  S.growthRequest++;S.growthEntries=[];S.growthUnavailable=[];S.growthLoading=false;S.growthError=false;S.growthLoaded=false;homeGrowthAt=0;
  S.day=0;S.sheet=null;S.toast=null;S.loadedDay=todayISO();S.auth=S.child?'ready':'setup';S.message='';
  if(S.auth==='setup'&&S.pendingChildSetup)S.setupDraft={firstName:S.pendingChildSetup.firstName||'',birthDate:S.pendingChildSetup.birthDate||'',dueDate:S.pendingChildSetup.dueDate||'',_operationId:S.pendingChildSetup.operationId};
  resumePendingOperations(state.pendingOperations);
  queueMicrotask(()=>refreshHomeEvidence());
}
function resumeChildSetup(pending){const id=pending.operationId;if(!id||S.pendingOps[id])return;const draft=S.setupDraft||{firstName:pending.firstName||'',birthDate:pending.birthDate||'',dueDate:pending.dueDate||'',_operationId:id};S.setupDraft=draft;const context={undoable:false,toast:false,operationOwner:draft,onSaved:result=>{S.setupDraft=null;if(result.state)loadServerState(result.state);else void refreshSetupState();}};void pollOperation({status:pending.status||'pending',operationId:id},'',context);}
async function refreshSetupState(){try{loadServerState(await LittleDaysAPI.state());}catch(error){S.auth='setup';S.message=error.message||t('tryAgain');render();}}
function resumePendingOperations(operations=[]){if(S.auth==='setup'&&S.pendingChildSetup){resumeChildSetup(S.pendingChildSetup);return;}for(const op of operations||[]){if(!op?.operationId||S.pendingOps[op.operationId])continue;if(op.needsRetry&&op.requiresPhoto){const context={undoable:false,toast:false};S.pendingOps[op.operationId]={label:()=>t('savedItem',t('note')),context,photoRetry:true};S.photoRetry={operationId:op.operationId,event:op.event,portrait:!!op.portrait};S.retryAction=()=>document.querySelector('#retry-photo-picker')?.click();S.retryLabel=t('retry');S.message=t('photoRetry');continue;}void pollOperation(op,()=>t('saved'),{undoable:false,toast:false});}}
// Seven full days and today, each from 7 AM; the day before the first one comes too, for a sleep that began there.
const trendRange=()=>({from:dayISO(-9),to:dayISO(1)});
// Read the two finished months, the current month and the prior date for overnight records.
const HOME_RECHECK=4*60000;
const homeVisible=()=>S.auth==='ready'&&S.tab==='home'&&!document.hidden;
function homeHistoryRanges(today){
  const first=globalThis.LittleDaysPersonalTrends?.historyStart(today);
  if(!first)return [];
  const earliest=isoDay(first,today);
  const ranges=[];
  for(let last=-2;last>=earliest;){
    const start=Math.max(last-30,earliest);
    ranges.push({from:shiftISO(today,start),to:shiftISO(today,last+1),dates:Array.from({length:last-start+1},(_,i)=>shiftISO(today,start+i))});
    last=start-1;
  }
  return ranges;
}
function refreshHomeEvidence(afterWrite=false){
  if(!homeVisible()||S.busy&&!afterWrite||S.homeAccessBlocked||!resourceAllowed('children'))return;
  const today=todayISO(),now=Date.now();
  if((resourceAllowed('weight')||resourceAllowed('height'))&&(now>=homeGrowthAt||today!==homeGrowthDay))void loadGrowthHistory();
  if(homeReading||!['feedings','changes','sleep'].some(name=>resourceAllowed(name)))return;
  const ranges=homeHistoryRanges(today),scope=homeScope;
  if(!ranges.length)return;
  const active=new Set(ranges.map(({from,to})=>from+'/'+to));
  for(const key of homeReadAttempts.keys())if(!active.has(key))homeReadAttempts.delete(key);
  for(const date of homeReads)if(date<ranges.at(-1).from)homeReads.delete(date);
  for(const date of homeDays.keys())if(date<ranges.at(-1).from)homeDays.delete(date);
  const due=ranges.filter(({from,to})=>(homeReadAttempts.get(from+'/'+to)??0)<=now);
  if(!due.length)return;
  const request={};
  homeReading=request;
  void (async()=>{
    for(const {from,to,dates} of due){
      if(scope!==homeScope||today!==todayISO()||!homeVisible())break;
      const key=from+'/'+to,prior=dates.map(date=>replyOrder.days.get(date));
      try{
        const state=await LittleDaysAPI.state(from,to);
        if(scope!==homeScope||today!==todayISO()||!homeVisible())break;
        const ticket=LittleDaysAPI.ticketOf(state);
        if(!ticket||ticket.writes!==LittleDaysAPI.writeCount)continue;
        if(hasNewIdentity(state)||views(state.permissions)!==views(S.permissions)){
          if(ticket.seq>replyOrder.shared){blockHomeEvidence();renderHomeCard();void pollFamily();}
          break;
        }
        const records=Array.isArray(state.entries)?state.entries:[];
        const serverDay=validDate(state.today)?state.today:today;
        const buckets=new Map(dates.map(date=>[date,[]]));
        for(const entry of records){
          if(!['feed','bottle','diaper','sleep','note'].includes(entry.type)||!Number.isFinite(entry.t))continue;
          const day=dayOf(entry.t);
          buckets.get(shiftISO(serverDay,day))?.push(shiftEntry({...entry,id:String(entry.id)},-day*1440));
        }
        for(const [date,entries] of buckets){
          if((replyOrder.days.get(date)??0)>ticket.seq)continue;
          homeDays.set(date,{seq:ticket.seq,entries});
          homeReads.add(date);
        }
        if(scope===homeScope){
          // Stagger recurring checks after the first load of the three chunks.
          const slot=homeReadAttempts.has(key)?0:ranges.findIndex(range=>range.from===from)*60000;
          homeReadAttempts.set(key,now+HOME_RECHECK-slot);
        }
        renderHomeCard();
      }catch(error){
        if(scope!==homeScope||today!==todayISO()||!homeVisible())break;
        if(error.status===401){await signInAgain(false);break;}
        if(error.status===403){blockHomeEvidence();renderHomeCard();void pollFamily();break;}
        homeReadAttempts.set(key,Date.now()+15000);
        dates.forEach((date,i)=>{if(replyOrder.days.get(date)===prior[i])homeReads.delete(date);});
        renderHomeCard();
      }
    }
  })().finally(()=>{if(homeReading===request)homeReading=null;});
}
function blockHomeEvidence(){
  resetHomeEvidence();S.homeAccessBlocked=true;factSwipe=null;
  S.developmentBatch=null;S.developmentAttempt=null;
  S.growthRequest++;S.growthEntries=[];S.growthLoading=false;S.growthLoaded=false;
}
async function syncFamily() {
  if(S.auth!=='ready'||S.busy)return;
  try {
    const {from,to}=S.tab==='charts'?trendRange():{}, before=S.stateFingerprint, state=await LittleDaysAPI.state(from,to);
    if(from)state.__range={from,to};
    const hadError=clearPollError(),outcome=applyServerData(state);
    // A reply that started before a save was applied is dropped; the next poll asks again.
    if(outcome==='stale'){if(hadError&&!chartDrag)render();return;}
    if(outcome==='applied')resumePendingOperations(state.pendingOperations);
    const changed=before!==S.stateFingerprint,minute=`${todayISO()}:${nowM()}`;
    const clockChanged=S.tab==='charts'&&S.chartRenderedMinute!==minute;
    if(changed&&chartDrag)S.chartDirty=true;
    const clockRender=(clockChanged||S.tab==='charts'&&S.chartDirty)&&!S.sheet&&!S.toast;
    if((changed||clockRender||hadError)&&!chartDrag)render();
    else if(S.homeRenderedMinute!==minute)renderHomeCard();
  } catch(error) {
    if(error.status===401){await signInAgain(false);return;}
    // The browser's own word ("Failed to fetch") is not shown. The next good poll takes the text away.
    if(error.status===403)blockHomeEvidence();
    homeReads.delete(dayISO(-1));homeReads.delete(todayISO());
    S.message=S.pollError=t('tryAgain');if(!S.sheet&&!S.toast)render();
  }
}
// Takes away the failed-poll text if it is still the message on screen. Returns whether a failed poll had left one.
function clearPollError(){const had=S.pollError;S.pollError=null;if(had&&S.message===had)S.message='';return !!had;}
// The days first..last (day 0 is today; the server takes 31 days or fewer) load in one request. A day that is already loaded is not asked for again unless force is set.
// A reply that started before a save was applied is not applied: the days are marked as not loaded and load once more.
async function loadDayRange(first,last,force=false,again=true){
  const from=dayISO(first),to=dayISO(last+1),keys=Array.from({length:last-first+1},(_,i)=>dayISO(first+i));
  S.loadedRanges||=new Set();
  if(!force&&keys.every(key=>S.loadedRanges.has(key)))return;
  keys.forEach(key=>S.loadedRanges.add(key));
  const unmark=()=>keys.forEach(key=>S.loadedRanges.delete(key));
  try{
    const state=await LittleDaysAPI.state(from,to);state.__range={from,to};
    const outcome=applyServerData(state);
    if(outcome==='stale'){unmark();if(again)return loadDayRange(first,last,force,false);return;}
    if(outcome==='applied')resumePendingOperations(state.pendingOperations);
    render();
  }catch(error){unmark();S.message=error.message||t('tryAgain');render();}
}
const loadTimelineOneDay=(day,force=false)=>loadDayRange(day,day,force);
async function loadTrendRange(){const {from,to}=trendRange();if(S.trendsLoading)return;S.trendsLoading=true;S.trendsError=false;render();try{const state=await LittleDaysAPI.state(from,to);state.__range={from,to};applyServerData(state);}catch{S.trendsError=true;}finally{S.trendsLoading=false;render();}}
async function loadGrowthHistory() {
  if(growthPending&&growthPending===S.growthRequest)return;
  const request=++S.growthRequest,owner=meKey(),child=String(S.child?.id||'');
  growthPending=request;
  homeGrowthAt=Date.now()+HOME_RECHECK;homeGrowthDay=todayISO();
  S.growthLoading=S.growthEntries.length===0;S.growthError=false;
  if(S.tab==='charts')render();
  const current=()=>request===S.growthRequest&&S.auth==='ready'&&owner===meKey()&&child===String(S.child?.id||'');
  try{const data=await LittleDaysAPI.growth();if(!current())return;if(data.childId!=null&&String(data.childId)!==child)throw new Error('Growth data belongs to a different child');S.growthEntries=Array.isArray(data.entries)?data.entries:[];S.growthUnavailable=Array.isArray(data.unavailable)?data.unavailable:[];S.growthLoaded=true;}
  catch{if(current()){S.growthEntries=[];S.growthLoaded=false;S.growthError=true;homeGrowthAt=Date.now()+15000;}}
  finally{if(growthPending===request)growthPending=0;if(current()){S.growthLoading=false;if(S.tab==='charts')render();else renderHomeCard();}}
}
async function submitChild(draft){
  if(!resourceAllowed('children','add')){S.message=t('waitingProfile');render();return;}
  if(S.busy)return;S.busy=true;S.message=t('saving');render();
  const context={undoable:false,toast:false,operationOwner:draft,retry:()=>submitChild(draft),onSaved:result=>{S.setupDraft=null;S.busy=false;if(result.state)loadServerState(result.state);else void refreshSetupState();}};
  try{const result=await LittleDaysAPI.createChild({firstName:draft.firstName,birthDate:draft.birthDate,dueDate:draft.dueDate},operationFor(draft));await acceptWrite(result,'',context);}
  catch(error){S.auth='setup';await recoverWrite(error,'',context);}
  finally{S.busy=false;render();}
}
// A sign-in that ended during use (a 401) shows the name picker in place. The open form comes back after the sign-in;
// a refused save is not sent again on its own, because the picker can stay open for a long time.
async function signInAgain(refusedSave){
  // A second request that finds the same ended sign-in joins the first one. A refused save keeps its own form.
  if(S.resume){if(refusedSave)Object.assign(S.resume,{sheet:S.sheet||S.resume.sheet,day:S.day,refusedSave:true});return;}
  if(S.auth!=='ready')return;
  resetChat();
  S.resume={sheet:S.sheet,day:S.day,me:meKey(),refusedSave};
  if(S.passcodeOff){householdPasscode='';await pickAgain(t('signInEndedPick'));return;}
  try{await LittleDaysAPI.refreshSession();}catch(_){}
  // A device with no sign-in asks for the passcode again; it gets no adult names before that.
  S.people=[];householdPasscode='';
  S.auth='login';S.message=t('signInEnded');render();
}
// Only the same person gets the open form back. Another person starts clean, without the last person's care data.
function resumeAfterSignIn(){const r=S.resume;S.resume=null;if(!r||S.auth!=='ready')return;if(r.me!==meKey()){S.careData=null;return;}S.sheet=r.sheet;S.day=r.day;if(r.refusedSave)S.message=S.writeError=t('saveAgain');if(r.chatQuestion){S.chat.draft=r.chatQuestion;void openChat();}}
async function boot() {
  S.auth='loading';render();
  try {const session=await LittleDaysAPI.refreshSession();S.passcodeOff=session.passcodeOff===true;S.people=Array.isArray(session.people)?session.people:[];if(!session.me){S.auth='login';S.message='';render();return;}loadServerState(await LittleDaysAPI.state());resumeAfterSignIn();render();}
  catch(error){if(error.status===401){S.auth='login';S.message='';render();}else{S.auth='error';S.message=error.message||t('tryAgain');render();}}
}
async function submitPasscode(formEl){
  const passcode=String(new FormData(formEl).get('passcode')||'');
  S.auth='loading';S.message='';render();
  try{const body=await LittleDaysAPI.unlock(passcode);householdPasscode=passcode;S.people=Array.isArray(body.people)?body.people:[];S.auth='login';render();}
  catch(error){S.auth='login';S.message=error.status===401?t('passcodeWrong'):error.status===429?t('passcodeWait'):error.status===503?t('passcodeNotSet'):(error.message||t('tryAgain'));render();}
}
async function submitLogin(formEl){
  const username=String(new FormData(formEl).get('username')||'').trim();
  if(!username){S.message=t('loginRequired');render();return;}
  S.loginUser=username;resetChat();
  const passcode=householdPasscode;householdPasscode='';
  S.auth='loading';S.message='';render();
  try {await LittleDaysAPI.login(username,passcode);loadServerState(await LittleDaysAPI.state());resumeAfterSignIn();render();}
  catch(error){if(S.passcodeOff){await pickAgain(error.status===401?t('pickAgain'):(error.message||t('tryAgain')));return;}
    if(error.status===401||error.status===429){try{await LittleDaysAPI.refreshSession();}catch(_){}}S.people=[];S.auth='login';S.message=error.status===401?t('passcodeAgain'):(error.message||t('tryAgain'));render();}
}
document.addEventListener('submit',async ev=>{
  if(ev.target.id==='ai-form'){ev.preventDefault();await submitChat();return;}
  if(ev.target.id==='child-form'){
    ev.preventDefault();if(S.busy)return;
    const form=new FormData(ev.target),firstName=String(form.get('firstName')||'').trim(),birthDate=String(form.get('birthDate')||''),dueDate=String(form.get('dueDate')||'');
    S.setupDraft={...(S.setupDraft||{}),firstName,birthDate,dueDate};
    if(!firstName||firstName.length>255||!validDate(birthDate)||isoDay(birthDate)>0||isoDay(birthDate)< -1095){S.message=t('setupInvalid');render();return;}
    await submitChild(S.setupDraft);return;
  }
  if(ev.target.id==='passcode-form'){ev.preventDefault();await submitPasscode(ev.target);return;}
  if(ev.target.id!=='login-form')return;ev.preventDefault();
  await submitLogin(ev.target);
});
document.addEventListener('click',async ev=>{const b=ev.target.closest('[data-shell],[data-setting="night"],[data-setting][data-value]');if(!b)return;if(b.dataset.value&&b.dataset.setting){if(S.auth==='ready'){const v={lang:S.lang,units:unitsOf(),palette:S.pal,night:S.night};v[b.dataset.setting]=b.dataset.value;await persistPreferences(v);}return;}if(b.dataset.shell==='retry')boot();if(b.dataset.shell==='logout'){resetChat();S.auth='loading';render();try{await LittleDaysAPI.logout();S.sheet=null;S.drafts={};window.location.reload();}catch(error){S.auth='error';S.message=error.message||t('tryAgain');render();}}if(b.dataset.setting==='night')await persistPreferences({lang:S.lang,units:unitsOf(),palette:S.pal,night:!S.night});});

/* ---------- icons ---------- */
const ICON = {
  feed: '<path d="M9 3h6v3H9z"/><path d="M8 6h8v3l1 2v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-8l1-2z"/><path d="M7.5 13h9"/>',
  sleep: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  diaper: '<path d="M3 7h18v4c0 4-3 7-6 8l-3 1-3-1c-3-1-6-4-6-8z"/><path d="M3 9.5c5 3 13 3 18 0"/>',
  pump: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5"/>',
  med: '<path d="M10.5 3.5l10 10a4.2 4.2 0 0 1-6 6l-10-10a4.2 4.2 0 0 1 6-6z"/><path d="M8.5 8.5l7 7"/>',
  temp: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 9v7"/>',
  note: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  log: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chart: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  photo: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="16" cy="9.5" r="1.4"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5"/>',
  solids: '<path d="M12 3a3 4 0 0 0-3 4c0 2 1.5 3.5 3 3.5s3-1.5 3-3.5a3 4 0 0 0-3-4z"/><path d="M12 10.5V21"/>',
  tummy: '<circle cx="12" cy="7" r="3"/><path d="M5 20c0-4 3-7 7-7s7 3 7 7z"/>',
  bath: '<path d="M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z"/><path d="M6 12V6a2 2 0 0 1 4 0"/>',
  mile: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18.2v.1"/>',
};
const ic = (n, c = '') => `<svg class="i ${c}" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
// Look A (DESIGN.md): a heavy drawn line over a larger color shape that spills past it. Original drawings, each [tilt, shape, line].
const DRAWN = {
  bottle: [12, 'M9.6 9.6h4.8c1 0 1.8.8 1.8 1.8v8c0 1.2-1 2.2-2.2 2.2h-4c-1.2 0-2.2-1-2.2-2.2v-8c0-1 .8-1.8 1.8-1.8ZM9.6 9.6V7.2c.2-2.8 1-4.6 2.4-4.6s2.2 1.8 2.4 4.6v2.4Z',
    '<path d="M7.8 14v5.4c0 1.2 1 2.2 2.2 2.2h4c1.2 0 2.2-1 2.2-2.2v-8c0-1-.8-1.8-1.8-1.8H9.6c-.9 0-1.6.6-1.8 1.5M9 7.3h6M9.9 7.1c.2-2.7.9-4.5 2.1-4.5s1.9 1.8 2.1 4.5M13.2 13.4h3M14.2 16.6h2"/>'],
  moon: [-10, 'M10.2 4.3A8.3 8.3 0 1 0 19.7 13.8 6.8 6.8 0 0 1 10.2 4.3Z', '<path d="M10.2 4.3A8.3 8.3 0 1 0 19.7 13.8 6.8 6.8 0 0 1 9 6.6M18 2.8c.3 1.6.8 2.1 2.4 2.4-1.6.3-2.1.8-2.4 2.4-.3-1.6-.8-2.1-2.4-2.4 1.6-.3 2.1-.8 2.4-2.4Z"/>'],
  diaper: [5, 'M3.4 7.2c5.7 1.2 11.5 1.2 17.2 0 .3 6.8-3 12.7-8.6 12.9-5.6-.2-8.9-6.1-8.6-12.9Z',
    '<path d="M3.2 7.1c5.9 1.3 11.7 1.3 17.6 0M3.6 9.8c.5 5.6 3.5 10 8.4 10.2 4.9-.2 7.9-4.6 8.4-10.2M4.6 12.4c2.2.6 3.6 2 4.1 4.2M19.4 12.4c-2.2.6-3.6 2-4.1 4.2"/>'],
  nurse: [-6, 'M6.9 5.2C5 7.6 4.3 10.7 5.2 13.7c1 3.6 4 6 7.5 6 3.6 0 6.5-2.5 7.2-6.1.5-2.8-.4-5.6-2.3-7.6-3.5-1.6-7.2-1.8-10.7-.8Z',
    '<path d="M6.9 5.2C5 7.6 4.3 10.7 5.2 13.7c1 3.6 4 6 7.5 6 3.6 0 6.5-2.5 7.2-6.1.5-2.8-.4-5.6-2.3-7.6M13.1 13.6a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/>'],
  wet: [8, 'M9.2 3.8c2.3 2.9 4.1 5.5 4.1 7.9a4.1 4.1 0 0 1-8.2 0c0-2.4 1.8-5 4.1-7.9ZM17 11c1.4 1.8 2.5 3.3 2.5 4.8a2.5 2.5 0 0 1-5 0c0-1.5 1.1-3 2.5-4.8Z',
    '<path d="M9.2 3.8c2.3 2.9 4.1 5.5 4.1 7.9a4.1 4.1 0 0 1-8.2 0c0-1.6.8-3.2 1.9-4.9M17 11c1.4 1.8 2.5 3.3 2.5 4.8a2.5 2.5 0 0 1-5 0c0-.9.4-1.8 1-2.7"/>'],
  dirty: [-4, 'M12 4c1.8 1.3 2.4 2.9 1.7 4.4 2.6.3 4 2.1 3.6 4.1 2.2.7 3.1 2.4 2.6 4.4-.5 1.8-2.2 2.9-4.3 2.9H8.4c-2.1 0-3.8-1.1-4.3-2.9-.5-2 .4-3.7 2.6-4.4-.4-2 1-3.8 3.6-4.1.2-1.7.8-3.2 1.7-4.4Z',
    '<path d="M12 4c1.8 1.3 2.4 2.9 1.7 4.4 2.6.3 4 2.1 3.6 4.1 2.2.7 3.1 2.4 2.6 4.4-.5 1.8-2.2 2.9-4.3 2.9H8.4c-2.1 0-3.8-1.1-4.3-2.9-.5-2 .4-3.7 2.6-4.4-.4-2 1-3.8 3.6-4.1M8.3 16.2c2.5.7 4.9.7 7.4 0"/>'],
  note: [0, 'M5 19l.8-3.6L15.9 5.3a1.9 1.9 0 0 1 2.7 0l.2.2a1.9 1.9 0 0 1 0 2.7L8.7 18.3Z', '<path d="M8.7 18.3 5 19l.8-3.6L15.9 5.3a1.9 1.9 0 0 1 2.7 0l.2.2a1.9 1.9 0 0 1 0 2.7l-7.6 7.6M14.3 7l2.8 2.8"/>'],
  sprout: [4, 'M12 14.4c-3.9.1-6.2-1.9-6.6-5.6 4-.1 6.4 1.7 6.6 5.6ZM12 11.6c-.1-3.6 2-5.9 6.5-6.2.2 3.9-2.2 6.1-6.5 6.2Z',
    '<path d="M12 20.4v-8.8M12 14.4c-3.9.1-6.2-1.9-6.6-5.6 3-.1 5.1.9 6 3M12 11.6c-.1-3.6 2-5.9 6.5-6.2.1 3-1.2 5-3.8 5.8M8.6 20.4h6.8"/>'],
  pill: [38, 'M12 3.4c2.6 0 4.6 2 4.6 4.6v8c0 2.6-2 4.6-4.6 4.6S7.4 18.6 7.4 16V8c0-2.6 2-4.6 4.6-4.6Z', '<path d="M12 3.4c2.6 0 4.6 2 4.6 4.6v8c0 2.6-2 4.6-4.6 4.6S7.4 18.6 7.4 16V8c0-2.6 2-4.6 4.6-4.6M7.6 11.6h8.8"/>'],
  thermo: [10, 'M10 4.8a2 2 0 0 1 4 0v8a4 4 0 1 1-4 0Z', '<path d="M10 12.8V4.8a2 2 0 0 1 4 0v8M10 12.8a4 4 0 1 0 4 0M12 9.4v6.4M14.2 6.5h2M14.2 9.2h1.4"/>'],
  calendar: [0, 'M6.5 5.5h11c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2h-11c-1.1 0-2-.9-2-2v-10c0-1.1.9-2 2-2Z', '<path d="M4.7 10h14.6M8.5 3.6v3.4M15.5 3.6v3.4M4.6 8.2v9.3c0 1 .9 1.9 1.9 1.9h11c1 0 1.9-.9 1.9-1.9V8.2M8.4 13.6h2M13.4 13.6h2"/>'],
  clipboard: [-3, 'M6.5 5.5h11c1.1 0 2 .9 2 2v11c0 1.1-.9 2-2 2h-11c-1.1 0-2-.9-2-2v-11c0-1.1.9-2 2-2Z', '<path d="M9 4.2h6v3.2H9ZM7.8 5.8H6.6c-1 0-1.8.8-1.8 1.8v10.8c0 1 .8 1.8 1.8 1.8h10.8c1 0 1.8-.8 1.8-1.8V7.6c0-1-.8-1.8-1.8-1.8h-1.2M8.4 12h7.2M8.4 15.6h4.4"/>'],
  swap: [0, 'M12 3.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8Z', '<path d="M5.8 9h11.6M14 5.6 17.4 9 14 12.4M18.2 15H6.6M10 11.6 6.6 15 10 18.4"/>'],
  bell: [-6, 'M12 3.8c3.2 0 5.4 2.4 5.4 5.6 0 3.6.8 5.2 2 6.6H4.6c1.2-1.4 2-3 2-6.6 0-3.2 2.2-5.6 5.4-5.6Z', '<path d="M12 3.8c3.2 0 5.4 2.4 5.4 5.6 0 3.6.8 5.2 2 6.6H4.6c1.2-1.4 2-3 2-6.6 0-3.2 2.2-5.6 5.4-5.6M12 3.8V2.6M9.8 19a2.4 2.4 0 0 0 4.4 0"/>'],
  therm: [18, 'M12 3.4a2.2 2.2 0 0 1 2.2 2.2v8a4.2 4.2 0 1 1-4.4 0v-8A2.2 2.2 0 0 1 12 3.4Z', '<path d="M12 3.4a2.2 2.2 0 0 1 2.2 2.2v8a4.2 4.2 0 1 1-4.4 0v-8A2.2 2.2 0 0 1 12 3.4M12 11v6.2M14.2 7.2h2.4M14.2 10h1.6"/>'],
  cross: [0, 'M9.6 4h4.8v5.6H20v4.8h-5.6V20H9.6v-5.6H4V9.6h5.6Z', '<path d="M9.6 4h4.8v5.6H20v4.8h-5.6V20H9.6v-5.6H4V9.6h5.6V4.2"/>'],
  cal: [0, 'M5.2 6.4h13.6c.8 0 1.4.6 1.4 1.4v10.6c0 .8-.6 1.4-1.4 1.4H5.2c-.8 0-1.4-.6-1.4-1.4V7.8c0-.8.6-1.4 1.4-1.4Z', '<path d="M5.4 6.4h13.2c.9 0 1.6.7 1.6 1.6v10c0 .9-.7 1.6-1.6 1.6H5.4c-.9 0-1.6-.7-1.6-1.6V8c0-.9.7-1.6 1.6-1.6ZM3.8 10.6h16.4M8.2 3.8v3.4M15.8 3.8v3.4M8.4 14.2h.1M12 14.2h.1M15.6 14.2h.1"/>'],
  clock: [0, 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z', '<path d="M12 4a8 8 0 1 0 8 8M12 7.8V12l3 1.8"/>'],
  spoon: [-4, 'M3.8 10.8h16.4c0 4.7-3.3 8-8.2 8s-8.2-3.3-8.2-8Z', '<path d="M3.8 10.8h16.4c-.2 4.6-3.4 8-8.2 8-4.7 0-7.9-3.3-8.2-8M8.4 21.2h7.2M15.8 3.4l-2.6 5.2"/>'],
  star: [6, 'M12 3.6l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8Z', '<path d="M12 3.6l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8"/>'],
  tummy: [0, 'M7.6 5.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2ZM11 11.4c3.8-.2 7.4 1.2 8.6 4.8H5.4', '<path d="M7.6 5.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2ZM11 11.4c3.8-.2 7.4 1.2 8.6 4.8H6.2M3.6 19.2h16.8"/>'],
  bath: [0, 'M3.4 11.4h17.2c0 4.7-1.7 7.8-4.7 7.8H8.1c-3 0-4.7-3.1-4.7-7.8Z', '<path d="M3.4 11.4h17.2M4.9 11.4c.3 4.2 1.8 7.4 4.1 7.8h6c2.3-.4 3.8-3.6 4.1-7.8M7.2 19.4l-.7 1.8M16.8 19.4l.7 1.8M16.6 4.4a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4ZM11.8 6.4a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z"/>'],
  camera: [0, 'M5 8.4h3l1.4-2.2h5.2L16 8.4h3c.8 0 1.5.7 1.5 1.5v7.8c0 .8-.7 1.5-1.5 1.5H5c-.8 0-1.5-.7-1.5-1.5V9.9c0-.8.7-1.5 1.5-1.5Z', '<path d="M8 8.4l1.4-2.2h5.2L16 8.4M5 8.4c-.8 0-1.5.7-1.5 1.5v7.8c0 .8.7 1.5 1.5 1.5h14c.8 0 1.5-.7 1.5-1.5V9.9c0-.8-.7-1.5-1.5-1.5h-1.6M12 10.8a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/>'],
  bars: [0, 'M4.5 12h3.6v7.5H4.5ZM10.2 6.5h3.6v13h-3.6ZM15.9 9.5h3.6v10h-3.6Z', '<path d="M6.3 19.6v-7M12 19.6v-13M17.7 19.6V10M3.8 20.8h16.4"/>'],
};
const GLYPH = {
  spark: '<path d="M10.4 5.2c.7 4.2 2.2 5.7 6.4 6.4-4.2.7-5.7 2.2-6.4 6.4-.7-4.2-2.2-5.7-6.4-6.4 4.2-.7 5.7-2.2 6.4-6.4ZM18.4 3.6v3.6M16.6 5.4h3.6"/>',
  pause: '<path d="M9 6.5v11M15 6.5v11"/>',
  play: '<path d="M8.5 6.2v11.6l9.2-5.8Z"/>',
  ext: '<path d="M13.5 5.5h5v5M18.5 5.5l-7 7M16.5 14v3.2c0 .8-.6 1.3-1.3 1.3H6.8c-.7 0-1.3-.5-1.3-1.3V8.8c0-.7.6-1.3 1.3-1.3H10"/>',
  chev: '<path d="m9.5 6.5 5.5 5.5-5.5 5.5"/>',
  back: '<path d="M14.5 6.5 9 12l5.5 5.5"/>',
  chart: '<path d="M5.5 19.5v-6M12 19.5V5.5M18.5 19.5v-9.2"/>',
  photo: '<path d="M5.4 5h13.2c1 0 1.9.8 1.9 1.9v10.2c0 1-.9 1.9-1.9 1.9H5.4c-1 0-1.9-.9-1.9-1.9V6.9C3.5 5.8 4.4 5 5.4 5Z"/><path d="m4 16.2 4.3-4.4 3.5 3.4 2.6-2.5 5.5 5.2M15.3 8.9h.1"/>',
  plus: '<path d="M12 5.2v13.6M5.2 12h13.6"/>',
  trash: '<path d="M5.5 7.5h13M9.5 7.5V5.8c0-.6.4-1 1-1h3c.6 0 1 .4 1 1v1.7M7.3 7.5l.8 10.9c.1.8.7 1.3 1.4 1.3h5c.7 0 1.3-.5 1.4-1.3l.8-10.9M10.4 11v5.4M13.6 11v5.4"/>',
  gear: '<path d="M10.29 5.62L10.69 3.70L13.31 3.70L13.71 5.62A6.60 6.60 0 0 1 15.30 6.28L16.94 5.20L18.80 7.06L17.72 8.70A6.60 6.60 0 0 1 18.38 10.29L20.30 10.69L20.30 13.31L18.38 13.71A6.60 6.60 0 0 1 17.72 15.30L18.80 16.94L16.94 18.80L15.30 17.72A6.60 6.60 0 0 1 13.71 18.38L13.31 20.30L10.69 20.30L10.29 18.38A6.60 6.60 0 0 1 8.70 17.72L7.06 18.80L5.20 16.94L6.28 15.30A6.60 6.60 0 0 1 5.62 13.71L3.70 13.31L3.70 10.69L5.62 10.29A6.60 6.60 0 0 1 6.28 8.70L5.20 7.06L7.06 5.20L8.70 6.28A6.60 6.60 0 0 1 10.29 5.62ZM12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z"/>',
};
const glyph = n => `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g class="ln">${GLYPH[n]}</g></svg>`;
const drawnArt = n => { const [tilt, shape, line] = DRAWN[n]; return `<g transform="rotate(${tilt} 12 12)"><path class="shape" transform="translate(1.44 1) scale(1.1)" d="${shape}"/><g class="ln">${line}</g></g>`; };
// On a 40 px icon block (the block takes the care color from the nearest care class).
const iconBlock = n => `<svg class="ico" data-art="${n}" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><rect class="plate" width="40" height="40" rx="14"/><g transform="translate(6 6) scale(1.1667)">${drawnArt(n)}</g></svg>`;
// Bare: no color block behind the drawing. A Home tile or the running card is the block (round 2 icon(name, true)).
const iconBare = n => `<svg class="ico bare" data-art="${n}" viewBox="5 5 30 30" aria-hidden="true" focusable="false"><g transform="translate(8 8)">${drawnArt(n)}</g></svg>`;
// An empty state: a drawn icon above one sentence, so the state never relies on words alone. `action` is an optional button.
// The bunny lives in every empty state (DESIGN.md: Bunny). `icon` is kept so the callers still say what is empty.
const emptyState = (icon, text, action = '') => `<div class="empty empty-state c-plain" data-empty="${icon}">${LittleDaysBunny.svg('empty-bunny')}<p>${text}</p>${action}</div>`;
const TEXSHAPE = {  // one drawn shape per texture, so the word is never the only clue
  watery: '<path d="M4 11c3-4 5 4 8 0s5 4 8 0 5 4 8 0"/><path d="M4 21c3-4 5 4 8 0s5 4 8 0 5 4 8 0"/>',
  seedy: '<ellipse cx="24" cy="16" rx="18" ry="10"/><circle cx="16" cy="14" r="1.2"/><circle cx="24" cy="18" r="1.2"/><circle cx="31" cy="13" r="1.2"/><circle cx="21" cy="12" r="1.2"/><circle cx="29" cy="20" r="1.2"/>',
  soft: '<path d="M6 25c-2.5 0-3-5 1.5-5C6.5 15 12 14 14 17c1-5 9-6 11-1 4-2 8 1 7 4 4 0 5 5 1 5z"/>',
  formed: '<rect x="6" y="9" width="36" height="14" rx="7"/><path d="M16 9v14M32 9v14"/>',
  hard: '<circle cx="11" cy="20" r="4.5"/><circle cx="24" cy="12" r="4.5"/><circle cx="37" cy="20" r="4.5"/>',
};
const TEXES = Object.keys(TEXSHAPE);
const COLS = {yellow: '#E8C34A', green: '#5F8F45', brown: '#A8783F', black: '#23272B', red: '#B3262B', pale: '#EDEAE0'};

/* ---------- state and clock ---------- */
// English unless the person picks Español in Settings; the phone's language does not decide.
const DEFAULT_LANG = 'en';
const S = {chartSource: 'feeds', pal: 'Sorbet', lang: DEFAULT_LANG, night: false, view: 'phone', tab: 'home', me: '', duty: '', people: [], child: null, pendingChildSetup:null, preferences: {}, sheet: null, toast: null, units: {}, day: 0, chart: 'day', photoId: null, portrait:null, portraitDraft:null, portraitError:false, run: null, sleepRun: null, pumpRun:null,timers:[], entries: [], upcomingAppointments:[], drafts:{}, search:'',filter:'all', message:'', auth:'loading',busy:false,pendingOps:{},pendingSheetOperation:null,retrySame:null,retryLabel:'',retryAction:null,careData:null,careLoading:false,careConfirmPending:null,careOptInPending:null,careRevokePending:{},trendsLoading:false,trendsError:false,growthEntries:[],growthUnavailable:[],growthLoading:false,growthError:false,growthRequest:0,growthMeasure:'weight',chartDetail:null};
const todayISO = () => {const p=new Intl.DateTimeFormat('en-CA',{timeZone:LittleDaysZone.get(),year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return `${p.find(x=>x.type==='year').value}-${p.find(x=>x.type==='month').value}-${p.find(x=>x.type==='day').value}`;};
const nowM = () => { const p=new Intl.DateTimeFormat('en-GB',{timeZone:LittleDaysZone.get(),hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()); return +(p.find(x=>x.type==='hour')?.value||0)*60 + +(p.find(x=>x.type==='minute')?.value||0); };
function timerElapsed(timer){const started=Date.parse(timer?.startedAt||'');return Number.isFinite(started)?Math.max(0,(Date.now()-started)/60000):Math.max(0,nowM()-(timer?.t0??nowM()));}
S.factId='';resetChat();
let ID = 100, SID = 100, toastTimer = null;
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const pad = n => String(n).padStart(2, '0');
const clk = m => {  // 12-hour clock: "3:20 PM" in English, "3:20 p. m." in Spanish (Mexico)
  m = Math.floor(((m % 1440) + 1440) % 1440); const h = Math.floor(m / 60), es = S.lang === 'es';
  return `${h % 12 || 12}:${pad(m % 60)} ${es ? (h < 12 ? 'a. m.' : 'p. m.') : (h < 12 ? 'AM' : 'PM')}`;
};
const axisH = h => `${h % 12 || 12} ${S.lang === 'es' ? (h % 24 < 12 ? 'a. m.' : 'p. m.') : (h % 24 < 12 ? 'AM' : 'PM')}`;
/* ---------- units: every value is stored metric (Baby Buddy keeps plain numbers); conversion happens only for display and input ---------- */
const ML = 29.5735, OZ_KG = 0.0283495;
const rnd = (v, st) => Math.round(v / st) * st;
const trimN = v => String(+v.toFixed(2));
const c2f = c => c * 9 / 5 + 32, f2c = f => (f - 32) * 5 / 9;
const meKey=()=>String(typeof S.me==='object'?(S.me?.id||personName(S.me)):S.me);
const unitsOf = () => S.units[meKey()] || S.preferences.units || 'metric';
const DEFU = {temp: u => u === 'us' ? 'F' : 'C', vol: u => u === 'us' ? 'oz' : 'ml', wt: u => u === 'us' ? 'lb' : 'kg', len: u => u === 'us' ? 'in' : 'cm'};
const uLab = u => u === 'in' && S.lang === 'es' ? 'pulg' : u === 'F' || u === 'C' ? '°' + u : u;
const fmtTemp = (c, u = DEFU.temp(unitsOf())) => u === 'F' ? `${(Math.round(c2f(c) * 10) / 10).toFixed(1)} °F` : `${c.toFixed(1)} °C`;
const volNum = (ml, u) => u === 'oz' ? trimN(rnd((+ml || 0) / ML, .1)) : trimN(+ml || 0);
const fmtVol = (ml, u = DEFU.vol(unitsOf())) => `${volNum(ml, u)} ${u}`;
const ozOf = kg => Math.round(kg / OZ_KG);
const fmtWt = (kg, u = DEFU.wt(unitsOf())) => u === 'lb' ? `${Math.floor(ozOf(kg) / 16)} lb ${ozOf(kg) % 16} oz` : `${kg.toFixed(2)} kg`;
const fmtLen = (cm, u = DEFU.len(unitsOf())) => u === 'in' ? `${trimN(rnd(cm / 2.54, .25))} ${uLab('in')}` : `${cm.toFixed(1)} cm`;
const tempShown = s => s.tu === 'F' ? Math.round(c2f(s.c) * 10) / 10 : Math.round(s.c * 10) / 10;  // s.c stays the unrounded metric value; a unit chip never changes it
const dayOf = m => Math.floor(m / 1440);
// Sleep kind comes from the clock: Night from 8 PM to 7 AM (local time), as on the charts and Dim screen, Nap otherwise. One tap changes it.
const napNow = () => { const m = nowM(); return m >= 7 * 60 && m < 19 * 60; };  // R7 (2026-11-11): a start from 7 PM to 7 AM is night sleep

const WD = {en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], es: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']};
const wdName = back => { const d=new Date(`${dayISO(-back)}T12:00:00Z`); return WD[S.lang][d.getUTCDay()]; };

/* ---------- reads over the entries ---------- */
const inDay = (e, d) => e.t >= d * 1440 && e.t < (d + 1) * 1440;
const nowExactM = () => nowM() + (Date.now() % 60000) / 60000;
const lastOf = type => [...S.entries].filter(e => e.type === type && e.t <= nowExactM()).sort((a, b) => b.t - a.t)[0];
const nextSide = () => { const b = shownRun() || lastOf('feed'); return b?.side === 'L' ? 'R' : b?.side === 'R' ? 'L' : null; };
const sideWord = s => s === 'L' ? t('left') : s === 'R' ? t('right') : t('bottleW');
const sideLet = s => s === 'B' || s === 'bottle' ? 'B' : S.lang === 'es' ? (s === 'L' ? 'I' : 'D') : s;
const diaCounts = (d = 0) => { const l = S.entries.filter(e => e.type === 'diaper' && inDay(e, d)); return {w: l.filter(e => e.kind !== 'D').length, d: l.filter(e => e.kind !== 'W').length}; };

/* ---------- formatting ---------- */
function durText(m) { m = Math.max(1, Math.round(m)); const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${r} min`; }
const mmss = m => {  // elapsed timer as a duration ("14 m 05 s"), never a clock-like "14:05"
  const x = Math.max(0, Math.floor(m * 60)), h = Math.floor(x / 3600), mi = Math.floor(x % 3600 / 60), se = x % 60, u = S.lang === 'es' ? 'min' : 'm';
  const nb = '\u00a0';  // A number stays with its unit, so a line breaks only between units.
  return h ? `${h}${nb}h ${pad(mi)}${nb}${u} ${pad(se)}${nb}s` : `${mi}${nb}${u} ${pad(se)}${nb}s`;
};
// A running time is one form in the whole app: the unit form (12 m 04 s). Round 3 draws a clock; the director chose the unit form (2026-11-11).
const runClock=mmss;
const shiftISO=(iso,d)=>{const [y,m,day]=iso.split('-').map(Number),x=new Date(Date.UTC(y,m-1,day+d));return `${x.getUTCFullYear()}-${pad(x.getUTCMonth()+1)}-${pad(x.getUTCDate())}`};
const dayISO=d=>shiftISO(todayISO(),d);
const isoDay=(s,today=todayISO())=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return NaN;const [y,m,d]=s.split('-').map(Number),x=new Date(Date.UTC(y,m-1,d));if(x.getUTCFullYear()!==y||x.getUTCMonth()!==m-1||x.getUTCDate()!==d)return NaN;const [ty,tm,td]=today.split('-').map(Number);return Math.round((Date.UTC(y,m-1,d)-Date.UTC(ty,tm-1,td))/86400000);};
const clockAt=(h,m,p)=>`${+h||12}:${pad(m)} ${S.lang==='es'?(p==='PM'?'p. m.':'a. m.'):p}`;
const dateLabel = d => { const x = new Date(`${dayISO(d)}T12:00:00Z`); const mo = S.lang === 'es' ? ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return S.lang === 'es' ? `${x.getUTCDate()} ${mo[x.getUTCMonth()]}` : `${mo[x.getUTCMonth()]} ${x.getUTCDate()}`; };
const kindWord = k => k === 'W' ? t('wet') : k === 'D' ? t('dirty') : t('both');

const factMotion=matchMedia('(prefers-reduced-motion: reduce)'),factHover=matchMedia('(hover: hover)');
const FACT_TEXT_MS=7000,FACT_GRAPH_MS=12000;
let factMoved=false,factPaused=false,factTimer=null,factTimerId='',factTimerGraph=false,factTimerTotal=FACT_TEXT_MS,factTimerElapsed=0,factTimerStarted=0,factRedraw=false,factSwipeFacts=null;

/* ---------- home ---------- */
// Day totals, midnight to midnight. A part that is zero is left out, and an empty day shows no line.
function dayTotals(d) {
  const sleep=resourceAllowed('sleep')&&shownRun(S.sleepRun), feed=resourceAllowed('feedings')&&shownRun();
  return LittleDaysTrends.totals(chartEntries(),d,sleep?{t0:sleep.t0,now:nowM()}:null,feed?{...feed,dur:nowM()-feed.t0}:null);
}
const feedTotalsText=o=>[o.feeds&&t('feedCount',o.feeds),o.nurseMin&&durText(o.nurseMin),o.bottleMl&&chartVolume(o.bottleMl)].filter(Boolean).join(' · ');
const sleepTotalsText=o=>o.sleeps?`${durText(o.sleepMin)} · ${t('sleepCount',o.sleeps)}`:'';
// A number stays with its unit on a tile line, so a line breaks only between units (as the timer does).
const joinUnits=text=>text.replace(/(\d) (?=[a-zñ])/gi,'$1\u00a0');
// The fact's care type picks the icon block. A fact about no care type (an age tip, tummy time, a milestone) gets the neutral block.
const FACT_LOOK={feeds:['c-feed','bottle'],bottles:['c-feed','bottle'],diapers:['c-dia','diaper'],sleep:['c-sleep','moon']};
// A fact with a graph shows its number, the graph and a short note. The full sentence stays in fact.body for Ask.

// Every drawing's screen-reader label is the full fact sentence. Labels are page text (14 px), never text inside the drawing.
function factViz(f){
  const v=f.viz,label=esc(f.body),pct=n=>`${(100*n).toFixed(2)}%`;
  // By this time: a "usual" label left of the dashed line, then "Last N days" and a bold "Today" under the drawing.
  // Night sleep uses the same drawing around the average, with a weekday letter under each night (the latest one bold).
  if(v.kind==='columns'&&v.usual!=null)return `<div class="viz-diff" style="--n:${v.bars.length}"><span class="viz-usual" aria-hidden="true">${esc(v.usualLabel)}</span>${LittleDaysCharts.mini(v.bars,v.usual,label,v.floor)}`
    +(v.letters?`<div class="viz-days viz-diff-days" style="--n:${v.bars.length}" aria-hidden="true">${v.letters.map((l,i)=>`<span${i===v.letters.length-1?' class="val"':''}>${esc(l)}</span>`).join('')}</div>`
      :`<div class="viz-foot" aria-hidden="true"><span>${esc(v.span)}</span><span class="val">${esc(v.todayLabel)}</span></div>`)+'</div>';
  if(v.kind==='week')return weekViz(v);
  if(v.kind==='growth')return LittleDaysCharts.growthLine(v.points,esc(v.label||f.body))+`<div class="viz-ends" aria-hidden="true"><span>${esc(v.first)}</span><span class="val">${esc(v.last)}</span></div>`;
  if(v.kind==='columns')return LittleDaysCharts.mini(v.bars,null,label)
    +`<div class="viz-days" style="--n:${v.bars.length}" aria-hidden="true">${v.bars.map(b=>`<span${b.today?' class="val"':''}>${esc(b.label)}</span>`).join('')}</div>`;
  // Bottles: each number sits above its bar, and the hour labels sit under the line, at the drawing's own positions.
  const pad=LittleDaysCharts.DAYLINE_PAD*100,at=m=>`left:${(pad+(100-2*pad)*m/1440).toFixed(2)}%`;
  const nums=LittleDaysCharts.daylineLabels(v.marks,v.now).map(n=>`<span class="viz-num${n.hollow?' hollow':''}" style="left:${pct(n.x)};top:${pct(n.y)}">${esc(n.text)}</span>`).join('');
  return `<div class="viz-line">${LittleDaysCharts.dayline(v.marks,v.now,label)}<div class="viz-nums" aria-hidden="true">${nums}</div></div>`
    +`<div class="viz-hours" aria-hidden="true">${[6,12,18].map(h=>`<span style="${at(h*60)}">${axisH(h)}</span>`).join('')}</div>`;
}
// Last 7 days: one grid, each care row a subgrid, so the bar groups share both edges. With 14 finished days a heading names
// what the change column compares; it sits on the first row's label line. Each row reads as one sentence to a screen reader.
function weekViz(v){
  const head=v.change?`<span class="wk-head" aria-hidden="true">${esc(v.head)}</span>`:'';
  return `<div class="viz-week${v.change?' with-change':''}">${v.rows.map((r,i)=>`<div class="wk-row ${r.tone}" role="img" aria-label="${esc(r.label)}"><b class="wk-name" aria-hidden="true">${esc(r.name)}</b>${i?'':head}`
    +`<span class="wk-avg" aria-hidden="true">${esc(keepUnits(r.avg))}</span><span class="wk-bars" aria-hidden="true">${LittleDaysCharts.week(r.days)}</span>${v.change?`<span class="wk-change" aria-hidden="true">${esc(keepUnits(r.change||''))}</span>`:''}</div>`).join('')}</div>`;
}
// A duration ("14 h 51 min") stays on one line, as a number stays with its unit.
const keepUnits=text=>joinUnits(text).replace(/(\d\u00a0h) (?=\d)/g,'$1\u00a0');
// Order: headline, note, drawing (with its labels). A nursing note starts with the same dot the drawing uses.
const noteMark=f=>f.noteMark==='nurse'?'<svg class="note-mark" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4"/></svg>':'';
// A card that is only a number (big) shows it at 30 px. A wrapping headline keeps "·" at the end of its line.
const factFigure=f=>f.headline?`<p class="fact-figure${f.big?' big':''}">${esc(keepUnits(f.headline).replace(/ · /g,' · '))}</p>`:'';
const factNote=f=>f.note?`<p class="fact-note">${noteMark(f)}${esc(keepUnits(f.note))}</p>`:'';
const factLook=f=>factFigure(f)+factNote(f)+(f.viz?`<div class="fact-viz">${factViz(f)}</div>`:'');
function statusCard() {
  const facts=S.renderedFacts=factSwipeFacts||factPool(),fact=currentFact(facts),index=facts.findIndex(f=>f.id===fact?.id),several=facts.length>1,askOn=!!LittleDaysAPI.ai;
  const refs=factRefs(fact);
  const [tone,art]=FACT_LOOK[fact?.topic]||['c-plain','sprout'];
  const title=fact?.title||t('factEmpty'),body=fact?.body||t('factEmptyBody');
  const graph=Boolean(fact?.viz),total=graph?FACT_GRAPH_MS:FACT_TEXT_MS,same=factTimerId===(fact?.id||'')&&factTimerGraph===graph;
  const elapsed=same?Math.min(total,factTimerElapsed+(factTimer&&factTimerStarted?performance.now()-factTimerStarted:0)):0;
  const fillStyle=factMotion.matches?'':` style="animation-duration:${total}ms;animation-delay:-${Math.round(elapsed)}ms;animation-play-state:${factTimer&&same?'running':'paused'}"`;
  // At most 3 dots: a window that slides with the current fact. The current pill fills across the timer duration.
  const first=Math.max(0,Math.min(index-1,facts.length-3)),shown=facts.slice(first,first+3);
  const dots=shown.map((f,i)=>{const at=first+i,cur=at===index,more=(i===0&&at>0)||(i===shown.length-1&&at<facts.length-1);return `<span class="fact-dot${cur?' current':''}${more&&!cur?' more':''}">${cur?`<i class="fact-fill"${fillStyle}></i>`:''}</span>`}).join('');
  // Every fact shares one grid cell with the card, so the card keeps the height of the tallest fact and nothing below it moves.
  // A sizer carries its fact's own links, because the links share their row with the arrows and can wrap.
  const sizers=(facts.length?facts:[{title,body}]).map(f=>`<span class="fact-size" aria-hidden="true"><i class="fs-icon"></i><b class="fs-title" data-text="${esc(f.title)}"></b>${askOn?`<i class="ask-space" data-text="${esc(t('askShort'))}"></i>`:''}${f.headline||f.viz?`<span class="fs-body fact-look">${factLook(f)}</span>`:`<span class="fs-body" data-text="${esc(f.body)}"></span>`}<span class="fs-link">${factRefs(f,true)}</span></span>`).join('');
  const nav=several?`<div class="fact-navigation"><button type="button" class="fact-arrow" data-act="fact-previous" aria-label="${t('factPrevious')}">${glyph('back')}</button><div class="fact-dots" role="img" aria-label="${esc(t('factPosition',Math.max(0,index+1),facts.length))}"><span aria-hidden="true">${dots}</span></div><button type="button" class="fact-arrow" data-act="fact-next" aria-label="${t('factNext')}">${glyph('chev')}</button></div>`:'';
  return S.homeCardHTML=`<section class="card status insight ${tone}" aria-labelledby="fact-title" aria-roledescription="carousel" data-fact="${esc(fact?.id||'')}"><div class="fact-stack"><div class="fact-content">${iconBlock(art)}<h2 id="fact-title">${esc(title)}</h2>${askOn?`<button type="button" class="ask-pill" data-act="ask-ai" aria-label="${t('askAbout',esc(babyName()))}">${glyph('spark')}${t('askShort')}</button>`:''}${fact?.headline||fact?.viz?`<div class="fact-body fact-look">${factLook(fact)}</div>`:`<p class="fact-body">${esc(body)}</p>`}<div class="fact-actions">${refs}</div></div>${sizers}</div>${nav}</section>`;
}
function renderHomeCard(){
  if(!homeVisible()||S.sheet||S.confirmStop)return;
  if(factSwipe){factRedraw||='card';return;}
  if(!S.homeAccessBlocked&&$('[data-fact-outgoing]'))return;
  const card=$('.insight');
  if(!card)return;
  S.homeRenderedMinute=`${todayISO()}:${nowM()}`;
  const previous=S.homeCardHTML,html=statusCard();
  if(previous===html)return;
  const key=keyOf(document.activeElement);
  card.outerHTML=html;refocus(key);syncFactCarousel();
}
// auto: the timer turned the card. Only a person moving the card (swipe, arrows) keeps late daily facts from reopening Home on a fun card.
function moveFact(direction,swipe=null,auto=false){
  const latest=factPool(),facts=(S.renderedFacts||latest).filter(f=>latest.some(item=>item.id===f.id));
  const index=facts.findIndex(f=>f.id===S.factId);
  if(facts.length<2){redrawAfterFactPress();return;}
  if(!auto)factMoved=true;
  factTimerElapsed=0;factTimerStarted=0;
  const outgoing=swipe&&!factMotion.matches?swipe.content.cloneNode(true):null;
  S.factId=facts[(index+direction+facts.length)%facts.length].id;
  if(outgoing)factSwipeFacts=S.renderedFacts;
  render();
  factSwipeFacts=null;
  if(outgoing){
    outgoing.setAttribute('aria-hidden','true');outgoing.inert=true;
    outgoing.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
    outgoing.dataset.factOutgoing='';outgoing.style.pointerEvents='none';
    $('.fact-stack').append(outgoing);
    const distance=direction*$('.fact-content').offsetWidth;
    const options={duration:220,easing:'cubic-bezier(0.23, 1, 0.32, 1)'};
    const exit=outgoing.animate([{transform:`translateX(${swipe.offset}px)`},{transform:`translateX(${-distance}px)`}],options);
    exit.onfinish=exit.oncancel=()=>{outgoing.remove();renderHomeCard();};
    $('.fact-content').animate([{transform:`translateX(${swipe.offset+distance}px)`},{transform:'translateX(0)'}],options);
  }else if(!factMotion.matches)$('.fact-content')?.animate([{opacity:0.3,transform:`translateX(${direction*8}px)`},{opacity:1,transform:'translateX(0)'}],{duration:220,easing:'cubic-bezier(0.77, 0, 0.175, 1)'});
}
// A horizontal swipe on the insight card moves to the next or previous fact, as the arrows do (a manual move: the rotation stays paused).
// A swipe is at least 40 px and more horizontal than vertical. The one click that can follow it (before the next press or key) is dropped, so it never presses Ask, View log or Source.
const FACT_SWIPE_MIN=40;
let factSwipe=null,factSwiped=false;
const swipeDirection=(dx,dy)=>Math.abs(dx)>=FACT_SWIPE_MIN&&Math.abs(dx)>Math.abs(dy)?(dx<0?1:-1):0;
function resetFactDrag(start){
  if(!start?.content.isConnected)return;
  const offset=getComputedStyle(start.content).transform;
  start.content.style.transform='';
  if(!factMotion.matches&&offset!=='none')start.content.animate([{transform:offset},{transform:'translateX(0)'}],{duration:160,easing:'cubic-bezier(0.23, 1, 0.32, 1)'});
}
const redrawAfterFactPress=()=>{if(factRedraw)requestAnimationFrame(()=>{const pending=factRedraw;factRedraw=false;if(pending==='full')render();else if(pending)renderHomeCard();});};
function endFactSwipe(ev){
  const start=factSwipe;
  if(!start||ev.pointerId!==start.id)return;
  factSwipe=null;
  const direction=start.content.isConnected?swipeDirection(ev.clientX-start.x,ev.clientY-start.y):0;
  if(!direction){resetFactDrag(start);redrawAfterFactPress();syncFactCarousel();return;}
  factSwiped=true;
  if(!start.several){resetFactDrag(start);redrawAfterFactPress();return;}
  moveFact(direction,start);
}
document.addEventListener('pointerdown',ev=>{
  factSwiped=false;
  const card=ev.target.closest?.('.insight');
  if(!ev.isPrimary||(ev.pointerType==='mouse'&&ev.button!==0)||!card)return;
  const content=card.querySelector('.fact-content'),transform=getComputedStyle(content).transform;
  const offset=transform==='none'?0:new DOMMatrixReadOnly(transform).m41;
  content.getAnimations().forEach(a=>a.cancel());
  card.querySelectorAll('[data-fact-outgoing]').forEach(el=>el.remove());
  content.style.transform=factMotion.matches?'':`translateX(${offset}px)`;
  factSwipe={id:ev.pointerId,x:ev.clientX,y:ev.clientY,offset,origin:offset,content,card,several:!!card.querySelector('.fact-navigation'),horizontal:false};
  syncFactCarousel();
});
document.addEventListener('pointermove',ev=>{
  const start=factSwipe;
  if(!start||ev.pointerId!==start.id||!start.content.isConnected)return;
  const dx=ev.clientX-start.x,dy=ev.clientY-start.y;
  if(!start.horizontal){
    if(Math.abs(dy)>Math.max(6,Math.abs(dx))){factSwipe=null;resetFactDrag(start);redrawAfterFactPress();return;}
    if(Math.abs(dx)<=6||Math.abs(dx)<=Math.abs(dy))return;
    start.horizontal=true;start.card.setPointerCapture(ev.pointerId);
    clearTimeout(factTimer);factTimer=null;
  }
  if(factMotion.matches||!start.several)return;
  start.offset=start.origin+dx;
  start.content.style.transform=`translateX(${start.offset}px)`;
});
document.addEventListener('pointerup',endFactSwipe);
document.addEventListener('pointercancel',ev=>{if(factSwipe?.id===ev.pointerId){const start=factSwipe;factSwipe=null;resetFactDrag(start);redrawAfterFactPress();syncFactCarousel();}});
document.addEventListener('keydown',()=>{factSwiped=false;},true);
document.addEventListener('click',ev=>{if(factSwiped){factSwiped=false;ev.stopImmediatePropagation();ev.preventDefault();}},true);
function syncFactFill(card,total,elapsed,running,restart=false){
  const fill=card?.querySelector('.fact-dot.current .fact-fill');
  if(!fill||factMotion.matches)return;
  if(restart){fill.style.animation='none';void fill.offsetWidth;fill.style.animation='';}
  fill.style.animationDuration=`${total}ms`;
  fill.style.animationDelay=`-${Math.round(elapsed)}ms`;
  fill.style.animationPlayState=running?'running':'paused';
}
function syncFactCarousel(){
  const card=$('.insight');
  const blocked=S.auth!=='ready'||S.tab!=='home'||S.sheet||document.hidden||factPaused||factMotion.matches||factSwipe||!card?.querySelector('.fact-navigation')||(factHover.matches&&card.matches(':hover'))||card.contains(document.activeElement);
  // A card that changes kind under the same id (text to graph) restarts its timer with the new time (review r1, 2026-11-19).
  const graph=Boolean(card?.querySelector('.fact-content .fact-viz'));
  const total=graph?FACT_GRAPH_MS:FACT_TEXT_MS;
  const changed=factTimerId!==S.factId||factTimerGraph!==graph;
  if(changed){clearTimeout(factTimer);factTimer=null;factTimerId=S.factId;factTimerGraph=graph;factTimerTotal=total;factTimerElapsed=0;factTimerStarted=0;}
  if(blocked){
    if(factTimer){factTimerElapsed=Math.min(factTimerTotal,factTimerElapsed+(factTimerStarted?performance.now()-factTimerStarted:0));clearTimeout(factTimer);factTimer=null;factTimerStarted=0;}
    syncFactFill(card,factTimerTotal,factTimerElapsed,false,changed);
    return;
  }
  // A graph card turns after 12 s, a text card after 7 s (owner, 2026-11-19; was: a graph card did not turn).
  if(!factTimer){
    const remaining=Math.max(1,factTimerTotal-factTimerElapsed);
    factTimerStarted=performance.now();
    factTimer=setTimeout(()=>{factTimer=null;factTimerElapsed=0;factTimerStarted=0;moveFact(1,null,true);},remaining);
    syncFactFill(card,factTimerTotal,factTimerElapsed,true,changed);
  }
}
for(const event of ['pointerover','pointerout','focusin','focusout','visibilitychange'])document.addEventListener(event,()=>queueMicrotask(syncFactCarousel));
factMotion.addEventListener('change',()=>{document.getAnimations().filter(a=>a.id==='ui-enter').forEach(a=>a.cancel());if(S.auth==='ready'&&S.tab==='home')render();syncFactCarousel();});
function factPool(){
  if(S.homeAccessBlocked)return [];
  const today=todayISO(),nowMinutes=nowExactM(),lang=S.lang,units=unitsOf();
  const entries=homeEntries(today);
  const input={entries,child:S.child,permissions:S.permissions,today,nowMinutes,lang,units,
    readDates:homeReads,developmentCards:LittleDaysAPI.ai?S.developmentBatch?.cards||[]:[]};
  const base=LittleDaysInsights.pool({...input,entries:entries.filter(e=>homeReads.has(shiftISO(today,dayOf(e.t))))});
  const trends=globalThis.LittleDaysPersonalTrends?.pool(input)||[];
  const other=globalThis.LittleDaysPersonalTrends?base.filter(f=>f.kind==='source'||!['feeds','diapers','sleep'].includes(f.topic)):base;
  const growth=S.growthEntries.length&&!S.growthError&&globalThis.LittleDaysGrowthInsights?LittleDaysGrowthInsights.cards({
    ...input,entries:S.growthEntries,unavailable:S.growthUnavailable,chartSex:LittleDaysGrowthInsights.chartSex(S.preferences,S.child?.id)
  }):[];
  // Fun (daily facts, today's first, then milestone and about-her facts), then stat, alternating; Home opens on a fun card (owner, 2026-11-19).
  return LittleDaysInsights.mix([...other.filter(f=>f.kind==='source'),...other.filter(f=>f.fun),...trends.filter(f=>f.fun),...trends.filter(f=>!f.fun),...growth,...other.filter(f=>f.kind!=='source'&&!f.fun)]);
}
function currentFact(facts){
  const fact=facts.find(f=>f.id===S.factId)||facts[0];
  S.factId=fact?.id||'';
  return fact;
}
// A sizer copy (size=true) holds the same words and icons with nothing to press.
// A fact with sourceOnly (weight for length) shows only Source, so its link row keeps one line beside the controls (card mix, 2026-11-19).
const factRefs=(f,size=false)=>(f?.sourceOnly?['source']:['record','source']).map(kind=>f?.evidence?.find(ref=>ref.kind===kind)).filter(Boolean).map(ref=>size?`<i class="text-link">${ref.kind==='record'?t('factLog')+glyph('chev'):t('factSource')+glyph('ext')}</i>`:referenceHTML(ref,true)).join('');
function referenceHTML(ref,compact=false){
  if(ref.kind==='record'&&validDate(ref.date))return `<button type="button" class="text-link" data-act="fact-log" data-arg="${esc(ref.date)}">${esc(compact?t('factLog'):ref.label)}${compact?glyph('chev'):''}</button>`;
  if(ref.kind==='source'&&/^https:\/\//.test(ref.url||''))return `<a class="text-link" href="${esc(ref.url)}" target="_blank" rel="noopener noreferrer"${compact?' draggable="false"':''}${compact&&ref.label?` aria-label="${esc(`${t('factSource')}: ${ref.label}`)}"`:''}>${esc(compact?t('factSource'):ref.label||t('factSource'))}${compact?glyph('ext'):''}</a>`;
  return '';
}
const babyName=()=>S.child?.name||t('babyDefault');
function resetChat(){S.chat={generation:(S.chat?.generation||0)+1,draft:'',messages:[],loading:false,active:null,available:null,checking:false};}
// A new chat opens on its field with a fine pointer, and on its heading otherwise so a screen reader starts at the top.
function focusChat(){const field=$('#ai-question'),finePointer=matchMedia('(pointer: fine)').matches;(finePointer&&field?field:$('#chat-title'))?.focus({preventScroll:true});}
// Show the newest turn from its first line. A short turn leaves the thread at its end.
function showNewestTurn(){const th=$('.chat-thread'),turn=th?.lastElementChild;if(turn)th.scrollTop+=turn.getBoundingClientRect().top-th.getBoundingClientRect().top-parseFloat(getComputedStyle(th).paddingTop);}
function fitChatField(){const field=$('#ai-question');if(!field)return;field.style.height='auto';field.style.height=`${Math.min(field.scrollHeight,132)}px`;}
// render() hands the old scroll position to the next screen; Home starts at its top, where the pill is.
function closeChat(){S.tab='home';render();refreshHomeEvidence();$('[data-scroll]').scrollTop=0;$('[data-act="ask-ai"]')?.focus({preventScroll:true});}
async function openChat(){
  if(!LittleDaysAPI.ai)return;
  S.tab='chat';render();focusChat();showNewestTurn();
  if(S.chat.available!==null||S.chat.checking)return;
  const chat=S.chat;chat.checking=true;render();
  try{const status=await LittleDaysAPI.aiStatus();if(S.chat===chat&&S.auth==='ready')chat.available=status.available===true;}
  catch(error){if(S.chat===chat){if(error.status===401){await signInAgain(false);return;}chat.available=false;}}
  finally{if(S.chat===chat){chat.checking=false;render();}}
}
const chatErrorKey=status=>status===429?'aiLimit':status===503?'aiUnavailable':'aiFailed';
// A question joins the thread as soon as it is sent, and its answer lands under the same bubble.
// A failed question keeps its own error. Try again sends that question again; one request runs at a time.
async function submitChat(index){
  const chat=S.chat,turn=index===undefined?null:chat.messages[index],question=turn?turn.question:chat.draft.trim();
  if(!question||chat.loading||!chat.available||turn&&turn.answer!==null)return;
  const owner=meKey(),child=String(S.child?.id||''),current=()=>S.chat===chat&&S.auth==='ready'&&owner===meKey()&&child===String(S.child?.id||'');
  const message=turn||{question,answer:null,period:null,references:[],error:''};
  const earlier=chat.messages.slice(0,turn?index:chat.messages.length).filter(m=>m.answer!==null).slice(-2);
  const history=earlier.flatMap(m=>[{role:'user',text:m.question},{role:'assistant',text:m.answer.slice(0,3000)}]);
  if(!turn){chat.messages.push(message);chat.draft='';}
  message.error='';chat.loading=true;chat.active=message;render();if(!turn)showNewestTurn();
  try{
    const reply=await LittleDaysAPI.chat({question,lang:S.lang,history});
    if(!current())return;
    Object.assign(message,{answer:reply.answer,period:reply.period,references:reply.references||[]});
  }catch(error){
    if(!current())return;
    if(error.status===401){await signInAgain(false);if(S.resume)S.resume.chatQuestion=question;return;}
    message.error=chatErrorKey(error.status);
  }
  finally{if(current()){chat.loading=false;chat.active=null;render();if(!turn)showNewestTurn();}}
}
// One closed "Sources" control holds the date range and the references of an answer.
function chatSourcesHTML(m,i){
  const period=m.period?.label?`<p class="chat-period">${esc(m.period.label)}</p>`:'',refs=m.references.map(ref=>referenceHTML(ref)).join('');
  return period||refs?`<details class="chat-sources" data-chat-sources="${i}"${m.open?' open':''}><summary>${t('aiSources')}</summary>${period}${refs?`<div class="chat-references">${refs}</div>`:''}</details>`:'';
}
// Under a question with no answer: the loading line, or its error and, where a retry can work, Try again.
// Try again waits while another question is loading, so only one request runs.
function chatPendingHTML(m,i,c){
  if(m===c.active&&c.loading)return `<p class="chat-waiting" role="status">${LittleDaysBunny.svg('chat-bunny')}<span>${t('aiWaiting')}</span></p>`;
  if(!m.error)return '';
  const retry=m.error==='aiFailed'?`<button type="button" class="chat-retry" data-act="ai-retry" data-arg="${i}"${c.loading?' disabled':''}>${t('aiRetry')}</button>`:'';
  return `<div class="chat-failed"><p class="chat-error" role="alert">${t(m.error)}</p>${retry}</div>`;
}
function chatTurnHTML(m,i){
  const tail=m.answer!==null?`<p class="chat-answer">${esc(m.answer)}</p>${chatSourcesHTML(m,i)}`:chatPendingHTML(m,i,S.chat);
  return `<article class="chat-turn"><p class="chat-question">${esc(m.question)}</p>${tail}</article>`;
}
function chatHTML(){
  const c=S.chat,name=esc(babyName()),hasText=!!c.draft.trim();
  const status=c.checking?t('aiChecking'):c.available===false?t('aiUnavailable'):'';
  const blank=c.messages.length?'':`<p class="chat-blank">${LittleDaysBunny.svg('chat-blank-bunny')}${t('aiBlank',name)}</p>`;
  const field=`<textarea id="ai-question" data-fid="ai-question" name="question" rows="1" maxlength="1200" placeholder="${t('askAI')}" aria-label="${t('askAbout',name)}"${c.loading?' readonly':''}>${esc(c.draft)}</textarea>`;
  const send=`<button type="submit" class="chat-send" data-ai-send aria-label="${t('aiSend')}"${hasText?'':' hidden'}${!c.available||c.loading||!hasText?' disabled':''}><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg></button>`;
  return `<section class="chat-screen" aria-labelledby="chat-title">${blank}<div class="chat-thread" data-scroll role="log">${c.messages.map(chatTurnHTML).join('')}</div><p class="chat-notice">${t('aiNotice')}</p><p class="chat-status" role="status" aria-live="polite">${status}</p><form id="ai-form" class="chat-composer"><div class="chat-pill">${field}${send}</div></form></section>`;
}
// Header (round 2 .top): the bunny, the name, how old, and the short date at the right. No birth date, no age line.
function ageText() {
  const birth=S.child?.birthDate,days=-isoDay(birth);
  if(!(days>=0))return '';
  const [by,bm,bd]=birth.split('-').map(Number),[ty,tm,td]=todayISO().split('-').map(Number),months=(ty-by)*12+(tm-bm)-(td<bd?1:0);
  if(days<14)return t('ageDays',days);
  if(days<91)return t('ageWeeks',Math.floor(days/7));
  return months<24?t('ageMonths',months):t('ageYears',Math.floor(months/12));
}
function homeHeader() {
  const date=new Intl.DateTimeFormat(S.lang==='es'?'es-MX':'en-US',{timeZone:LittleDaysZone.get(),weekday:'short',month:'short',day:'numeric'}).format(new Date()),age=ageText();
  return `<header class="top">${S.child?.portrait?`<img class="home-portrait" src="${esc(S.child.portrait)}" alt="">`:`<button type="button" class="bunny-btn" aria-label="${t('bunnyTap')}">${LittleDaysBunny.svg('home-bunny')}</button>`}<div><h1>${esc(babyName())}</h1>${age?`<p class="sub">${age}</p>`:''}</div><p class="sub when">${date}</p></header>`;
}
// R1: a card in the care color while a timer runs. It opens the same form as the tile, and the live time counts up in place.
function runCardHTML(kind) {
  const feed=kind==='feed',paused=kind==='paused',r=feed?shownRun():paused?S.sleepPaused:shownRun(S.sleepRun);
  if(!r)return '';
  const secondary=(act,label,off='')=>`<button type="button" class="back" data-act="${act}"${off?' disabled':''}>${label}</button>`;
  if(paused){
    const who=personName(r.by),at=typeof r.pausedAt==='string'&&Number.isFinite(Date.parse(r.pausedAt))?clk(instantMinutes(r.pausedAt)):'';
    const sub=at?t('pausedAtBy',at,who&&esc(shownName(who))):who?t('pausedBy',esc(shownName(who))):'';
    return `<section class="card run-card t-sleep" aria-label="${ft('paused')}" data-r="R1">${iconBare('moon')}<div><h2>${glyph('pause')}${ft('paused')}</h2>${sub?`<span class="sub">${sub}</span>`:''}</div>${secondary('end-paused-sleep',t('stopSleep'),canStopRun()?'':'x')}</section>`;
  }
  const title=feed?t('runFeeding',r.side):t('asleep');
  const button=feed?secondary('open-feed',t('changeSideTime')):secondary('pause-sleep',ft('pauseSleep'),canStartTimer()?'':'x');
  return `<section class="card run-card ${feed?'t-feed':'t-sleep'}" aria-label="${title}" data-r="R1">${iconBare(feed?(r.side==='bottle'?'bottle':'nurse'):'moon')}<div><h2>${title}</h2><p class="clock" role="timer" data-live="${feed?'run':'sleep'}">${mmss(timerElapsed(r))}</p><span class="sub">${t('feedStarted',clk(r.t0),esc(shownName(r.by)))}</span></div>${button}</section>`;
}
const tileHTML=()=>[['t-feed','open-feed','bottle','feed'],['t-sleep','open-sleep','moon','sleep'],['t-dia','open-dia','diaper','diaper']]
  .map(([cls,act,art,word])=>`<button type="button" class="tile ${cls}" data-act="${act}">${iconBare(art)}${t(word)}</button>`).join('');
// A quiet bunny for rows: no idle motion, so the header bunny stays the one that moves.
const staticBunny=()=>LittleDaysBunny.svg('').replace(' data-idle','');
// Latest (round 2): one row for each care type that has a record. While a type's timer runs, its row is left out (R1).
// The Today card left Home on 2026-11-21, so the Timeline link lives here whenever any record or running timer exists.
function latestCard() {
  const now=nowM(),feedRunning=!!shownRun(),sleepActive=!!shownRun(S.sleepRun)||!!S.sleepPaused,rows=[];
  const row=(cls,art,title,sub)=>`<li class="row ${cls}">${iconBlock(art)}<div><strong>${joinUnits(title)}</strong><span class="sub">${joinUnits(sub)}</span></div></li>`;
  const feed=feedRunning?null:[...S.entries].filter(e=>(e.type==='feed'||e.type==='bottle')&&e.t<=nowExactM()).sort((a,b)=>b.t-a.t)[0];
  if(feed){
    const sub=feed.type==='bottle'?`${t('bottleW')} · ${fmtVol(feed.ml)}`:[t(feed.side==='L'?'sideLeft':feed.side==='R'?'sideRight':'sideBoth'),positive(feed.dur)&&durText(feed.dur)].filter(Boolean).join(' · ');
    rows.push(row('t-feed',feed.type==='bottle'?'bottle':'nurse',t('fedAgo',durText(now-feed.t)),sub));
  }
  const sleep=sleepActive?null:lastOf('sleep');
  if(sleep)rows.push(row('t-sleep','moon',t('awakeFor',durText(now-(sleep.t+sleep.dur))),t(sleep.nap===false?'lastNight':'lastNap',durText(sleep.dur))));
  const dia=lastOf('diaper');
  if(dia)rows.push(row('t-dia',dia.kind==='W'?'wet':dia.kind==='D'?'dirty':'diaper',t('changedAgo',durText(now-dia.t)),dia.kind==='W'?t('wet'):dia.kind==='D'?t('dirty'):t('wetDirty')));
  const none=`<div class="latest-empty" data-r="R3">${staticBunny()}<div><strong>${t('homeEmpty')}</strong><span class="sub">${t('homeEmptyHint')}</span></div></div>`;
  const hasLink=rows.length||S.entries.length||feedRunning||sleepActive;
  return `<section class="card"><h2>${t('latest')}</h2>${rows.length?`<ul>${rows.join('')}</ul>`:none}${hasLink?`<button type="button" class="textlink" data-r="R3" data-act="tab" data-arg="log">${t('seeTimeline')}${glyph('chev')}</button>`:''}</section>`;
}
// The ask row hides only when Chat has said it is unavailable. A check that fails leaves it showing.
function homeNav() {
  const row=(act,arg,icon,label,mark='')=>`<li${mark?` data-r="${mark}"`:''}><button type="button" class="nav-row" data-act="${act}"${arg?` data-arg="${arg}"`:''}>${icon}${label}<span class="chev">${glyph('chev')}</span></button></li>`;
  return `<nav class="card nav" aria-label="${t('tabsAria')}"><ul>${row('tab','charts',glyph('chart'),t('tabCharts'))}${row('tab','photos',glyph('photo'),t('tabPhotos'))}${S.chat.available===false||!LittleDaysAPI.ai?'':row('ask-ai','',staticBunny(),esc(t('askRow',babyName())))}${row('open-more','',glyph('plus'),t('logElse'))}${row('open-settings','',glyph('gear'),t('settings'),'R3')}</ul></nav>`;
}
// R3: a handoff note and the next appointment show under Latest, only when they exist.
function homeExtras() {
  const handoff=[...S.entries].reverse().find(e=>e.type==='note'&&e.title==='handoff');
  const note=S.dutyNote||handoff?.text||'',by=S.dutyNote?S.dutyNoteBy:(handoff?.by||''),sub=[by&&shownName(by),!S.dutyNote&&handoff&&clk(handoff.t)].filter(Boolean).join(' · ');
  const card=note?`<section class="card" data-r="R3" data-handoff="true"><h2>${t('handoff')}</h2><p>${esc(note)}</p>${sub?`<p class="sub">${esc(sub)}</p>`:''}</section>`:'';
  return card+upcomingAppointmentsHTML();
}
function homeHTML() {
  const runs=[shownRun()&&runCardHTML('feed'),shownRun(S.sleepRun)?runCardHTML('sleep'):S.sleepPaused&&runCardHTML('paused')].filter(Boolean);
  const latest=latestCard(),extras=homeExtras(),empty=!runs.length&&latest.includes('latest-empty');
  // Round 3, no record at all: Latest with "Nothing logged yet". Round 3 also drops the insight card here; the app keeps it (age facts do not need records) until the director says otherwise.
  const body=empty&&!extras?latest:`<div class="group">${latest}${extras}</div>`;
  // The Crying card (card C) joins the tiles in one group, and the cry question sits over the insight card (cry-ui.js).
  const tiles=LittleDaysCryUI.homeTilesHTML(`<section class="tiles" aria-label="${t('logAria')}">${tileHTML()}</section>`);
  const question=LittleDaysCryUI.askHTML(),insight=statusCard();
  const first=homeHeader()+(runs.length?`<div class="group">${runs.join('')}</div>`:'')+tiles+(question||insight);
  return `<div class="wrap"><div class="home-first">${first}</div>${question?insight:''}${body}${homeNav()}</div>`;
}
function themeRow(){const m=themeMode();return `<div class="theme-row"><span class="fl" id="theme-label">${t('themeTitle')}</span><div class="seg3" role="group" aria-labelledby="theme-label">${[['auto','themeAuto'],['on','themeOn'],['off','themeOff']].map(([k,w])=>`<button type="button" class="chip" data-act="theme" data-arg="${k}" aria-pressed="${m===k}">${ic('check','ck')}${t(w)}</button>`).join('')}</div><p>${t('themeHint')}</p></div>`;}
function upcomingAppointmentsHTML(){
  const next=[...(S.upcomingAppointments||[])].sort((a,b)=>a.t-b.t)[0];
  if(!next||!resourceAllowed('notes','view'))return '';
  const day=Math.floor(next.t/1440),date=new Intl.DateTimeFormat(S.lang==='es'?'es-MX':'en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'}).format(new Date(`${dayISO(day)}T12:00:00Z`));
  const place=[next.provider,next.location].filter(Boolean).join(' · ');
  // Two sub lines: the place, then the date and time together (director, 2026-11-11).
  return `<section class="card appt" data-r="R3"><h2>${t('nextAppt')}</h2><ul><li class="row t-plain">${iconBlock('calendar')}<div><strong><button type="button" class="rowlink" data-act="edit" data-arg="${esc(next.id)}">${esc(next.title)}</button></strong>${place?`<span class="sub">${esc(place)}</span>`:''}<span class="sub">${esc(`${date} · ${clk(next.t)}`)}</span></div></li></ul></section>`;
}
// A running sleep stops from a big button, like a feed (owner request, 2026-11-09). The sheet shows it disabled without the stop grant.
const sleepStopHTML=(r,label)=>`<button type="button" class="btn solid sleep-stop" data-act="stop-sleep" ${canStopRun(r)?'':'disabled'}>${label}</button>`;
function dockHTML(inSheet=false) {
  const r = shownRun(), sleep = !inSheet && shownRun(S.sleepRun), resume = !inSheet && !S.sheet && !r && !sleep && S.sleepPaused;
  // A paused sleep keeps one primary action pinned: Resume (round 3). The card's own button stops it.
  if (resume) return `<div class="dock"><button type="button" class="btn solid resume-bar" data-act="resume-sleep" ${canStartTimer()?'':'disabled'}>${ft('resumeSleep')}</button></div>`;
  if (!r && !sleep) return '';
  const needsAmount=r?.side==='bottle',disabled=needsAmount&&!bottleAmountOk(S.sheet)?'disabled':'';
  // Home pins one primary button for each timer (round 3). Switching sides lives in the running Feed form.
  if (!inSheet) {
    const feed = r && canStopRun(r) ? needsAmount?`<button type="button" class="btn solid feed-stop" data-act="open-feed">${t('finishBottle')}</button>`:`<button type="button" class="btn solid feed-stop" data-act="stop">${t('stopFeed')}</button>` : '';
    const nap = sleep && canStopRun(sleep) ? `<button type="button" class="btn solid sleep-stop" data-act="stop-sleep">${t('stopSleep')}</button>` : '';
    return `<div class="dock">${feed}${nap}</div>`;
  }
  const feed = r && canStopRun(r) ? `${['L','R','bottle'].filter(side=>side!==r.side).map(side=>`<button type="button" class="btn go" data-act="switch" data-arg="${side}" ${disabled}>${t('switchTo',esc(sideWord(side)))}</button>`).join('')}<button type="button" class="btn solid feed-stop" data-act="stop" ${disabled}>${t('stop')}</button>` : '';
  return `<div class="dock in-sheet">${feed}</div>`;
}

/* ---------- timeline (look-match: ported from the round-2 mockup's timeline(), totals() and rowOf()) ---------- */
function noteRow(e){return {cls:'f-off',icn:'note',title:e.what==='visit'?t('visitRecord'):e.title==='handoff'?t('handoff'):esc(e.title||t('note')),det:e.what==='visit'?esc(e.reason||e.provider||''):esc(e.text)};}
function otherRow(e){const appointment=e.what==='appointment';return {cls:'f-off',icn:appointment?'note':e.what,title:esc(e.title||(e.what==='mile'?e.title||t('mile'):t(e.what))),det:appointment?[e.provider&&esc(e.provider),e.location&&esc(e.location)].filter(Boolean).join(' · '):[e.food&&esc(e.food),e.amount!=null&&String(e.amount),e.dur&&durText(e.dur)].filter(Boolean).join(' · ')};}
// S.day is the oldest day shown. Today, Yesterday and the day before always show; "Show the day before" (R5) moves S.day back by one.
Object.assign(GLYPH,{check:GLYPH.check||'<path d="m5.5 12.5 4.2 4.2 8.8-9.2"/>',search:'<path d="M10.8 4.6a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4ZM15.4 15.4l4.6 4.6"/>',close:'<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'});
const TL_CHIPS=[['all','all','t-plain'],['feed','feed','t-feed'],['sleep','sleep','t-sleep'],['diaper','diaper','t-dia'],['other','tlOther','t-plain']];
const tlGroup=e=>['feed','bottle','pump'].includes(e.type)?'feed':e.type==='sleep'||e.type==='diaper'?e.type:'other';
const tlDays=()=>Array.from({length:1-Math.min(S.day,-2)},(_,i)=>-i);
const tlDur=m=>joinUnits(durText(m));
const tlJoin=parts=>parts.filter(Boolean).join(' · ');
// A sleep names itself by the kind saved with it. A record with no saved kind follows its start: 7 PM to 7 AM is night.
const tlNight=e=>typeof e.nap==='boolean'?!e.nap:(m=>m>=1140||m<420)(((e.t%1440)+1440)%1440);
const tlDayDate=d=>`${wdName(-d)}, ${dateLabel(d)}`;
// Today and Yesterday carry their date beside the name; an older day is only its date.
const tlDayHead=d=>d>=-1?`<h2>${d?t('yesterday'):t('today')}<span class="sub">${tlDayDate(d)}</span></h2>`:`<h2>${tlDayDate(d)}</h2>`;
// A neutral block for a record with no care color: the plate of the other blocks, with the plain line drawing on it.
const plainBlock=n=>`<svg class="ico" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><rect class="plate" width="40" height="40" rx="14"/><g class="ln" transform="translate(6 6) scale(1.1667)">${ICON[n]||ICON.note}</g></svg>`;
const tlBlock=(art,icn)=>art?iconBlock(art):plainBlock(icn);
// One row: [care class, drawn art, plain icon, title, second line, time]. A sleep that crosses midnight gives each day its own part, so the rows add up to the day total.
// c is what every row shares: the author, the saved note and the length.
const tlTime=e=>clk(e.t);
const TL_ROWS={
  feed:(e,c)=>['t-feed','nurse','',e.side==='B'?t('bothBreasts'):`${t('breast')} · ${e.side==='L'?t('left'):t('right')}`,tlJoin([c.dur,c.by])+c.note,tlTime(e)],
  bottle:(e,c)=>['t-feed','bottle','',`${t('bottleW')} · ${fmtVol(e.ml)}`,tlJoin([e.milk==='breast'?t('milkBreast'):t('milkFormula'),c.dur,c.by])+c.note,tlTime(e)],
  pump:(e,c)=>['t-plain','','pump',t('pump'),tlJoin([e.ml&&fmtVol(e.ml),c.dur,c.by])+c.note,tlTime(e)],
  diaper:(e,c)=>['t-dia',e.kind==='W'?'wet':e.kind==='D'?'dirty':'diaper','',`${t('diaper')} · ${e.kind==='W'?t('wet'):e.kind==='D'?t('dirty'):t('tlWetDirty')}`,
    tlJoin([[e.tex&&tt('tex',e.tex),e.col&&tt('col',e.col)].filter(Boolean).join(', '),c.by])+c.note,tlTime(e)],
  note:(e,c)=>{const r=noteRow(e);return ['t-plain','note','',tlJoin([r.title,c.by]),r.det+c.note,tlTime(e)];},
};
function tlSleepParts(e,c,lo) {
  const whole=positive(e.dur)?e.dur:0,a=Math.max(e.t,lo),z=whole?Math.min(e.t+whole,lo+1440):a,NB=' ',title=tlNight(e)?t('tlNight'):t('napW');
  if(!whole)return ['t-sleep','moon','',title,c.by+c.note,tlTime(e)];
  const sub=z-a<whole?`${tlDur(z-a)}${NB}${t('tlOf')}${NB}${tlDur(whole)}<br>${c.by}`:`${tlDur(whole)} ·${NB}${c.by}`;
  return ['t-sleep','moon','',title,sub+c.note,`${a%1440?clk(a):t('tlMidnight')}<br>${t('tlTo')} ${z%1440?clk(z):t('tlMidnight').toLowerCase()}`];
}
// A record with no care color: medicine, temperature, growth, a reminder, and the other kinds.
function tlOtherParts(e,c) {
  const r=e.type==='other'?otherRow(e):e.type==='med'?{icn:'med',title:t('medicine'),det:`${esc(e.name)}, ${esc(e.dose)} ${esc(e.unit||'')}`}:e.type==='temp'?{icn:'temp',title:t('temp'),det:fmtTemp(e.c)}
    :e.type==='growth'?{icn:'ruler',title:t('growth'),det:[e.kg!=null&&fmtWt(e.kg),e.cm!=null&&fmtLen(e.cm),e.head!=null&&fmtLen(e.head)].filter(Boolean).join(' · ')}
    :{icn:'sleep',title:`${t('recipient')} · ${t(e.what)}`,det:`${esc(shownName(e.recipient))} · ${dateLabel(e.day)} ${clockAt(e.hour,e.minute,e.period)}`};
  return ['t-plain','',r.icn,r.title,tlJoin([r.det,c.by])+c.note,tlTime(e)];
}
function tlParts(e,lo) {
  const c={by:esc(shownName(e.by)),note:e.note?`<br>${esc(e.note)}`:'',dur:positive(e.dur)?tlDur(e.dur):''};
  return e.type==='sleep'?tlSleepParts(e,c,lo):TL_ROWS[e.type]?TL_ROWS[e.type](e,c):tlOtherParts(e,c);
}
const tlRow=(e,lo)=>{const [cls,art,icn,title,sub,when]=tlParts(e,lo),swipe=swipeable(e),open=swipe&&S.swipeOpen===e.id;
  return `<li class="row ${cls}${swipe?' swipe':''}${open?' open':''}" data-row="${e.id}">${tlBlock(art,icn)}<span><strong><button type="button" class="rowlink rowedit" data-act="edit" data-arg="${e.id}">${title}</button></strong><span class="sub">${sub}</span></span><time>${when}</time>${swipe?swipeDeleteHTML(e,title,when,open):''}</li>`;};
const tlRunRow=(cls,art,title,run)=>`<li class="row ${cls}">${iconBlock(art)}<span><strong>${title}</strong><span class="sub">${t('tlRunning')} · ${esc(shownName(run.by))}</span></span><time>${clk(run.t0)}</time></li>`;
// Day totals follow the chip. A care type with no record that day is left out, and the Other chip shows none.
function dayTotalsParts(d) {
  const o=dayTotals(d),c=diaCounts(d),all=S.filter==='all',show=id=>all||S.filter===id;
  return [[show('feed')&&feedTotalsText(o),'t-feed','feed'],[show('sleep')&&sleepTotalsText(o),'t-sleep','sleep'],[show('diaper')&&(c.w||c.d)&&t('dayCounts',c.w,c.d),'t-dia','diaper']].filter(([text])=>text);
}
const dayTotalsRows=d=>dayTotalsParts(d).map(([text,cls,word])=>`<div class="total ${cls}"><dt>${t(word)}</dt><dd>${joinUnits(text)}</dd></div>`).join('');
const dayTotalsHTML=d=>{const rows=dayTotalsRows(d);return rows?`<div class="card"><dl class="totals" data-day-totals="${d}">${rows}</dl></div>`:'';};
// What a row shows, as plain lowercase text in the current language, plus the note text. Field names are not part of it.
const tlPlain=html=>new DOMParser().parseFromString(String(html).replace(/<br\s*\/?>/gi,' '),'text/html').body.textContent;
const tlSearchText=(e,lo)=>{const [,,,title,sub,when]=tlParts(e,lo);return [tlPlain(title),tlPlain(sub),tlPlain(when),e.note||'',e.text||''].join(' ').replace(/\s+/g,' ').toLowerCase();};
// The records of one day under the chip and the search word. A sleep that crossed midnight is in both days.
const tlRowsOf=(d,q)=>{const lo=d*1440,hi=lo+1440,word=q.replace(/\s+/g,' ');
  return S.entries.filter(e=>e.t<hi&&(e.type==='sleep'&&positive(e.dur)?e.t+e.dur>lo:e.t>=lo)&&(S.filter==='all'||tlGroup(e)===S.filter)
    &&(!word||tlSearchText(e,lo).includes(word))).sort((a,b)=>a.t-b.t).reverse();};
function tlDay(d) {
  const lo=d*1440,filter=S.filter,live=[];
  if(d===0){
    if(shownRun()&&(filter==='all'||filter==='feed'))live.push(tlRunRow('t-feed',S.run.side==='bottle'?'bottle':'nurse',S.run.side==='bottle'?t('bottleW'):`${t('breast')} · ${S.run.side==='L'?t('left'):t('right')}`,{by:S.run.by,t0:S.run.t0}));
    const sr=shownRun(S.sleepRun);if(sr&&(filter==='all'||filter==='sleep'))live.push(tlRunRow('t-sleep','moon',t('sleep'),sr));
  }
  const rows=tlRowsOf(d,''),none=filter==='all'?t('tlNothing'):t('tlNoType',t(filter==='other'?'tlOther':filter).toLowerCase());
  return `<section class="day" data-day="${d}">${tlDayHead(d)}${dayTotalsHTML(d)}
    ${rows.length||live.length?`<ul class="card list">${live.join('')}${rows.map(e=>tlRow(e,lo)).join('')}</ul>`:`<div class="card"><p class="sub">${none}</p></div>`}</section>`;
}
// Search results (R5): the same day groups and rows, only the days that match, over every record the app holds.
function tlResults(q) {
  if(!q)return `<div class="card"><p class="sub">${t('tlSearchHint')}</p></div>`;
  const oldest=Math.min(0,...S.entries.map(e=>dayOf(e.t))),groups=Array.from({length:1-oldest},(_,i)=>-i).map(d=>[d,tlRowsOf(d,q)]).filter(([,rows])=>rows.length);
  return groups.length?groups.map(([d,rows])=>`<section class="day" data-day="${d}">${tlDayHead(d)}<ul class="card list">${rows.map(e=>tlRow(e,d*1440)).join('')}</ul></section>`).join(''):`<div class="card"><p class="sub">${t('tlNoRecords')}</p></div>`;
}
const tlSearchOpen=()=>!!S.searchOpen||!!S.search;
// The search button sits at the right of the title bar and turns into a close button while the field is open (R5).
const tlBarEnd=()=>`<button type="button" class="back only" data-act="search-toggle" data-r="R5" aria-label="${t(tlSearchOpen()?'tlCloseSearch':'searchShort')}" aria-expanded="${tlSearchOpen()}">${glyph(tlSearchOpen()?'close':'search')}</button>`;
function timelineHTML() {
  const q=(S.search||'').trim().toLowerCase(),open=tlSearchOpen(),chip=([id,word,cls])=>`<button type="button" class="chip ${cls}" data-act="filter" data-arg="${id}"${id==='other'?' data-r="R5"':''} aria-pressed="${S.filter===id}">${id==='all'?'':'<span class="dot"></span>'}${t(word)}</button>`;
  const search=open?`<div class="tl-search" data-r="R5"><input class="field" type="search" data-fid="search" aria-label="${t('tlSearchLabel')}" placeholder="${t('searchShort')}" value="${esc(S.search||'')}" autocomplete="off" enterkeyhint="search"></div>`:'';
  return `<div class="wrap">${search}<div class="chips tl-chips" role="group" aria-label="${t('filter')}">${TL_CHIPS.map(chip).join('')}</div>${open?`<div class="wrap-results">${tlResults(q)}</div>`
    :`${tlDays().map(tlDay).join('')}<button type="button" class="textlink" data-act="earlier-day" data-r="R5">${t('tlEarlier')}${glyph('chev')}</button>`}</div>`;
}
// The day before the oldest one comes too: a sleep that began there gives each day its minutes after midnight. Each day is asked for once.
const loadTimelineDays=(force=false)=>{const days=new Set();for(const d of tlDays().filter(d=>d<=-1)){days.add(d);days.add(d-1);}return Promise.all([...days].map(d=>loadDayRange(d,d,force)));};
function tlAction(a,arg) {
  if(a==='filter'){S.filter=arg;return true;}
  if(a==='search-toggle'){S.searchOpen=!tlSearchOpen();if(!S.searchOpen)S.search='';else requestAnimationFrame(()=>$('[data-fid=search]')?.focus({preventScroll:true}));return true;}
  if(a==='earlier-day'){S.day=Math.min(S.day,-2)-1;queueMicrotask(()=>void loadTimelineDays());return true;}
  if(a==='swipe-delete'){startSwipeDelete(arg);return true;}
  if(a==='swipe-undo'){undoSwipeDelete();return true;}
  return false;
}
// With a timer running, today's totals count up when the minute changes. Only their text changes, so a field being typed in keeps its focus.
function updateTimelineTotals() {
  const rows=dayTotalsRows(0),dl=$('[data-day-totals="0"]');
  if(dl)dl.innerHTML=rows;else if(rows)$('[data-day="0"] > h2')?.insertAdjacentHTML('afterend',dayTotalsHTML(0));
}

/* ---------- Timeline: swipe a row left to delete it (owner, 2026-11-11) ---------- */
// A left swipe opens one row and shows one Delete button behind it. The swipe never deletes by itself.
// The Delete tap sends the same request as the edit form's Delete, but only when the "Deleted" toast ends (Undo cancels it), so no record is lost.
const SWIPE_W=88,SWIPE_FOLLOW=10,SWIPE_UNDO_MS=6000,SWIPE_EASE='transform 180ms cubic-bezier(0.77, 0, 0.175, 1)';
let rowDrag=null,rowDragged=false,swipeScroll=0;
const rowPending=e=>S.retrySame?.id===e.id||Object.values(S.pendingOps||{}).some(op=>op.context?.sheet?.id===e.id);
const swipeable=e=>canDeleteEntry(e)&&!rowPending(e)&&!S.swipeHidden?.has(String(e.id));
function swipeDeleteHTML(e,title,when,open){
  const box=document.createElement('div');box.innerHTML=`${title}, ${when}`.replace(/<br>/g,' ');
  const name=box.textContent.replace(/\s+/g,' ').trim();
  return `<button type="button" class="swipe-del" data-act="swipe-delete" data-arg="${e.id}" aria-label="${esc(t('deleteRow',name))}"${open?'':' aria-hidden="true" tabindex="-1"'}>${glyph('trash')}<span>${t('deleteShort')}</span></button>`;
}
function swipeToastHTML(tt){
  const left=Math.max(0,Math.ceil((tt.until-Date.now())/1000));
  return `<div class="toast" role="status" key="${tt.k}"><span>${esc(tt.text())}</span><button type="button" class="u" data-act="swipe-undo">${t('undo')} <span class="cdn" aria-hidden="true" data-countdown="${tt.until}" data-kind="swipe">${left} s</span></button><span class="cd" style="animation-duration:${tt.total}ms;animation-delay:-${Math.max(0,tt.total-(tt.until-Date.now()))}ms"></span></div>`;
}
// A sleep that crosses midnight is listed under both days: two rows share one data-row, so every row with it opens and closes together.
const swipeRowsOf=id=>id?[...document.querySelectorAll(`.swipe[data-row="${CSS.escape(id)}"]`)]:[];
function setSwipeRow(row,open,animate){
  row.style.transition=animate&&!factMotion.matches?SWIPE_EASE:'none';
  row.style.transform=`translateX(${open?-SWIPE_W:0}px)`;
  row.classList.toggle('open',open);
  const button=row.querySelector('.swipe-del');
  if(open){button.removeAttribute('aria-hidden');button.removeAttribute('tabindex');}else{button.setAttribute('aria-hidden','true');button.tabIndex=-1;}
}
function closeSwipeRow(animate=true){const rows=swipeRowsOf(S.swipeOpen);S.swipeOpen=null;rows.forEach(r=>setSwipeRow(r,false,animate));}
function openSwipeRow(row){
  if(S.swipeOpen&&S.swipeOpen!==row.dataset.row)closeSwipeRow();
  S.swipeOpen=row.dataset.row;swipeScroll=$('[data-scroll]')?.scrollTop||0;swipeRowsOf(S.swipeOpen).forEach(r=>setSwipeRow(r,true,true));
}
function followRowDrag(ev){
  const d=rowDrag;if(!d||ev.pointerId!==d.id)return;
  const dx=ev.clientX-d.x,dy=ev.clientY-d.y;
  if(!d.on){if(Math.abs(dx)<SWIPE_FOLLOW||Math.abs(dx)<=Math.abs(dy))return;d.on=true;d.row.classList.add('dragging');d.row.style.transition='none';}
  d.row.style.transform=`translateX(${Math.max(-SWIPE_W,Math.min(0,d.base+dx))}px)`;
}
function endRowDrag(ev,cancelled){
  const d=rowDrag;rowDrag=null;if(!d||ev.pointerId!==d.id||!d.on)return;
  rowDragged=true;d.row.classList.remove('dragging');
  const dir=cancelled?0:swipeDirection(ev.clientX-d.x,ev.clientY-d.y),open=dir===1||(dir===0&&d.base<0);
  if(open)return openSwipeRow(d.row);
  if(S.swipeOpen===d.row.dataset.row)S.swipeOpen=null;
  swipeRowsOf(d.row.dataset.row).forEach(r=>setSwipeRow(r,false,true));
}
document.addEventListener('pointerdown',ev=>{
  rowDragged=false;
  const row=ev.isPrimary&&(ev.pointerType!=='mouse'||ev.button===0)&&!ev.target.closest?.('.swipe-del')&&ev.target.closest?.('.swipe');
  rowDrag=row?{id:ev.pointerId,row,x:ev.clientX,y:ev.clientY,base:row.classList.contains('open')?-SWIPE_W:0,on:false}:null;
});
document.addEventListener('pointermove',followRowDrag);
document.addEventListener('pointerup',ev=>endRowDrag(ev,false));
document.addEventListener('pointercancel',ev=>endRowDrag(ev,true));
// The click that follows a swipe is dropped. A tap on an open row closes it and opens nothing; a tap anywhere else closes it and goes on.
document.addEventListener('click',ev=>{
  if(rowDragged){rowDragged=false;ev.stopImmediatePropagation();ev.preventDefault();return;}
  if(!S.swipeOpen||S.sheet||ev.target.closest?.('.swipe-del'))return;
  const onOpenRow=!!ev.target.closest?.('.swipe.open');
  closeSwipeRow();
  if(onOpenRow){ev.stopImmediatePropagation();ev.preventDefault();}
},true);
document.addEventListener('keydown',ev=>{
  if(ev.key!=='Escape'||!S.swipeOpen||S.sheet)return;
  const held=document.activeElement?.closest?.('.swipe.open');
  closeSwipeRow();if(held)held.querySelector('.rowedit')?.focus({preventScroll:true});
});
// A scroll closes the open row. The scroll position that render() restores is the same number, so it does not.
document.addEventListener('scroll',ev=>{if(S.swipeOpen&&ev.target.matches?.('[data-scroll]')&&Math.abs(ev.target.scrollTop-swipeScroll)>2)closeSwipeRow();},true);

// A Delete waits for Undo in S.swipeDel. S.swipeHidden holds every record taken off the screen until the server has answered.
const hideDeleted=list=>S.swipeHidden?.size?list.filter(e=>!S.swipeHidden.has(String(e.id))):list;
const putBack=p=>{S.swipeHidden?.delete(p.id);if(S.swipeDel===p)S.swipeDel=null;if(!S.entries.some(e=>String(e.id)===p.id))S.entries=[...S.entries,p.entry].sort((a,b)=>a.t-b.t);};
function startSwipeDelete(id){
  const e=S.entries.find(x=>String(x.id)===String(id));
  if(!e||!swipeable(e))return;
  commitSwipeDelete();
  const p={id:String(e.id),entry:e,target:{id:e.id},k:Math.random(),sent:false};
  (S.swipeHidden||=new Map()).set(p.id,p);S.swipeDel=p;S.swipeOpen=null;
  S.entries=S.entries.filter(x=>x!==e);
  clearTimeout(toastTimer);
  S.toast={text:()=>t('deleted'),undoId:null,undoUntil:null,pending:false,swipeUndo:true,k:p.k,total:SWIPE_UNDO_MS,until:Date.now()+SWIPE_UNDO_MS};
  p.timer=setTimeout(()=>commitSwipeDelete(),SWIPE_UNDO_MS);
}
function undoSwipeDelete(){
  const p=S.swipeDel;if(!p||p.sent)return;
  clearTimeout(p.timer);putBack(p);S.toast=null;showDone(t('undone'));
}
// Send the waiting delete now: the toast ended or was dismissed, the Timeline was left, or the page is going away (urgent: keepalive, no waiting for a busy app).
function commitSwipeDelete(urgent=false){
  const p=S.swipeDel;if(!p||p.sent)return;
  clearTimeout(p.timer);
  if(S.busy&&!urgent){p.timer=setTimeout(()=>commitSwipeDelete(),300);return;}
  p.sent=true;if(S.toast?.k===p.k)S.toast=null;
  const done=()=>{S.swipeHidden?.delete(p.id);if(S.swipeDel===p)S.swipeDel=null;};
  // The row has already left S.entries, so the entry kept with the swipe says whether it was a measurement.
  void removeEntry(p.target,null,{label:()=>t('deleted'),undoable:false,keepalive:urgent,growth:p.entry.type==='growth',onSaved:done,onTerminal:()=>putBack(p)});
}
// Every render asks: a toast that is gone, or a screen other than the Timeline, sends the waiting delete at once.
function syncSwipeDelete(){
  const p=S.swipeDel;
  if(p&&!p.sent&&(S.tab!=='log'||S.toast?.k!==p.k))queueMicrotask(()=>commitSwipeDelete());
  if(S.tab!=='log')S.swipeOpen=null;
}
window.addEventListener('pagehide',()=>commitSwipeDelete(true));
document.addEventListener('visibilitychange',()=>{if(document.hidden)commitSwipeDelete(true);});

/* ---------- charts: the approved look (look-match, 2026-11-11) ---------- */
// A duration is "9 h 5 min": the mockup's form, with a number kept next to its unit.
const chartDuration = minutes => {const m=Math.max(0,Math.round(minutes));return t('chartDuration',Math.floor(m/60),m%60);};
const chartOne = value => (Math.round(value*10)/10).toFixed(1);
const chartVolume = ml => fmtVol(unitsOf()==='us'?ml:Math.round(ml));
function chartEntries() {
  const resources={feed:'feedings',bottle:'feedings',sleep:'sleep',diaper:'changes',pump:'pumping'};
  return S.entries.filter(entry=>!resources[entry.type]||resourceAllowed(resources[entry.type]));
}
function chartArguments() {
  const sleep=resourceAllowed('sleep')&&shownRun(S.sleepRun), feed=resourceAllowed('feedings')&&shownRun();
  return [chartEntries(),todayISO(),sleep?{t0:sleep.t0,now:nowM()}:null,
    feed?{...feed,dur:nowM()-feed.t0}:null,nowM(),S.child?.birthDate];
}
const chartDay = offset => `${WD[S.lang][new Date(`${dayISO(offset)}T12:00:00Z`).getUTCDay()]}, ${dateLabel(offset)}`;
const chartLetter = offset => WD[S.lang][new Date(`${dayISO(offset)}T12:00:00Z`).getUTCDay()][0].toUpperCase();
const chartIsToday = row => row.date===S.chartRows.at(-1).date;
const chartNoRecords = (cls,icon,title) => `<section class="card ${cls}"><div class="chart-head">${iconBlock(icon)}<h2>${title}</h2></div><p class="sub">${t('chartNoneYet')}</p></section>`;

/* At a glance: three icon rows. The feed row also names the usual gap (R2: it moved here from Home). */
function glanceRow(cls,icon,main,subs=[]) {
  return `<li class="row ${cls}">${iconBlock(icon)}<div><strong>${main}</strong>${subs.map(([text,decision])=>`<span class="sub"${decision?` data-r="${decision}"`:''}>${text}</span>`).join('')}</div></li>`;
}
function glanceTile(cls,icon,resource,metric,main,subs) {
  if(!resourceAllowed(resource))return glanceRow(cls,icon,t('trendUnavailable'));
  if(metric.average===null)return glanceRow(cls,icon,t('chartNoneYet'));
  return glanceRow(cls,icon,main,subs);
}
// The usual gap (R2): the middle gap between two feed starts in the full chart days. The longest sleep is the longest single sleep in those days.
function chartUsualGap() {
  const starts=S.chartRows.slice(0,-1).flatMap(row=>row.feeds.filter(feed=>!feed.carry).map(feed=>feed.t)).sort((a,b)=>a-b);
  const gaps=starts.slice(1).map((start,i)=>start-starts[i]).sort((a,b)=>a-b);
  return gaps.length?gaps[Math.floor(gaps.length/2)]:null;
}
function chartLongestSleep() {
  const low=S.chartRows[0].offset*1440+LittleDaysTrends.DAY_START, high=S.chartRows.at(-1).offset*1440+LittleDaysTrends.DAY_START;
  return Math.max(0,...S.entries.filter(e=>e.type==='sleep'&&e.dur>0&&e.t+e.dur>low&&e.t<high).map(e=>e.dur));
}
function glanceCard(summary) {
  const metrics=summary.metrics, gap=resourceAllowed('feedings')?chartUsualGap():null, ml=metrics.bottleMl.average;
  const feedSubs=[ml?[t('chartBottleSub',chartVolume(ml)),'']:null,gap?[t('usualGap',joinUnits(chartDuration(gap))),'R2']:null].filter(Boolean);
  const diaperAvailable=resourceAllowed('changes');
  const rows=[
    glanceTile('t-feed','bottle','feedings',metrics.feeds,t('chartFeedsAvg',chartOne(metrics.feeds.average)),feedSubs),
    glanceTile('t-sleep','moon','sleep',metrics.sleepMin,t('chartSleepAvg',chartDuration(metrics.sleepMin.average)),[[t('chartLongestSub',chartDuration(chartLongestSleep())),'']]),
    diaperAvailable&&metrics.wet.average!==null?glanceRow('t-dia','diaper',t('chartDiaperAvg',chartOne(metrics.wet.average),chartOne(metrics.dirty.average)),[[t('chartDiapers'),'']]):glanceRow('t-dia','diaper',diaperAvailable?t('chartNoneYet'):t('trendUnavailable')),
  ];
  return `<section class="card" data-chart="glance"><h2>${t('glance')}</h2><p class="sub">${t('chartPeriod',summary.days.length)}</p><ul>${rows.join('')}</ul></section>`;
}

/* The readout above a chart: the picked day (or Today so far) and what it holds. */
function chartTip(kind,row) {
  const label=chartIsToday(row)?t('chartToday'):chartDay(row.offset);
  let text;
  if(!row.logged)text=t('chartNoDayRecords')+'.';
  else if(kind==='feeds')text=row.feedCount===null?t('noFeedLogged')+'.':t('chartFeedTip',row.feedCount,row.breastCount,row.bottleCount);
  else if(kind==='sleep')text=row.sleepMin===null?t('noSleepLogged')+'.':t('chartSleepTip',chartDuration(row.sleepMin),chartDuration(row.nightMin),chartDuration(row.napMin))+(row.liveSleep.length?` (${t('running')})`:'');
  else text=row[kind]===null?t('chartNoDiapers'):t(kind==='wet'?'chartWetTip':'chartDirtyTip',row[kind]);
  return {label,text,html:`<b>${esc(label)}</b> · ${esc(text)}`,plain:`${label}: ${text}`};
}
const chartDetails = (kind,head,rows,label) => `<details data-chart-numbers="${kind}" ${S.chartNumbers?.[kind]?'open':''}><summary class="textlink" data-focus="chart-numbers-${kind}">${t('chartNumbers')}${glyph('chev')}</summary><div class="chart-table-scroll"><table class="chart-numbers" aria-label="${esc(label)}"><thead><tr>${head.map(cell=>`<th scope="col">${cell}</th>`).join('')}</tr></thead><tbody>${rows.map(cells=>`<tr>${cells.map((cell,i)=>i?`<td>${cell}</td>`:`<th scope="row">${cell}</th>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
const chartCard = (cls,icon,title,readout,body,table) => `<section class="card ${cls}"><div class="chart-head">${iconBlock(icon)}<h2>${title}</h2></div>${readout}${body}${table}</section>`;
const chartReadout = () => '<p class="readout" aria-live="polite"></p>';
const chartPlot = (kind,select=false) => `<div class="plot" data-chart="${kind}"${select?' data-select':''}></div>`;

/* The four bar cards. base and step are the mockup's axis; a bigger value moves the top up by whole steps. */
const chartCount = (row,key) => row[key]===null?t('trendNoLog'):String(row[key]);
const chartMinutes = (row,key) => row[key]===null?t('trendNoLog'):chartDuration(row[key]);
function barSpecs() {
  return [
    {kind:'feeds',cls:'t-feed',icon:'bottle',title:'chartFeedsDay',resource:'feedings',key:'feedCount',base:10,step:5,div:1,
      parts:[['breastCount','var(--chart-breast)','breast'],['bottleCount','var(--chart-bottle)','bottle']],
      head:[t('chartDay'),t('breast'),t('bottle')],cells:row=>[chartCount(row,'breastCount'),chartCount(row,'bottleCount')]},
    {kind:'sleep',cls:'t-sleep',icon:'moon',title:'chartSleepDay',resource:'sleep',key:'sleepMin',base:18,step:6,div:60,hours:true,
      parts:[['nightMin','var(--chart-sleep)','chartNightShort'],['napMin','var(--chart-nap)','chartNaps']],
      head:[t('chartDay'),t('night'),t('chartNaps')],cells:row=>[chartMinutes(row,'nightMin'),chartMinutes(row,'napMin')]},
    {kind:'wet',cls:'t-dia',icon:'wet',title:'chartWetDay',resource:'changes',key:'wet',base:8,step:4,div:1,
      parts:[['wet','var(--chart-diaper)','']],head:[t('chartDay'),t('wet')],cells:row=>[chartCount(row,'wet')]},
    {kind:'dirty',cls:'t-dia',icon:'dirty',title:'chartDirtyDay',resource:'changes',key:'dirty',base:4,step:2,div:1,
      parts:[['dirty','var(--chart-diaper)','']],head:[t('chartDay'),t('dirty')],cells:row=>[chartCount(row,'dirty')]},
  ];
}
function barCard(spec) {
  const title=t(spec.title);
  if(!resourceAllowed(spec.resource))return '';
  if(!S.chartRows.some(row=>row[spec.key]!==null))return chartNoRecords(spec.cls,spec.icon,title);
  const rows=S.chartRows.map(row=>[chartIsToday(row)?t('chartToday'):chartDay(row.offset),...spec.cells(row)]);
  return chartCard(spec.cls,spec.icon,title,chartReadout(),chartPlot(spec.kind,true),chartDetails(spec.kind,spec.head,rows,title));
}
function barPlot(spec,w) {
  const rows=S.chartRows, n=rows.length, title=t(spec.title);
  const values=rows.map(row=>spec.parts.map(([key])=>(row[key]||0)/spec.div));
  const {max,ticks}=LittleDaysCharts.scale(spec.base,spec.step,Math.max(0,...values.map(v=>v.reduce((a,b)=>a+b,0))));
  const panel={max,ticks,tick:spec.hours?hours=>hours?`${hours} ${t('hrs')}`:'0':String,colors:spec.parts.map(p=>p[1]),names:spec.parts.map(p=>p[2]&&t(p[2]))};
  const plotRows=rows.map((row,i)=>({x:i===n-1?t('today'):chartLetter(row.offset),part:i===n-1,v:values[i]}));
  return LittleDaysCharts.columns(w,esc(`${title}. ${t('chartKeyboard')}`),plotRows,panel,rows.map(row=>row.date),`chart-${spec.kind}`,'');
}

/* Daily rhythm: a row for each chart day, 7 AM to 7 AM. */
const rhythmHas = row => resourceAllowed('sleep')&&row.sleep.length>0||resourceAllowed('feedings')&&row.feeds.some(feed=>!feed.carry);
function rhythmRows(all) {
  const first=all.findIndex(rhythmHas), rows=all.slice(first<0?all.length-1:first);
  return rows.map(row=>{
    const current=chartIsToday(row), base=row.offset*1440+LittleDaysTrends.DAY_START;
    return {label:current?t('today'):dateLabel(row.offset),today:current,
      sleep:resourceAllowed('sleep')?row.sleep:[],
      feeds:resourceAllowed('feedings')?row.feeds.filter(feed=>!feed.carry).map(feed=>({t:feed.t-base,kind:feed.kind})):[],
      until:current?Math.max(0,Math.min(1440,nowM()-base)):1440,empty:rhythmHas(row)?'':t('chartNoDayRecords')};
  });
}
function rhythmCard(all) {
  if(!resourceAllowed('sleep')&&!resourceAllowed('feedings'))return '';
  if(!all.some(rhythmHas))return chartNoRecords('t-plain','clock',t('dailyRhythm'));
  const key=(cls,mark)=>`<li>${mark}${cls}</li>`;
  const legend=[
    resourceAllowed('sleep')?key(t('sleep'),'<svg width="16" height="12" aria-hidden="true"><rect y="1" width="16" height="10" rx="5" fill="var(--chart-sleep)"/></svg>'):'',
    resourceAllowed('feedings')?key(t('breast'),'<svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="var(--chart-breast)"/></svg>')+key(t('bottle'),'<svg width="12" height="12" aria-hidden="true"><path d="M6 0l6 6-6 6-6-6Z" fill="var(--chart-bottle)"/></svg>'):'',
    key(t('chartNight'),'<svg width="16" height="12" aria-hidden="true"><rect width="16" height="12" fill="var(--chart-night)"/></svg>')].join('');
  return `<section class="card t-plain"><div class="chart-head">${iconBlock('clock')}<h2>${t('dailyRhythm')}</h2></div><ul class="legend">${legend}</ul>${chartPlot('rhythm')}<button type="button" class="textlink" data-act="tab" data-arg="log">${t('chartSeeTimeline')}${glyph('chev')}</button></section>`;
}
function rhythmPlot(w) {
  const rows=rhythmRows(S.chartRows), axis=[[0,7,'start'],[360,13,'middle'],[720,19,'middle'],[1080,25,'middle'],[1440,31,'end']].map(([m,h,anchor])=>[m,axisH(h),anchor]);
  return LittleDaysCharts.rhythm(w,rows,axis,esc(t('chartRhythmReading',rows.length)));
}

/* Growth (R8): one card, three chips, the measurements only. */
const CHART_CHECK='<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g class="ln"><path d="m5.5 12.5 4.2 4.2 8.8-9.2"/></g></svg>';
const GROWTH_MEASURES=[
  {key:'kg',id:'weight',resource:'weight',label:'weight',lo:2,hi:7,ticks:[2,4,6],step:2},
  {key:'cm',id:'length',resource:'height',label:'length',lo:45,hi:65,ticks:[50,55,60],step:5},
  {key:'head',id:'head',resource:'head-circumference',label:'headSize',lo:32,hi:44,ticks:[34,38,42],step:4},
];
const growthShown = measure => resourceAllowed(measure.resource)&&!S.growthUnavailable.includes(measure.resource);
const growthWeek = (date,birth) => Math.max(0,(date-birth)/(7*86400000));
function growthPoints(measure) {
  const us=unitsOf()==='us', factor=us?(measure.key==='kg'?1/(OZ_KG*16):1/2.54):1;
  const dated=S.growthEntries.filter(e=>e.type==='growth'&&Number.isFinite(e[measure.key])&&e[measure.key]>0&&Number.isFinite(isoDay(e.date))).map(e=>({date:Date.parse(`${e.date}T12:00:00Z`),entry:e})).sort((a,b)=>a.date-b.date);
  const birth=Date.parse(`${S.child?.birthDate}T12:00:00Z`), from=Number.isFinite(birth)?birth:dated[0]?.date;
  return dated.map(({date,entry})=>({week:growthWeek(date,from),value:entry[measure.key]*factor,entry}));
}
// The age axis ends at 8 weeks, or at the next even week after the last record. The value axis grows by whole steps.
function growthAxis(measure,points) {
  const us=unitsOf()==='us', factor=us?(measure.key==='kg'?1/(OZ_KG*16):1/2.54):1;
  const values=points.map(p=>p.value), weeks=Math.max(8,Math.ceil(Math.max(0,...points.map(p=>p.week))/2)*2);
  if(us){
    const lo=Math.min(Math.floor(measure.lo*factor),Math.floor(Math.min(...values))), hi=Math.max(Math.ceil(measure.hi*factor),Math.ceil(Math.max(...values)));
    return {lo,hi,weeks,ticks:d3.ticks(lo,hi,3).filter(v=>v>lo&&v<hi)};
  }
  const lo=Math.min(measure.lo,Math.floor(Math.min(...values)/measure.step)*measure.step), hi=Math.max(measure.hi,Math.ceil(Math.max(...values)/measure.step)*measure.step), ticks=[...measure.ticks];
  for(let v=measure.ticks[0]-measure.step;lo<measure.lo&&v>=lo;v-=measure.step)ticks.unshift(v);
  for(let v=measure.ticks.at(-1)+measure.step;hi>measure.hi&&v<hi;v+=measure.step)ticks.push(v);
  return {lo,hi,weeks,ticks};
}
const growthValue = (measure,entry) => measure.key==='kg'?(unitsOf()==='us'?fmtWt(entry.kg):`${entry.kg.toFixed(1)} kg`):fmtLen(entry[measure.key]);
const growthAge = week => week<1?t('chartBirth'):t('chartWeeks',Math.floor(week));
function growthCard() {
  const title=t('growth'), measures=GROWTH_MEASURES.filter(growthShown);
  if(!measures.length)return '';
  if(S.growthLoading)return `<section class="card t-plain"><div class="chart-head">${iconBlock('sprout')}<h2>${title}</h2></div><p class="sub" role="status">${t('growthLoading')}</p></section>`;
  if(S.growthError)return `<section class="card t-plain"><div class="chart-head">${iconBlock('sprout')}<h2>${title}</h2></div><p class="sub" role="status">${t('growthError')}</p><button class="textlink" type="button" data-act="retry-growth">${t('retry')}</button></section>`;
  const withPoints=measures.filter(measure=>growthPoints(measure).length);
  if(!withPoints.length)return chartNoRecords('t-plain','sprout',title);
  const picked=measures.find(measure=>measure.id===S.growthMeasure)||withPoints[0], points=growthPoints(picked), last=points.at(-1);
  const chips=measures.map(measure=>`<button type="button" class="chip" data-act="growth-measure" data-arg="${measure.id}" aria-pressed="${measure===picked}">${CHART_CHECK}${t(measure.label)}</button>`).join('');
  const unknown=S.growthEntries.some(e=>e[picked.key]===null)?`<p class="sub">${S.lang==='es'?'Se omitieron medidas cuya unidad no se pudo verificar.':'Measurements with unverified units are excluded.'}</p>`:'';
  const head=`<section class="card t-plain"><div class="chart-head">${iconBlock('sprout')}<h2>${title}</h2></div><div class="chips growth-chips" role="group" aria-label="${t('chartMeasure')}">${chips}</div>`;
  if(!points.length)return `${head}<p class="sub" role="status">${t('chartNoneYet')}</p></section>`;
  const rows=points.map(p=>[growthAge(p.week),growthValue(picked,p.entry)]);
  return `${head}
  <p class="readout" aria-live="polite">${t('chartLatest',growthValue(picked,last.entry),Math.floor(last.week))}</p>${chartPlot('growth')}<p class="sub">${t(picked.key==='kg'?(unitsOf()==='us'?'chartLb':'chartKg'):(unitsOf()==='us'?'chartIn':'chartCm'))}</p>${unknown}${chartDetails('growth',[t('chartAge'),t(picked.label)],rows,`${title}: ${t(picked.label)}`)}</section>`;
}
function growthPlot(w) {
  const picked=GROWTH_MEASURES.filter(growthShown).find(measure=>measure.id===S.growthMeasure&&growthPoints(measure).length)||GROWTH_MEASURES.filter(growthShown).find(measure=>growthPoints(measure).length);
  if(!picked)return '';
  const points=growthPoints(picked), axis=growthAxis(picked,points);
  return LittleDaysCharts.growth(w,{...axis,points},{name:esc(babyName()),birth:t('chartBirth'),mid:t('chartWeeks',axis.weeks/2),end:t('chartWeeks',axis.weeks)},esc(t('chartGrowthReading',t(picked.label),points.at(-1).week)));
}

/* The plots are drawn after the page is in place, because their width is the width of the card. */
// On a narrow phone the five time labels can touch. Measure them, and when two are closer than 3 px keep only 7 AM, 7 PM and 7 AM.
function thinRhythmAxis(plot) {
  const labels=[...plot.querySelectorAll('svg text[y="16"]')], boxes=labels.map(label=>label.getBoundingClientRect());
  if(boxes.some((box,i)=>i&&box.left-boxes[i-1].right<3))[1,3].forEach(i=>labels[i]?.remove());
}
function drawCharts() {
  if(S.tab!=='charts'||!S.chartRows)return;
  const specs=Object.fromEntries(barSpecs().map(spec=>[spec.kind,spec]));
  document.querySelectorAll('.plot[data-chart]').forEach(el=>{
    const w=Math.floor(el.clientWidth), kind=el.dataset.chart;
    if(w)el.innerHTML=kind==='rhythm'?rhythmPlot(w):kind==='growth'?growthPlot(w):barPlot(specs[kind],w);
    if(w&&kind==='rhythm')thinRhythmAxis(el);
  });
  syncChartSelection();
}
// Each chart with a day pick shows the picked day in the card where it was picked, and Today so far in the others (no outline).
function pickChartDay(plot,index,quiet) {
  const hit=plot.querySelector('.hit');
  if(!hit)return;
  const dates=hit.dataset.dates.split('|'), i=Math.max(0,Math.min(dates.length-1,index)), row=S.chartRows.find(r=>r.date===dates[i]);
  if(!row)return;
  const tip=chartTip(plot.dataset.chart,row);
  hit.dataset.i=i;hit.setAttribute('aria-valuenow',i+1);hit.setAttribute('aria-valuetext',tip.plain);
  plot.querySelectorAll('.col').forEach((col,k)=>col.classList.toggle('on',!quiet&&k===i));
  plot.closest('.card').querySelector('.readout').innerHTML=tip.html;
}
function syncChartSelection() {
  document.querySelectorAll('.plot[data-select]').forEach(plot=>{
    const hit=plot.querySelector('.hit');
    if(!hit)return;
    const dates=hit.dataset.dates.split('|'), own=!!S.chartDetail&&S.chartSource===plot.dataset.chart&&dates.includes(S.chartDetail);
    pickChartDay(plot,own?dates.indexOf(S.chartDetail):dates.length-1,!own);
  });
}
function chartsHTML() {
  const args=chartArguments(), data=LittleDaysTrends.rows(...args), status=chartStatus();
  S.chartRows=[...data.days,data.today];S.chartRenderedMinute=`${todayISO()}:${nowM()}`;S.chartDirty=false;
  const cards=status?`<section class="card"><h2>${t('glance')}</h2>${status}</section>`:
    `${glanceSectionHTML(args)}${rhythmCard(S.chartRows)}<div class="group">${barSpecs().map(barCard).join('')}</div>${growthCard()}`;
  return `<div class="wrap charts-page">${cards}</div>`;
}
function glanceSectionHTML(args) {
  const summary=LittleDaysTrends.summarize(...args);
  return summary.loggedDays?glanceCard(summary):`<section class="card"><h2>${t('glance')}</h2><p class="sub">${t('chartNoneYet')}</p></section>`;
}
function chartStatus() {
  if(S.trendsLoading)return `<p class="sub" role="status">${t('trendLoading')}</p>`;
  if(S.trendsError)return `<p class="sub" role="status">${t('trendError')}</p><button class="textlink" type="button" data-act="retry-trends">${t('retry')}</button>`;
  return '';
}

/* ---------- photos (drawn stand-ins) ---------- */
function photosHTML() {
  const add=resourceAllowed('notes','add')?`<button type="button" class="btn" data-act="open-photo">${t('photoAdd')}</button>`:'';
  const photos=S.entries.filter(e=>e.photo),total=photos.length,found=photos.findIndex(e=>String(e.id)===S.photoId),p=found>=0?found:Math.max(0,total-1),entry=photos[p];  // the large photo is the one picked, else the newest
  const older=`<button type="button" class="btn" data-act="photos-older">${t('photosOlder')}</button>`;
  if(!entry)return `<div class="card"><div class="strip f-off"><h2>${t('photosT',esc(babyName()))}</h2></div><div class="body">${emptyState('camera',t('photosEmpty'),add)}${older}</div></div>`;
  const main=`<img src="${esc(entry.photo)}" alt="${esc(entry.photoName||entry.title||t('photoAdd'))}" style="display:block;width:100%;height:auto">`,caption=esc(entry.title||entry.photoName||t('note'));
  const thumbs=photos.map((e,i)=>`<button type="button" class="pth" data-act="photo" data-arg="${i}" aria-pressed="${i===p}" aria-label="${esc(e.title||e.photoName||t('photoAdd'))}"><img src="${esc(e.photo)}" alt="" style="display:block;width:100%;height:auto"></button>`).join('');
  return `<div class="card"><div class="strip f-off"><h2>${t('photosT',esc(babyName()))}</h2>${add}</div><div class="body"><div class="pbig">${main}</div><div class="pcap">${caption}</div>${photos.length>1?`<div class="pthumbs">${thumbs}</div>`:''}${older}</div></div>`;
}
// Opening Photos loads the last 31 days (the server takes 31 days or fewer in one request); Load older adds the 31 days before them.
// photoFrom is the oldest day asked for, as a day offset from today. A load that failed leaves it where it was.
const PHOTO_DAYS=31;
async function loadPhotos(older=false) {
  if(S.photoLoading||S.auth!=='ready'||(older?S.photoFrom==null:S.photoFrom!=null))return;
  const last=older?S.photoFrom-1:0,first=last-PHOTO_DAYS+1;
  S.photoLoading=true;
  try{await loadDayRange(first,last);if(S.loadedRanges?.has(dayISO(first)))S.photoFrom=first;}
  finally{S.photoLoading=false;}
}

/* ---------- sheets: look-match forms ----------
   A screen with fields that saves a record is a full-screen form (the mockup's feed()): a tint band in the care color
   with Cancel, the icon block and a 24 px title, then one white card. A two-button confirm stays a small bottom sheet (.bsheet).
   The old bottom-sheet class .sheet is now .bsheet; .sheet is the mockup's form card. */
Object.assign(GLYPH,{
  check:'<path d="m5.5 12.5 4.2 4.2 8.8-9.2"/>',
  warn:'<path d="M12 4.4 3.8 18.6h16.4L12 4.4ZM12 10v4.2M12 16.6h.1"/>',
  plus:'<path d="M12 5.2v13.6M5.2 12h13.6"/>',
});
Object.assign(W,{
  startSide:[s=>`Start ${s.toLowerCase()} side`,s=>`Iniciar lado ${s.toLowerCase()}`],
  nextSide:['Next side','Siguiente lado'],lastSide:['Last side','Último lado'],sideL:['Side','Lado'],
  enterMinutes:['Enter the minutes','Escribir los minutos'],useTimer:['Use the timer','Usar el temporizador'],minutesL:['Minutes','Minutos'],
  hintMinutes:['Enter the minutes to save.','Escriba los minutos para guardar.'],
  amountIn:[u=>`Amount in ${u}`,u=>`Cantidad en ${u}`],leftIn:[u=>`Left in ${u}`,u=>`Izquierdo en ${u}`],rightIn:[u=>`Right in ${u}`,u=>`Derecho en ${u}`],
  commonAmounts:['Common amounts','Cantidades comunes'],
  amountRange:[u=>u==='oz'?'Enter an amount from 1 to 13 oz.':'Enter an amount from 1 to 400 ml.',u=>u==='oz'?'Escriba una cantidad de 1 a 13 oz.':'Escriba una cantidad de 1 a 400 ml.'],
  startedL:['Started','Inicio'],endedL:['Ended','Fin'],dayL:['Day','Día'],changedL:['Changed','Cambio'],
  saveFeed:['Save feed','Guardar toma'],savePumping:['Save pumping','Guardar extracción'],saveDiaper:['Save diaper','Guardar pañal'],saveSleep:['Save sleep','Guardar sueño'],
  startSleep:['Start sleep','Iniciar sueño'],enterTimes:['Enter the times','Escribir las horas'],
  moreDetails:['More details','Más detalles'],addANote:['Add a note','Agregar una nota'],
  switchSide:[s=>`Switch to ${s.toLowerCase()} side`,s=>`Cambiar al lado ${s.toLowerCase()}`],
  changeStartTime:['Change the start time','Cambiar la hora de inicio'],
  startPumpTimer:['Start the pump timer','Iniciar el temporizador de extracción'],
  hintDiaperKind:['Choose Wet, Dirty or Wet and dirty to save.','Elija Pipí, Popó o Pipí y popó para guardar.'],
  wetDirty:['Wet and dirty','Pipí y popó'],
  onDutyRow:['On duty','En turno'],babyPhoto:['Baby photo','Foto del bebé'],
  kindL:['Kind','Clase'],typeL:['Type','Tipo'],moreVisit:['Doctor visit','Registro de consulta'],moreAppt:['Appointment','Cita con pediatra'],moreRemind:['Reminder','Programar un recordatorio'],
  baby:['Baby','Bebé'],changePhoto:['Change photo','Cambiar foto'],photoNotAllowed:['This account can no longer change the photo.','Esta cuenta ya no puede cambiar la foto.'],weeksOld:[n=>`${n} ${n===1?'week':'weeks'} old`,n=>`${n} ${n===1?'semana':'semanas'}`],
  unitsL:['Units','Unidades'],nightL:['Night','Noche'],dimSchedule:['Dim screen schedule','Horario de pantalla tenue'],careConn:['Care connection','Conexión de cuidado'],careConnected:['Connected','Conectado'],careNotConnected:['Not connected','No conectado'],
  runningSide:[(w,c)=>`${w} · ${c} running`,(w,c)=>`${w} · ${c} en curso`],
  confirmFeedSub:[(w,c)=>`${w} side · ${c}`,(w,c)=>`Lado ${w.toLowerCase()} · ${c}`],asleepFor:[d=>`Asleep for ${d}`,d=>`Durmiendo desde hace ${d}`],
});
const FORM_ICON={feed:'bottle',bottle:'bottle',pump:'bottle',breast:'nurse',sleep:'moon',diaper:'diaper',note:'note',other:'note',med:'pill',temp:'thermo',appointment:'calendar',visit:'clipboard',growth:'sprout',handoff:'swap',reminder:'bell',care:'clock',duty:'swap',split:'moon',correction:'clock',confirm:'swap',solids:'spoon',tummy:'tummy',bath:'bath',mile:'star'};
// The care color and icon of a form: feed gold, sleep blue, diaper teal, everything else plain.
function formLook(s){
  const kind=s?.kind||'';let key=kind==='quick'?s.what:kind;
  if(kind==='edit'){const e=[...S.entries,...S.upcomingAppointments].find(x=>String(x.id)===String(s.id));key=e?.type==='other'?(e.what||'other'):(e?.type||'note');}
  const care={feed:'t-feed',bottle:'t-feed',pump:'t-feed',breast:'t-feed',sleep:'t-sleep',split:'t-sleep',diaper:'t-dia'}[key]||'t-plain';
  return {cls:care,icon:FORM_ICON[key]||'note'};
}
function sheetShell(title, bodyHTML, save) {  // save: null (hidden) | {label, on, always, after}
  const s=S.sheet,kind=s?.kind||'',always=!!save?.always;
  const hint = save && !save.on && !always && kind!=='correction' ? saveHint(s) || t('hintGeneric') : '';
  const retrying=S.retrySame===s,disabled=!save||(!save.on&&!always)||S.busy||S.photoBusy||!!S.pendingSheetOperation&&!retrying||hasUnresolvedSheet(s)&&!retrying;
  const list=kind==='more'||kind==='settings',look=formLook(s);
  const hintEl=`<p class="save-hint" role="status" data-save-hint ${hint?'':'hidden'}>${esc(hint)}</p>`;  // beside Save when there is a Save; a form with no Save shows it above the body
  const head=list?`<header class="bar"><button type="button" class="back" data-act="cancel">${glyph('back')}${t('tabHome')}</button><h1${kind==='settings'?' id="settings-title"':''}>${esc(title)}</h1><span></span></header>`
    :`<header class="bar form-head"><button type="button" class="back" data-act="cancel">${t('cancel')}</button><h1>${iconBlock(look.icon)}${esc(title)}</h1><span></span></header>`;
  const foot=save?`<div class="sh-foot">${hintEl}<button type="button" class="btn-primary" data-act="save"${always?' data-always':''} ${disabled?'disabled aria-disabled="true"':''}>${save.label}</button>${save.after||''}</div>`:'';
  const inner=list?bodyHTML:`<div class="sheet">${save?'':hintEl}${bodyHTML}${foot}</div>`;
  return `<div class="formscreen" data-sheet data-kind="${esc(kind)}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="wrap ${list?'t-plain':look.cls}">${head}${messageHTML()}${inner}</div></div>`;
}
// A two-button confirm is a small bottom sheet over the page.
function bottomSheet(title,bodyHTML,foot){
  const kind=S.sheet?.kind||'';
  return `<div class="over" data-act="scrim"><aside class="bsheet" key="sheet:${esc(kind)}:${esc(S.sheet?.id||'')}" role="dialog" aria-modal="true" aria-label="${esc(title)}" data-kind="${esc(kind)}" data-sheet><div class="grab"></div><div class="sh-head"><span></span><h2>${esc(title)}</h2><span></span></div>${messageHTML()}<div class="sh-body">${bodyHTML}</div>${foot||''}</aside></div>`;
}
// Says what still blocks Save, so a grey Save button is never a mystery.
function saveHint(s){if(!s||s.kind==='correction')return '';
  if(SAVE_VALIDATORS[s.kind]?.(s)===false&&Object.keys(s).some(k=>/Clock$/.test(k)&&s[k]&&!parseClock(s[k])))return t('hintClock');
  if(s.kind==='feed')return feedHint(s);
  if(s.kind==='diaper')return !s.type?t('hintDiaperKind'):pointTimeOk(s)?'':t('hintTime');
  if(s.kind==='sleep')return s.early==='sleep'?earlyHint(s):s.nap===null?t('hintNap'):s.manual?manualHint(s):'';
  return SHEET_HINTS[s.kind]?.(s)||(SAVE_VALIDATORS[s.kind]?.(s)===false?t('hintGeneric'):'');}
// Each hint names the first missing item; '' falls back to the generic hint while Save is off.
const SHEET_HINTS={
  split:s=>validSplit(s)?'':t('splitInvalid'),
  edit:s=>!('valueEndHour' in s)||validEditRange(s,s.valueDur)?'':rangeHint(s,s.valueDur),
  quick:s=>s.what!=='tummy'&&s.what!=='bath'||SAVE_VALIDATORS.quick(s)?'':s.completed?t('hintTime'):positive(s.duration)?t('invalidDuration'):t('hintDuration'),
  med:s=>!s.name?.trim()?t('hintMedName'):!positive(s.dose)?t('hintDose'):!['mg','ml','tablets','drops'].includes(s.unit)?t('hintUnit'):''
};
function rangeHint(s,len){return positive(len)||allowsZeroLength(s)&&validNumber(len)?t('invalidRange'):t(allowsZeroLength(s)?'hintFeedEnd':'hintEnd');}
function manualHint(s){return validDurationRange(s,'manualDate','hour','minute','period','manualDuration')?'':rangeHint(s,s.manualDuration);}
function feedHint(s){if(s.tab==='bottle')return !s.milk?t('hintMilk'):!(s.ml>0&&s.ml<=400)?t('hintAmount'):manualHint(s);
  if(s.tab==='pump')return !(s.pL+s.pR>0)?t('hintAmount'):manualHint(s);
  if(s.early==='switch')return earlyHint(s);
  if(s.manual)return !s.manualSide?t('hintSide'):!positive(s.manualDuration)?t('hintMinutes'):manualHint(s);return '';}
const chipB = (act, arg, on, label, cls = '') => `<button type="button" class="chip ${cls}" data-act="${act}" data-arg="${arg}" aria-pressed="${on}">${glyph('check')}${label}</button>`;
function loggedByLocked(s){return !!(s.photo||s.photoFile)||(s.kind==='edit'&&!!S.entries.find(e=>e.id===s.id)?.photo);}
function loggedByFields(s){
  const original=s.kind==='edit'?[...S.entries,...S.upcomingAppointments].find(e=>e.id===s.id):null;
  if(original?.type==='reminder')return '';
  const names=S.people.map(personName).filter(Boolean),locked=loggedByLocked(s),fallback=names.includes(original?.by)?original.by:personName(S.me);
  if(!locked)s.by??=fallback;
  const selected=locked?fallback:s.by;
  const chips=names.map(name=>`<button type="button" class="chip sel-feed" data-act="logged-by" data-arg="${esc(name)}" aria-pressed="${selected===name}" ${locked?'disabled':''}>${glyph('check')}${esc(shownName(name))}</button>`).join('');
  return `<div class="form-field"><span class="fl">${t('loggedBy')}</span><div class="${names.length===2?'pair':'chips'}" role="group" aria-label="${t('loggedBy')}">${chips}</div>${locked?`<p class="cn">${t(s.kind==='edit'?'photoEditLoggedBy':'photoLoggedBy')}</p>`:''}</div>`;
}
function withLoggedBy(body,s){const {by,...event}=body;return s?.by&&!loggedByLocked(s)?{...event,by:s.by}:event;}
function whenFields(s,{dateOnly=false,start=false}={}){
  s.manualDate??=dayISO(0);if(s.hour===undefined)Object.assign(s,currentClock());
  return field('manualDate',t(start?'startDate':'date'),s.manualDate,'date')+(dateOnly?'':clockChoices('manual',s.hour,s.minute,s.period,t(start?'startTime':'time')))+loggedByFields(s);
}
const pointTimeOk=s=>validPointTime(s,'manualDate','hour','minute','period');
const growthDateOk=s=>validDate(s.manualDate)&&s.manualDate<=dayISO(0);
function pumpTimeOk(s){return validDurationRange(s,'manualDate','hour','minute','period','manualDuration');}
const unitChips = (act, cur) => { const o = {vu: ['ml', 'oz'], tu: ['C', 'F'], wu: ['kg', 'lb'], lu: ['cm', 'in'], hu: ['cm', 'in']}[act];
  return `<div class="seg2 uc" role="group" aria-label="${t('unit')}">${o.map(u => `<button type="button" class="chip" data-act="${act}" data-arg="${u}" aria-pressed="${cur === u}">${ic('check', 'ck')}${uLab(u)}</button>`).join('')}</div>`; };
const unitField = (act, cur, input) => `<div class="unit-field">${input}${unitChips(act, cur)}</div>`;
/* ---------- feed form (the mockup's feed(), plus the states it does not draw) ---------- */
const formLink=(text,act,arg='',extra='')=>`<button type="button" class="textlink" data-act="${act}"${arg!==''?` data-arg="${esc(arg)}"`:''}${extra?` ${extra}`:''}>${text}${glyph('chev')}</button>`;
// The time a form shows is one typed box, "2:46 PM". Typing without AM or PM keeps the period that is shown.
const clockText=(h,m,p,raw)=>(h===''||m===''||h==null)&&raw!=null?raw:h?`${h}:${m} ${p==='AM'?(S.lang==='es'?'a. m.':'AM'):(S.lang==='es'?'p. m.':'PM')}`:'';
const clockField=(prefix,label,h,m,p,extra='')=>{
  const value=h&&m!==''?`${h}:${m}`:S.sheet?.[prefix+'Clock']||'';
  const periodLabel=period=>S.lang==='es'?(period==='AM'?'a. m.':'p. m.'):period;
  return `<div class="form-field"><label class="fl" for="f-${prefix}Clock">${label}</label><div class="clock-input"><input class="field" id="f-${prefix}Clock" data-fid="${prefix}Clock" data-clock data-clock-numeric type="text" inputmode="numeric" autocomplete="off" value="${esc(value)}"${extra}><div class="clock-periods" role="group" aria-label="${esc(label)} ${periodLabel('AM')} / ${periodLabel('PM')}">${['AM','PM'].map(period=>`<button type="button" class="chip" data-act="clock-period" data-arg="${prefix}:${period}" aria-pressed="${p===period}">${glyph('check')}${periodLabel(period)}</button>`).join('')}</div></div></div>`;
};
const CLOCK_KEYS={manual:['hour','minute','period'],manualEnd:['endHour','endMinute','endPeriod'],edit:['hh','mm','period'],editEnd:['valueEndHour','valueEndMinute','valueEndPeriod']};
const startedField=(s,label=t('startedL'))=>{const c=currentClock();return clockField('manual',label,s.hour??c.hour,s.minute??c.minute,s.period||c.period);};
// A bottle or pump with no end has an end at its start; the end moves with the start until the end is typed.
function rangeDefaults(s){const c=currentClock();s.manualDate??=dayISO(0);if(allowsZeroLength(s)){s.hour??=c.hour;s.minute??=c.minute;s.period??=c.period;s.endHour??=s.hour;s.endMinute??=s.minute;s.endPeriod??=s.period;s.manualDuration??='0';}}
const endedField=s=>{const c=currentClock();return `<div class="range-end">${clockField('manualEnd',t('endedL'),s.endHour??c.hour,s.endMinute??c.minute,s.endPeriod||c.period)}<p class="cn range-len" data-range-len data-extra aria-live="polite"${allowsZeroLength(s)&&!positive(s.manualDuration)?' hidden':''}>${rangeText(s.manualDuration)}</p>${lateError(s,'invalidRange')}</div>`;};
const noteLine=s=>s.noteOpen||s.note?field('eventNote',t('note'),s.note||''):`<button type="button" class="textlink" data-act="note-open" data-arg="eventNote">${t('addANote')}${glyph('chev')}</button>`;
// "More details": a details element that keeps its open state across redraws (S.sheet.detailsOpen).
// extra: the block holds live fields the mockup does not draw, so the look check hides it (data-extra). head and tail add live parts around the drawn ones.
function moreDetails(s,{ended=false,note=true,extra=false,head='',tail=''}={}){
  return `<details class="more-details" data-more-details data-r="R4"${extra?' data-extra':''}${s.detailsOpen?' open':''}><summary class="textlink">${t('moreDetails')}${glyph('chev')}</summary><div class="details-body">${head}${field('manualDate',t('dayL'),s.manualDate||dayISO(0),'date')}${ended?endedField(s):''}${loggedByFields(s)}${note?textareaField('eventNote',t('note'),s.note||'',3):''}${tail}</div></details>`;
}
const amountInput=(id,ml,u,label,bad=false)=>`<input class="field" id="f-${id}" data-fid="${id}" data-amount type="text" inputmode="decimal" autocomplete="off" aria-label="${esc(label)}" value="${Number.isNaN(ml)?esc(S.sheet?.[id+'Text']??''):(ml?volNum(ml,u):(bad?'0':''))}"${bad?` aria-invalid="true" aria-describedby="ml-error"`:''}>`;
const BOTTLE_MAX=400;
const amountValid=s=>Number.isFinite(s?.ml)&&s.ml>0&&s.ml<=BOTTLE_MAX;
const presetMl=(u,v)=>u==='oz'?rnd(v*ML,5):v;
function amountField(s){
  const u=s.vu||'ml',bad=!!s.amountBad,label=t('amountIn',uLab(u));
  const presets=(u==='oz'?[2,3,4,5]:[60,90,120,150]).map(v=>`<button type="button" class="chip" data-act="ml-set" data-arg="${presetMl(u,v)}" aria-pressed="${s.ml===presetMl(u,v)}">${glyph('check')}${v}</button>`).join('');
  return `<div class="form-field${bad?' bad':''}"><label class="fl" for="f-ml">${label}</label>${amountInput('ml',s.ml,u,label,bad)}${bad?`<p class="error" id="ml-error">${glyph('warn')}${t('amountRange',u)}</p>`:''}<div class="presets" role="group" aria-label="${t('commonAmounts')}">${presets}</div></div>`;
}
function milkField(s){
  const bad=!!s.milkBad&&!s.milk;
  return `<div class="form-field${bad?' bad':''}"><span class="fl" id="milk-label">${t('milkWhat')}</span><div class="pair" role="group" aria-labelledby="milk-label">${['formula','breast'].map(m=>`<button type="button" class="chip" data-act="milk" data-arg="${m}" aria-pressed="${s.milk===m}">${glyph('check')}${t(m==='breast'?'milkBreast':'milkFormula')}</button>`).join('')}</div>${bad?`<p class="error">${glyph('warn')}${t('hintMilk')}</p>`:''}</div>`;
}
const bottleFields=s=>amountField(s)+milkField(s);
const sideTile=(id,hint,on,act)=>`<button type="button" class="side" data-act="${act}" data-arg="${id}" aria-pressed="${on}">${glyph('check')}<span class="letter">${sideLet(id)}</span>${esc(sideWord(id))}<span class="sub">${hint}</span></button>`;
let FEED_SEG='';
function feedSheet(s) {
  const run=shownRun(),active=run&&!s.manual?(run.side==='bottle'?'bottle':'breast'):null;
  let tab=s.tab;if(!resourceAllowed('pumping')&&tab==='pump')tab='breast';if(active&&tab!=='pump')tab=active;s.tab=tab;const kinds=[...(active?[active]:['breast','bottle']),...(resourceAllowed('pumping')?['pump']:[])],tabs=kinds.map(k=>`<button type="button" class="chip" data-act="ftab" data-arg="${k}" aria-pressed="${tab===k}">${glyph('check')}${t(k)}</button>`).join('');
  const seg=`<div class="seg" role="group" aria-label="${t('feed')}">${tabs}</div>`;
  FEED_SEG=active&&tab!=='pump'?seg:'';  // a running feed has no kind choice in round 3; the choice to log a pump stays in its More details
  const panel=tab==='breast'?breastPanel(s):tab==='bottle'?bottlePanel(s):pumpPanel(s);
  return sheetShell(t('feed'),`${FEED_SEG?'':seg}${panel.body}`,panel.save);
}
const sideChips=s=>`<div class="form-field"><span class="fl" id="side-label">${t('sideL')}</span><div class="pair" role="group" aria-labelledby="side-label">${['L','R'].map(id=>`<button type="button" class="chip" data-act="manualSide" data-arg="${id}" aria-pressed="${s.manualSide===id}">${glyph('check')}${esc(sideWord(id))}</button>`).join('')}</div></div>`;
// A block of live parts that round 3 leaves out, kept in a More details (data-extra hides it in the look check only).
const extraDetails=(s,inner,attrs='')=>`<details class="more-details" data-more-details data-r="R4" data-extra${attrs}${s.detailsOpen?' open':''}><summary class="textlink">${t('moreDetails')}${glyph('chev')}</summary><div class="details-body">${inner}</div></details>`;
function breastPanel(s){
  if(!shownRun()&&s.early==='switch')s.early=null;
  if(shownRun()&&!s.manual)return runningFeedPanel(s);
  const nx=nextSide(),last=lastOf('feed')?.side;s.manualSide??=nx||'L';const side=s.manualSide;
  if(s.manual){
    const ok=!!s.manualSide&&positive(s.manualDuration)&&validDurationRange(s,'manualDate','hour','minute','period','manualDuration');
    const minutes=`<div class="form-field"><label class="fl" for="f-manualDuration">${t('minutesL')}</label><input class="field" id="f-manualDuration" data-fid="manualDuration" type="text" inputmode="numeric" autocomplete="off" value="${esc(positive(s.manualDuration)?s.manualDuration:'')}"></div>`;
    return {body:`${sideChips(s)}${startedField(s)}${endedField(s)}${minutes}${moreDetails(s,{extra:true})}`,save:{label:t('saveFeed'),on:ok,after:formLink(t('useTimer'),'manual')}};
  }
  const hint=id=>id===nx?t('nextSide'):id===last?t('lastSide'):'&nbsp;';
  const sides=`<div class="form-field"><span class="fl" id="side-label">${t('sideL')}</span><div class="sides" role="group" aria-labelledby="side-label">${['L','R'].map(id=>sideTile(id,hint(id),side===id,'manualSide')).join('')}</div></div>`;
  const can=canStartTimer();
  const start=can?`<button type="button" class="btn-primary" data-act="start" data-arg="${side}">${t('startSide',sideWord(side))}</button>`:'';
  const extra=extraDetails(s,`${can?earlyFields(s,t('startedEarlier'),t('startTime')):''}${noteLine(s)}`);
  return {body:`${can?sides:''}${start}${formLink(t('enterMinutes'),'manual')}${extra}`,save:null};
}
// A running feed: the side that runs is selected and shows the live time (round 3). Every present action stays; the ones round 3 does not draw sit in More details.
function runningFeedPanel(s){
  const r=shownRun(),bottle=r.side==='bottle',switching=s.early==='switch',can=canStopRun(r);
  const open=s.feedAdjustOpen||switching||s.early==='feed'||s.correctingSide;
  const tile=`<div class="form-field"><span class="fl" id="side-label">${t('sideL')}</span><div class="sides" role="group" aria-labelledby="side-label"><div class="side wide" data-pressed="true">${glyph('check')}<span class="letter">${sideLet(r.side)}</span><span>${t('runningSide',esc(sideWord(r.side)),`<span data-live="runclock">${runClock(timerElapsed(r))}</span>`)}</span></div></div></div>`;
  const noteOn=s.noteOpen||s.note,note=noteLine(s);  // an opened note takes the full width below the links
  if(switching){
    const chips=choiceChips('next-feed',t('switchFeedType'),['L','R','bottle'].filter(side=>side!==r.side).map(side=>[side,sideWord(side)]),s.nextFeed);
    return {body:`${tile}${FEED_SEG}${bottle?bottleFields(s):''}${chips}${earlyFields(s,t('switchedEarlier'),t('switchTime'))}${note}`,save:{label:t('save'),on:!earlyHint(s)&&(!bottle||bottleAmountOk(s))}};
  }
  const off=bottle&&!bottleAmountOk(s)?' disabled':'';
  const others=can&&!s._preparedSwitch?['L','R','bottle'].filter(side=>side!==r.side):[];
  const link=side=>formLink(side==='bottle'?t('switchTo',esc(sideWord(side))):t('switchSide',esc(sideWord(side))),'switch',side,`${off.trim()}${side==='bottle'?' data-extra':''}`.trim());
  const switches=others.map(link).join('');
  const inner=`${FEED_SEG}<p class="sub" data-extra>${t('startedBy',esc(shownName(r.by)))}</p>${can&&!s._preparedSwitch?`<button type="button" class="text-link" data-act="switch-earlier">${t('switchedEarlier')}</button>`:''}${s.early==='feed'||!resourceAllowed('timers','change')||hasUnresolvedSheet(s)?'':sideFields(s,r)}<button type="button" class="text-link" data-act="manual">${t('manual')}</button>`;
  const adjust=`<details class="more-details feed-adjust" data-feed-adjust data-r="R4" data-extra${open?' open':''}><summary class="textlink">${t('moreDetails')}${glyph('chev')}</summary><div class="details-body">${inner}</div></details>`;
  const stop=can?`<button type="button" class="btn-primary" data-act="stop"${off}>${t('stopFeed')}</button>`:'';
  return {body:`${tile}${bottle?bottleFields(s):''}<div class="group">${switches}${moveStart(s,'feed')}${noteOn?'':note}</div>${noteOn?note:''}${adjust}${stop}`,save:null};
}
function bottlePanel(s){
  if(shownRun()&&!s.manual)return runningFeedPanel(s);
  rangeDefaults(s);
  const timer=!shownRun()&&canStartTimer()?formLink(t('startBottle'),'start','bottle'):'';
  return {body:`${bottleFields(s)}${startedField(s)}${endedField(s)}${timer?`<div class="feed-options">${timer}${moreDetails(s)}</div>`:moreDetails(s)}`,save:{label:t('saveFeed'),on:true,always:true}};
}
const pumpAmount=(k,s)=>{const label=t(k==='L'?'leftIn':'rightIn',uLab(s.vu||'ml'));return `<div class="form-field"><label class="fl" for="f-p${k}">${label}</label>${amountInput('p'+k,s['p'+k],s.vu||'ml',label)}</div>`;};
// Presets for the pump field that has the cursor (the left one at first).
function pumpPresets(s){
  const u=s.vu||'ml',key='p'+(s.pumpFocus||'L'),cur=s[key];
  return `<div class="presets" role="group" aria-label="${t('commonAmounts')}">${(u==='oz'?[2,3,4,5]:[60,90,120,150]).map(v=>`<button type="button" class="chip" data-act="ml-set" data-arg="${presetMl(u,v)}" aria-pressed="${cur===presetMl(u,v)}">${glyph('check')}${v}</button>`).join('')}</div>`;
}
function pumpPanel(s){
  rangeDefaults(s);
  const run=shownRun(S.pumpRun),pair=`<div class="pair">${pumpAmount('L',s)}${pumpAmount('R',s)}</div>`;
  if(run)return {body:`${pair}<div class="side" data-pressed="true">${glyph('check')}<span class="sub" data-live="pump">${mmss(timerElapsed(run))}</span><span class="sub">${t('startedBy',esc(shownName(run.by)))}</span></div>${canStopRun(run)?`<button type="button" class="btn-primary" data-act="pumpTimer">${t('stop')}</button>`:''}${moveFields(s,'pump')}${noteLine(s)}`,save:null};
  const timer=canStartTimer()?`${earlyFields(s,t('startedEarlier'),t('startTime'))}${formLink(t('startPumpTimer'),'pumpTimer')}`:'';
  return {body:`<div class="form-field">${pair}${pumpPresets(s)}</div>${startedField(s)}${endedField(s)}${moreDetails(s,{extra:true,head:timer})}`,save:{label:t('savePumping'),on:s.pL+s.pR>0&&pumpTimeOk(s)}};
}
// Round 3 draws Color and Texture with three choices each; the other choices the app keeps are in the same block, hidden from the look check only.
const DIA_TEXT={watery:['Runny','Líquida'],soft:['Soft','Blanda'],formed:['Firm','Formada']};
function diaSheet(s) {
  s.manualDate??=dayISO(0);if(s.hour===undefined)Object.assign(s,currentClock());
  const types=[['W',t('wet')],['D',t('dirty')],['B',t('wetDirty')]];
  const chip=(act,arg,on,label,extra='')=>`<button type="button" class="chip" data-act="${act}" data-arg="${arg}" aria-pressed="${on}"${extra}>${glyph('check')}${label}</button>`;
  const kinds=`<div class="form-field"><span class="fl" id="kind-label">${t('kindL')}</span><div class="chips" role="group" aria-labelledby="kind-label">${types.map(([k,l])=>chip('dkind',k,s.type===k,l)).join('')}</div></div>`;
  const group=(label,act,keys,shown,textOf,on)=>`<div class="form-field"><span class="fl">${label}</span><div class="chips" role="group" aria-label="${label}">${keys.map(k=>chip(act,k,on===k,textOf(k),shown.includes(k)?'':' data-extra')).join('')}</div></div>`;
  const color=group(t('color'),'col',Object.keys(COLS),['yellow','green','brown'],k=>tt('col',k),s.col);
  const texture=group(t('texture'),'tex',TEXES,['watery','soft','formed'],k=>DIA_TEXT[k]?DIA_TEXT[k][S.lang==='es'?1:0]:tt('tex',k),s.tex);
  const warn=`<div data-col-warn role="status">${colWarn(s.col)}</div>`;
  const when=`<div data-extra>${startedField(s,t('changedL'))}${field('manualDate',t('dayL'),s.manualDate||dayISO(0),'date')}${loggedByFields(s)}</div>`;
  const details=`<details class="more-details" data-more-details${s.detailsOpen?' open':''}><summary class="textlink">${t('moreDetails')}${glyph('chev')}</summary><div class="details-body">${color}${warn}${texture}${textareaField('eventNote',t('note'),s.note||'',3)}${when}</div></details>`;
  return sheetShell(t('diaper'),`${kinds}${details}`,{label:t('saveDiaper'),on:!!s.type&&pointTimeOk(s)});
}
// R7: a sleep that starts from 7 PM to 7 AM is night sleep. The Nap and Night sleep chips follow the start time until they are tapped.
const clockMinutes=(h,m,p)=>h===''||m===''||h==null?NaN:((+h%12)+(p==='PM'?12:0))*60+(+m||0);
const nightAt=min=>Number.isFinite(min)&&(min>=19*60||min<7*60);
const startsAsNap=s=>{const at=s.early==='start'?clockMinutes(s.earlyHour,s.earlyMinute,s.earlyPeriod):nowM()%1440;return Number.isFinite(at)?!nightAt(at):napNow();};
// Typed times do not redraw the form, so Nap or Night follows the typed start when it is read, unless the person picked one.
function syncManualNap(s){if(s.napPicked)return;const at=clockMinutes(s.hour,s.minute,s.period);if(Number.isFinite(at))s.nap=!nightAt(at);}
function sleepSheet(s) {
  const r = shownRun(S.sleepRun);
  if(!r&&s.early==='sleep')s.early=null;
  if(!r&&S.sleepPaused&&!s.manual)return sheetShell(t('sleep'),sleepPausedHTML(),null);
  if (r&&!s.manual) return sheetShell(t('sleep'), `<div class="run"><div class="t" data-live="sleep">${mmss(timerElapsed(r))}</div><div class="m">${t('asleep')} · ${t('startedBy', esc(shownName(r.by)))}</div></div>${sleepStopHTML(r, ft('endSleep'))}${sleepExtraActions(r)}${formLink(t('manual'),'manual')}${moveFields(s,'sleep')}${noteLine(s)}`, s.early==='sleep'?{label:t('saveStart'),on:!earlyHint(s)}:null);
  const manual=s.manual||!canStartTimer();
  if(manual){
    const rangeOk=validDurationRange(s,'manualDate','hour','minute','period','manualDuration');
    syncManualNap(s);
    // Round 3: Type is a read-only line that follows the start time. The Nap and Night sleep choice stays in More details.
    const type=`<div class="form-field"><span class="fl">${t('typeL')}</span><p class="readonly" id="sleep-kind">${s.nap===false?t('night'):s.nap===true?t('nap'):'—'}</p></div>`;
    const kinds=`<div class="form-field"><span class="fl" id="sleep-kind-label">${t('sleepKind')}</span><div class="pair" role="group" aria-labelledby="sleep-kind-label">${chipB('nap','night',s.nap===false,t('night'))}${chipB('nap','nap',s.nap===true,t('nap'))}</div></div>`;
    return sheetShell(t('sleep'),`${startedField(s)}${endedField(s)}${type}${moreDetails(s,{extra:true,head:kinds})}`,{label:t('saveSleep'),on:s.nap!==null&&rangeOk,after:canStartTimer()?formLink(t('useTimer'),'manual'):''});
  }
  // One button starts the timer (R4). The kind follows the clock: night from 7 PM to 7 AM (R7).
  if(!s.napPicked)s.nap=startsAsNap(s);
  const start=`<button type="button" class="btn-primary sleep-start" data-act="sleep-start" data-arg="${s.nap?'nap':'night'}" ${SAVE_VALIDATORS.sleep(s)?'':'disabled'}>${t('startSleep')}</button>`;
  return sheetShell(t('sleep'),`${start}${formLink(t('enterTimes'),'manual')}${extraDetails(s,`${earlyFields(s,t('startedEarlier'),t('startTime'))}${noteLine(s)}`)}`,null);
}
// "Log something else" (round 3): one card of twelve rows, each with its icon block.
function moreSheet() {
  const row=(act,label,icon,arg='')=>`<li class="t-plain"><button type="button" class="nav-row" data-act="${act}"${arg?` data-arg="${arg}"`:''}>${iconBlock(icon)}${label}<span class="chev">${glyph('chev')}</span></button></li>`;
  const growth=['weight','height','head-circumference'].some(name=>resourceAllowed(name)&&resourceAllowed(name,'add'));
  const records=resourceAllowed('notes','view')&&resourceAllowed('notes','add');
  const rows=(S.night?'':row('quick',t('solids'),'spoon','solids')+row('quick',t('tummy'),'tummy','tummy')+row('quick',t('bath'),'bath','bath')+row('quick',t('mile'),'star','mile'))
    +row('open-med',t('medicine'),'pill')+row('open-temp',t('temp'),'therm')+(growth?row('open-growth',t('growth'),'sprout'):'')
    +(records?row('open-visit',t('moreVisit'),'cross')+row('open-appointment',t('moreAppt'),'cal'):'')
    +row('open-note',t('note'),'note')+row('open-handoff',t('handoff'),'swap');  // no Reminder row: reminders are stored but never delivered (decision D4, 2026-11-12)
  return sheetShell(t('logElse'),`<nav class="card nav icons" aria-label="${t('logElse')}"><ul>${rows}</ul></nav>`,null);
}
// Settings (round 3): On duty, Baby, Language, Units, Night, Care connection, then who is signed in.
function settingsSheet(s) {
  const portraitImg=S.portraitDraft?`<img class="mini-portrait" src="${esc(S.portraitDraft.url)}" alt="${esc(S.child?.name||'')}">`:S.child?.portrait?`<img class="mini-portrait" src="${esc(S.child.portrait)}" alt="${esc(S.child.name||'')}">`:LittleDaysBunny.svg('settings-bunny');
  const change=resourceAllowed('children','change')?`<label class="textlink portrait-upload">${t('changePhoto')}${glyph('chev')}<input class="portrait-file" type="file" accept="image/*" data-fid="portrait" aria-label="${t('changePhoto')}"></label>`:'';
  // No Save button: the pick saves itself. Retry shows only after an upload ended without saving, when the shared status bar has
  // no Retry of its own (a lost request locks the sheet and retries from there). A waiting pick or an open upload has no Retry.
  const pd=S.portraitDraft,mayChange=resourceAllowed('children','change'),sharedRetry=S.retryAction||S.pendingSheetOperation;
  const failed=pd&&mayChange&&pd.tried&&!pd.saving&&!portraitOpen()&&!sharedRetry;
  const draft=pd?`<div class="portrait-tools"><span class="portrait-name">${esc(pd.name)}</span>${!failed?'':`<button type="button" class="btn-primary" data-act="portrait-save"${S.photoBusy?' disabled aria-disabled="true"':''}>${t('retry')}</button>`}</div>`:'';
  const err=S.photoBusy?`<p role="status" class="photo-prep">${t('photoPrep')}</p>`:pd&&!mayChange?`<p role="alert">${t('photoNotAllowed')}</p>`:S.portraitError?`<p role="alert">${photoErrorText(S.portraitError)}</p>`:'';
  const group=(title,inner,cls='')=>`<section class="day"><h2>${title}</h2><div class="card ${cls}">${inner}</div></section>`;
  const pick=(key,list,cur)=>`<div class="chips" role="group">${list.map(([v,w])=>`<button type="button" class="chip" data-setting="${key}" data-value="${v}" data-focus="setting-${key}-${v}" aria-pressed="${cur===v}">${glyph('check')}${w}</button>`).join('')}</div>`;
  const nav=(inner,attr)=>`<ul><li><button type="button" class="nav-row" ${attr}><span>${inner}</span><span class="chev">${glyph('chev')}</span></button></li></ul>`;
  const age=ageText(),name=babyName();
  const dim=LittleDaysTheme.mode(),dimWord=dim==='on'?t('themeOn'):dim==='off'?t('themeOff'):t('themeAuto');
  const nightOpen=!!s?.nightOpen;
  const care=S.careData?.exportOptIn?t('careConnected'):t('careNotConnected');
  return sheetShell(t('settings'),`<div class="wrap-settings">
    ${group(t('onDutyRow'),`<div class="line"><strong>${esc(shownName(S.duty))}</strong><button type="button" class="textlink" data-act="duty" aria-label="${t('dutyAria')}">${t('change')}${glyph('chev')}</button></div>`)}
    ${group(t('baby'),`<div class="row t-plain">${portraitImg}<div><strong>${esc(name)}</strong>${age?`<span class="sub">${age}</span>`:''}</div>${change}</div>${draft}${err}`)}
    ${group(t('language'),pick('lang',[['en','English'],['es','Español']],S.lang))}
    ${group(t('unitsL'),pick('units',[['metric','ml'],['us','oz']],unitsOf()))}
    ${group(t('nightL'),nav(`<strong>${t('dimSchedule')}</strong><span class="sub">${dimWord}</span>`,'data-act="night-open"'),'nav')}
    ${nightOpen?`<section class="card settings-card" data-night>${themeRow()}<button type="button" class="chip" data-setting="night" data-focus="setting-night" aria-pressed="${S.night}">${glyph('check')}${t('nightRules')}</button></section>`:''}
    ${LittleDaysCryUI.settingsHTML()}
    ${LittleDaysAPI.careLink?group(t('careConn'),nav(`<strong class="conn">${S.careData?.exportOptIn?glyph('check'):''}${care}</strong>`,'data-act="open-care"'),'nav'):''}
    <section class="card settings-card"><p class="line">${t('signedInAs')} <strong class="account-name">${esc(shownName(S.me))}</strong></p><button type="button" class="back" data-extra data-shell="logout">${t('logout')}</button></section></div>`,null);
}
async function refreshCare() {
  S.careLoading=true;render();
  try { S.careData=await LittleDaysAPI.care();S.careError=''; }
  catch(error) { S.careData=null;S.careError=t('careUnavailable'); }
  finally { S.careLoading=false;render(); }
}
function careDateTime(value) {
  return new Intl.DateTimeFormat(S.lang==='es'?'es-MX':'en-US',{dateStyle:'medium',timeStyle:'short',hour12:true,timeZone:LittleDaysZone.get()}).format(new Date(value)).replace(/\b([ap])\.\s?m\./g,'$1. m.').replace(/\s/g,' ');  // one unit: lines break only between start and end
}
// A rejected time empties the stored value; the date, text and AM or PM that were typed stay on screen.
const careClockBad=key=>!!S.sheet?.[key+'Clock']&&!parseClock(S.sheet[key+'Clock']);
function careClockFields(key,value) {
  const s=S.sheet||{},[d,time]=value.split('T'),typed=!time&&s[key+'Clock']!=null,[hour,minute]=(time||'00:00').split(':'),clock=typed?{hh:'',mm:'',period:s[key+'Period']}:clockOf(+hour*60+(+minute));
  return `<fieldset class="care-clock"><legend>${t(key)}</legend>${field(key+'Date',t('date'),d||s[key+'Date']||'','date')}${clockChoices(key,clock.hh,clock.mm,clock.period)}<p class="field-error" role="status" data-care-hint="${key}"${careClockBad(key)?'':' hidden'}>${t('hintClock')}</p></fieldset>`;
}
function updateCareClock(id) {
  const key=id.startsWith('careStart')?'careStart':'careEnd',read=part=>document.getElementById('f-'+key+part)?.value;
  const date=read('Date'),c=parseClock(read('Clock')),list=document.getElementById('f-'+key+'Period');
  if(c?.period&&list)list.value=c.period;
  const period=S.sheet[key+'Period']=list?.value;
  S.sheet[key]=date&&c&&period?`${date}T${pad((+c.hh%12)+(period==='PM'?12:0))}:${c.mm}`:'';
  const hint=$(`[data-care-hint="${key}"]`);if(hint)hint.hidden=!careClockBad(key);
}
function careSheet() {
  if(S.careLoading)return sheetShell(t('careTitle'),`<p role="status">${t('loading')}</p>`,null);
  if(!S.careData)return sheetShell(t('careTitle'),`<p role="alert">${esc(S.careError||t('careUnavailable'))}</p><button class="btn" type="button" data-act="care-refresh">${t('retry')}</button>`,null);
  const data=S.careData,confirmations=data.confirmations||[],history=data.dutyHistory||[];
  const list=confirmations.length?confirmations.map(item=>`<li><time>${esc(careDateTime(item.start))} – ${esc(careDateTime(item.end))}</time> <button class="btn" type="button" data-act="care-revoke" data-arg="${esc(item.id)}" ${S.careLoading?'disabled':''}>${t('revoke')}</button></li>`).join(''):`<li>${t('careEmpty')}</li>`;
  const handoffs=history.map(item=>`<li><time>${esc(careDateTime(item.occurredAt))}</time>&nbsp;· ${esc(shownName(item.who))}${item.note?`&nbsp;· ${esc(item.note)}`:''}&nbsp;· ${esc(shownName(item.adult))}</li>`).join('')||`<li>${t('careEmpty')}</li>`;
  const start=S.sheet?.careStart||'',end=S.sheet?.careEnd||'';
  return sheetShell(t('careTitle'),`<p><strong>${t('currentDuty')}:</strong> ${esc(shownName(S.duty||S.me))}</p><section class="care-share"><h3>${t('careShare')}</h3><button class="btn" type="button" data-act="care-toggle" aria-pressed="${data.exportOptIn===true}" ${S.careLoading?'disabled':''}>${data.exportOptIn?t('shareOn'):t('shareOff')}</button></section><section><h3>${t('careConfirm')}</h3>${careClockFields('careStart',start)}${careClockFields('careEnd',end)}<button class="btn solid" type="button" data-act="care-confirm" ${S.careLoading||!start||!end?'disabled':''}>${t('careConfirm')}</button></section><section><h3>${t('careListTitle')}</h3><ul class="care-list">${list}</ul></section><section><h3>${t('careHistory')}</h3><ul class="care-list">${handoffs}</ul></section>${S.message?`<p role="status">${esc(S.message)}</p>`:''}`,null);
}
// A care form time ("2026-11-10T14:00") is local time, as in the other time forms. NaN when it does not read.
function careInstant(value) {
  const m=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value||''),day=m?isoDay(m[1]):NaN;
  return Number.isFinite(day)?Date.parse(localISOAt(day*1440+(+m[2])*60+(+m[3]))):NaN;
}
async function confirmCare() {
  const s=S.sheet, start=careInstant(s?.careStart), end=careInstant(s?.careEnd);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>86400000){S.message=t('careInvalid');render();return;}
  const payload={start:new Date(start).toISOString(),end:new Date(end).toISOString()};
  if(!S.careConfirmPending||S.careConfirmPending.start!==payload.start||S.careConfirmPending.end!==payload.end)S.careConfirmPending={...payload,operationId:crypto.randomUUID()};
  S.careLoading=true;S.message=t('saving');render();
  let status;
  try { await LittleDaysAPI.confirmCare(payload,S.careConfirmPending.operationId);S.careConfirmPending=null;S.sheet.careStart='';S.sheet.careEnd='';S.sheet.dirty=false;status=t('careConfirmed'); }
  catch(error) { status=error.message||t('careUnavailable'); }
  await refreshCare();S.message=status;render();
}
async function toggleCareSharing() {
  if(!S.careData)return;const enabled=!S.careData.exportOptIn;
  if(!S.careOptInPending||S.careOptInPending.enabled!==enabled)S.careOptInPending={enabled,operationId:crypto.randomUUID()};
  S.careLoading=true;S.message=t('saving');render();
  let status;
  try { await LittleDaysAPI.setCareOptIn(enabled,S.careOptInPending.operationId);S.careOptInPending=null;status=t('careSaved'); }
  catch(error) { status=error.message||t('careUnavailable'); }
  await refreshCare();S.message=status;render();
}
async function revokeCare(id) {
  const pending=S.careRevokePending[id]||(S.careRevokePending[id]={operationId:crypto.randomUUID()});
  S.careLoading=true;S.message=t('saving');render();
  let status;
  try { await LittleDaysAPI.revokeCare(id,pending.operationId);delete S.careRevokePending[id];status=t('careRevoked'); }
  catch(error) { status=error.message||t('careUnavailable'); }
  await refreshCare();S.message=status;render();
}
// Optional notes stay out of the way until asked for: one tap on Add note opens the field.
const noteBlock = (s, fieldHTML, hasText) => s.noteOpen || hasText ? fieldHTML : `<button type="button" class="btn quiet" data-act="note-open" data-arg="${fieldHTML.match(/for="f-([^"]+)"/)?.[1]||''}">${t('addNote')}</button>`;
function field(id, label, value='', type='text', attrs='') { const keypad=type==='number'&&!attrs.includes('inputmode=')?`inputmode="${attrs.includes('step="1"')?'numeric':'decimal'}"`:'';return `<div class="form-field"><label class="fl" for="f-${id}">${label}</label><input class="field" id="f-${id}" data-fid="${id}" type="${type}" value="${esc(value)}" ${keypad} ${attrs}></div>`; }
function textareaField(id,label,value='',rows=3,attrs=''){return `<div class="form-field"><label class="fl" for="f-${id}">${label}</label><textarea class="field" id="f-${id}" rows="${rows}" data-fid="${id}" ${attrs}>${esc(value)}</textarea></div>`;}
function quickSheet(s) {
  if(s.what==='solids')return solidsSheet(s);
  let body = '';
  if (s.what === 'tummy' || s.what === 'bath') {body = field('duration',t('duration'),s.duration||'','number','min="1" step="1"')+lateError(s,'invalidDuration')+`<div class="chips">${chipB('completed','yes',s.completed===true,t('completed'),'sel-sleep')}</div>`+whenFields(s,{start:true})+noteBlock(s,textareaField('note',t('note'),s.text||'',2),s.text);}
  else body = field('moment',t('moment'),s.moment||'') + whenFields(s) + noteBlock(s,textareaField('note',t('note'),s.text||'',3),s.text) + `${photoPicker(s)}${s.photo?`<img class="note-photo" src="${s.photo}" alt="${esc(s.photoName||t('photoAdd'))}"><button class="btn" data-act="remove-photo">${t('removePhoto')}</button>`:''}`;
  return sheetShell(t(s.what === 'mile' ? 'mile' : s.what),body,{label:t('save'),on:SAVE_VALIDATORS.quick(s)});
}
function medSheet(s) {
  const body = field('name',t('medName'),s.name||'') + field('dose',t('dose'),s.dose||'','number','min="0.01" step="any"') + choices('unit',t('unit'),[['',t('chooseUnit')],['mg','mg'],['ml','ml'],['tablets','tablets'],['drops','drops']],s.unit||'') + field('medDate',t('date'),s.date||dayISO(0),'date') + clockChoices('med',s.hour??'3',s.minute??'20',s.period||'PM') + loggedByFields(s) + noteBlock(s,field('medNote',t('note'),s.note||''),s.note);
  return sheetShell(t('medicine'), body, {label:t('save'), on:!!(s.name||'').trim() && positive(s.dose) && ['mg','ml','tablets','drops'].includes(s.unit) && validEventDateTime(s)});
}
function tempSheet(s) {
  const shown=s.c==null?'':(s.tu==='F'?c2f(s.c):s.c).toFixed(1);
  return sheetShell(t('temp'), `${unitField('tu',s.tu,field('temperature',t('temp'),shown,'number','min="0" step="0.1"'))}${field('tempDate',t('date'),s.date||dayISO(0),'date')}${clockChoices('temp',s.hour??'3',s.minute??'20',s.period||'PM')}${loggedByFields(s)}${noteBlock(s,field('tempNote',t('note'),s.tempNote||''),s.tempNote)}`, {label:t('save'),on:s.c!=null&&Number.isFinite(s.c)&&s.c>=0&&validEventDateTime(s)});
}
function growthSheet(s) {
  const birth=validDate(S.child?.birthDate)?formLink(t('useBirthDate'),'growth-birth'):'';
  const canPair=resourceAllowed('weight','add')&&resourceAllowed('height','add');
  const recumbent=canPair?`<div class="chips">${chipB('growth-recumbent','',s.recumbent===true,S.lang==='es'?'Peso y longitud medidos juntos, bebé acostado':'Weight and length measured together, baby lying down')}</div>`:'';
  const body = `${birth}${resourceAllowed('weight','add')?unitField('wu',s.wu,field('weight',t('weight'),s.weight||'','number','min="0" step="any"')):''}${resourceAllowed('height','add')?unitField('lu',s.lu,field('length',t('length'),s.length||'','number','min="0" step="any"')):''}${recumbent}${resourceAllowed('head-circumference','add')?unitField('hu',s.hu,field('head',t('head'),s.head||'','number','min="0" step="any"')):''}${whenFields(s,{dateOnly:true})}${noteBlock(s,field('eventNote',t('note'),s.note||''),s.note||'')}`;
  const on = SAVE_VALIDATORS.growth(s);
  return sheetShell(t('growth'),body,{label:t('save'),on});
}
function photoPicker(s){return `<div class="photo-picker"><button type="button" class="btn" data-act="pick-photo">${t('photoAdd')}</button><input type="file" accept="image/*" data-fid="photo" hidden>${s.photoName?`<span>${esc(s.photoName)}</span>`:''}${S.photoBusy?`<span role="status" class="photo-prep">${t('photoPrep')}</span>`:''}${s.photoError?`<div role="alert" class="photo-error">${ic('warn')}${photoErrorText(s.photoError)}</div>`:''}</div>`;}
function noteSheet(s) {
  const label=s.photoOnly?ft('caption'):t('note');
  return sheetShell(s.photoOnly?t('photoAdd'):t('note'), `${s.photoOnly?photoPicker(s):''}${textareaField('note',label,s.text,3,`aria-label="${label}"`)}${whenFields(s)}${s.photoOnly?'':photoPicker(s)}${s.photo?`<img class="note-photo" src="${s.photo}" alt="${esc(s.photoName||t('photoAdd'))}"><button type="button" class="btn" data-act="remove-photo">${t('removePhoto')}</button>`:''}`, {label:t('save'),on:SAVE_VALIDATORS.note(s)});
}
function appointmentSheet(s){const body=field('appointmentTitle',t('appointmentReason'),s.title||'')+field('appointmentProvider',t('provider'),s.provider||'')+field('appointmentLocation',t('location'),s.location||'')+field('appointmentDate',t('date'),s.date||dayISO(1),'date')+clockChoices('appointment',s.hour??'9',s.minute??'00',s.period||'AM')+loggedByFields(s)+textareaField('appointmentNote',t('note'),s.note||'',2);return sheetShell(t('moreAppt'),body,{label:t('save'),on:!!s.title?.trim()&&validEventDateTime({date:s.date,hour:s.hour,minute:s.minute,period:s.period})&&startMinutes(s.date,s.hour,s.minute,s.period)>nowM()});}
function visitSheet(s){const body=field('visitReason',t('appointmentReason'),s.reason||'')+field('visitProvider',t('provider'),s.provider||'')+field('visitDate',t('date'),s.date||dayISO(0),'date')+clockChoices('visit',s.hour??currentClock().hour,s.minute??currentClock().minute,s.period||currentClock().period)+loggedByFields(s)+textareaField('visitObservations',t('observations'),s.observations||'',3)+textareaField('visitInstructions',t('providerInstructions'),s.instructions||'',3)+field('visitWeight',`${t('weight')} (kg)`,s.weightKg??'','number','min="0" step="any"')+field('visitLength',`${t('length')} (cm)`,s.lengthCm??'','number','min="0" step="any"')+field('visitHead',`${t('head')} (cm)`,s.headCm??'','number','min="0" step="any"')+field('visitFollowUp',t('followUp'),s.followUpDate||'','date')+`${photoPicker(s)}${s.photo?`<img class="note-photo" src="${s.photo}" alt="${esc(s.photoName||t('photoAdd'))}"><button type="button" class="btn" data-act="remove-photo">${t('removePhoto')}</button>`:''}`;const hasText=!!(s.provider||s.reason||s.observations||s.instructions||s.weightKg!==''||s.lengthCm!==''||s.headCm!=='');return sheetShell(t('moreVisit'),body,{label:t('save'),on:hasText&&validEventDateTime({date:s.date,hour:s.hour,minute:s.minute,period:s.period})&&startMinutes(s.date,s.hour,s.minute,s.period)<=nowM()});}
function handoffSheet(s) { return sheetShell(t('handoff'),textareaField('text',t('note'),s.text||'',3,`aria-label="${t('handoff')}"`),{label:t('save'),on:!!s.text.trim()}); }
// Edit sheets pick with the same chips as new entries (owner request, 2026-11-09); long lists keep a select.
const choiceChips=(act,label,vals,cur,cls='')=>`<div class="form-field"><span class="fl">${label}</span><div class="chips" role="group" aria-label="${label}">${vals.map(([v,l])=>chipB(act,v,cur===v,l,cls)).join('')}</div></div>`;
const choices=(id,label,vals,cur)=>`<div class="form-field"><label class="fl" for="f-${id}">${label}</label><select class="field" id="f-${id}" data-fid="${id}">${vals.map(([v,l])=>`<option value="${v}" ${cur===v?'selected':''}>${l}</option>`).join('')}</select></div>`;
const adultChoices=()=>S.people.map(p=>personName(p)).filter(Boolean).map(n=>[n,shownName(n)]);
// A new reminder starts with the signed-in adult; no one is chosen when that adult is not in the list.
const signedInRecipient=()=>{const me=personName(S.me);return adultChoices().some(([name])=>name===me)?me:'';};
// One typed box per time (931, 9:31 or 21:31) and the AM/PM list. When the typed text does not read as a time,
// the parsed hour and minute are empty, so the next render shows the text as typed instead of a silent default.
const clockChoices=(prefix,h,m,ap,label=t('time'))=>{const raw=S.sheet?.[prefix+'Clock'],v=(h===''||m==='')&&raw!=null?raw:h?`${h}:${m}`:'';return `<div class="clock-fields"><div class="form-field"><label class="fl" for="f-${prefix}Clock">${label}</label><input class="field" id="f-${prefix}Clock" data-fid="${prefix}Clock" data-clock type="text" inputmode="numeric" autocomplete="off" placeholder="9:30" value="${esc(v)}"></div>${choices(prefix+'Period',S.lang==='es'?'a. m. / p. m.':'AM / PM',S.lang==='es'?[['AM','a. m.'],['PM','p. m.']]:[['AM','AM'],['PM','PM']],ap)}</div>`;};
// Reads a typed 12-hour time: 931, 0931, 9:31, 9.31 or 9:31 pm. AM or PM comes from the list or a typed a or p, never from the digits.
function parseClock(v){const m=String(v??'').toLowerCase().replace(/\s+/g,'').match(/^(\d{1,2})(?:[:.h]?(\d{2}))?(a|p)?\.?m?\.?$/);if(!m)return null;const h=+m[1],min=m[2]===undefined?0:+m[2];if(h<1||h>12||min>59)return null;return {hh:String(h),mm:pad(min),period:m[3]?(m[3]==='a'?'AM':'PM'):null};}
function readClock(prefix,value,cm){const c=parseClock(value),hk=cm[prefix+'Hour'],mk=cm[prefix+'Minute'];if(!hk)return;S.sheet[hk]=c?c.hh:'';S.sheet[mk]=c?c.mm:'';if(c?.period){S.sheet[cm[prefix+'Period']]=c.period;const list=document.getElementById(`f-${prefix}Period`);if(list)list.value=c.period;}}
// The end time has no date of its own: it is on the start day, or on the next day when it is earlier (a feed across midnight).
// The length comes from the two clocks only, so a new date keeps it (and keeps a 30-second feed at 30 seconds).
function rangeMinutes(h,m,p,eh,em,ep){const day=dayISO(0),start=startMinutes(day,h,m,p),end=startMinutes(day,eh,em,ep);return start===null||end===null?'':String(end>=start?end-start:end+1440-start);}
const allowsZeroLength=s=>s?.kind==='feed'?['bottle','pump'].includes(s.tab):s?.kind==='edit'&&['bottle','pump'].includes(S.entries.find(e=>e.id===s.id)?.type);
const rangeText=len=>positive(len)?t('lengthIs',durText(+len)):'';
// Minutes typed on the Breast tab are a length; a Bottle or Pump has an End at its Start. Changing between those kinds starts the range again,
// so the Minutes of one tab never become the length (and a future End) of the other.
function resetRangeOnTab(s,wasZeroLength){
  if(s.kind!=='feed'||allowsZeroLength(s)===wasZeroLength||!('endHour' in s))return;
  if(!s.timeEdited){const c=currentClock();Object.assign(s,{manualDate:dayISO(0),hour:c.hour,minute:c.minute,period:c.period});}  // an untouched Start is now again
  Object.assign(s,{endHour:s.hour,endMinute:s.minute,endPeriod:s.period,manualDuration:'0'});delete s.endEdited;delete s.manualMinutesTyped;
}
// Breast manual: until a time is typed, the feed ended now, so Start is now minus the Minutes (as for a Bottle). The End is never later than now.
function followManualStart(s,id){
  if(id!=='manualDuration'||s.timeEdited||s.tab!=='breast'||!s.manual)return;
  const at=nowM()-(positive(s.manualDuration)?+s.manualDuration:0),x=clockOf(at);
  Object.assign(s,{manualDate:dayISO(Math.floor(at/1440)),hour:x.hh,minute:x.mm,period:x.period});
  const date=$('[data-fid="manualDate"]'),clock=$('[data-fid="manualClock"]');
  if(date)date.value=s.manualDate;if(clock)clock.value=clock.hasAttribute('data-clock-numeric')?`${x.hh}:${x.mm}`:clockText(x.hh,x.mm,x.period);
}
function followFeedEnd(s,id){
  if(s.kind!=='feed')return;
  followManualStart(s,id);
  if(/^manualEnd(Clock|Period)$/.test(id)){s.endEdited=true;return;}
  if(!allowsZeroLength(s)||s.endEdited||!/^manual(Clock|Period)$/.test(id))return;
  Object.assign(s,{endHour:s.hour,endMinute:s.minute,endPeriod:s.period});
  const clock=$('[data-fid="manualEndClock"]'),period=$('[data-fid="manualEndPeriod"]');
  if(clock)clock.value=clock.hasAttribute('data-clock-numeric')?(s.hour?`${s.hour}:${s.minute}`:''):clockText(s.hour,s.minute,s.period);
  if(period)period.value=s.period;
}
// A typed feed Started later than now is last night's, as for Started earlier?, until the parent picks a Day (More details).
// Owner, 2026-11-20: after midnight an 11:50 PM bottle read as tonight, so every feed form refused it as later than now.
function followStartDay(s,id){
  if(s.kind!=='feed'||s.dayEdited||!/^manual(Clock|Period)$/.test(id))return;
  const at=startMinutes(dayISO(0),s.hour,s.minute,s.period);if(at===null)return;
  const day=at>nowM()&&nowM()-(at-1440)<=720?dayISO(-1):dayISO(0);if(day===s.manualDate)return;
  s.manualDate=day;const box=$('[data-fid="manualDate"]');if(box)box.value=day;
}
function syncRange(id){const s=S.sheet;let len;followStartDay(s,id);followFeedEnd(s,id);
  if(/^manualEnd(Clock|Period)$/.test(id))s.manualMinutesTyped=false;
  if(id==='manualDuration')s.manualMinutesTyped=true;
  if(s.kind==='feed'&&s.tab==='breast'&&s.manualMinutesTyped&&validNumber(s.manualDuration)&&/^(manualDuration|manualClock|manualPeriod)$/.test(id)){const start=startMinutes(s.manualDate,s.hour,s.minute,s.period);if(start!==null){const x=clockOf(start+ +s.manualDuration);Object.assign(s,{endHour:x.hh,endMinute:x.mm,endPeriod:x.period});const box=$('[data-fid="manualEndClock"]');if(box)box.value=`${x.hh}:${x.mm}`;}len=s.manualDuration;}
  else if(/^manual(Clock|Period|EndClock|EndPeriod)$/.test(id)&&'endHour' in s){len=s.manualDuration=rangeMinutes(s.hour,s.minute,s.period,s.endHour,s.endMinute,s.endPeriod);const minutes=$('[data-fid="manualDuration"]');if(minutes)minutes.value=len;}
  else if(/^edit(Clock|Period|EndClock|EndPeriod)$/.test(id)&&'valueEndHour' in s){s.minutesTyped=false;const r=editRange(s);len=s.valueDur=r.end===null||r.start===null?'':String(r.end-r.start);const m=$('[data-fid="valueDur"]');if(m)m.value=len;}
  else if(id==='valueDur'&&'valueEndHour' in s){s.minutesTyped=true;const r=editRange(s);if(r.start!==null&&validNumber(s.valueDur)){const x=clockOf(Math.round(r.start+ +s.valueDur));Object.assign(s,{valueEndHour:x.hh,valueEndMinute:x.mm,valueEndPeriod:x.period});const box=$('[data-fid="editEndClock"]');if(box)box.value=box.hasAttribute('data-clock-numeric')?`${x.hh}:${x.mm}`:clockText(x.hh,x.mm,x.period);}len=s.valueDur;}
  else return;
  const out=$('[data-range-len]');if(out){out.textContent=rangeText(len);out.hidden=allowsZeroLength(s)&&!positive(len);}}
// All feeds and sleep are edited with an end time; other records keep their own fields.
function editEnd(e){if(!['feed','bottle','pump','sleep'].includes(e.type))return {};const x=clockOf(e.endISO?instantMinutes(e.endISO):e.t+(+e.dur||0));return {valueEndHour:x.hh,valueEndMinute:x.mm,valueEndPeriod:x.period};}
// A start plus a length that ends after now. One rule draws the error and updates it while typing.
const RANGE_KEYS={edit:['editDate','hh','mm','period','valueDur'],quick:['manualDate','hour','minute','period','duration']};
function rangeLate(s){if(s.kind==='edit')return (positive(s.valueDur)||allowsZeroLength(s)&&validNumber(s.valueDur))&&!validEditRange(s,s.valueDur);const k=RANGE_KEYS[s.kind]||['manualDate','hour','minute','period','manualDuration'];return !(s.kind==='quick'&&s.completed)&&(positive(s[k[4]])||allowsZeroLength(s)&&validNumber(s[k[4]]))&&!validDurationRange(s,...k);}
const lateError=(s,key)=>`<p class="field-error" role="status" data-range-err${rangeLate(s)?'':' hidden'}>${t(key)}</p>`;
// The end time, its length and its error form one group under the start time.
// Started earlier? and Change start: a typed time in the last 12 hours. A time later than now is yesterday's.
function earlierMinutes(s){const m=startMinutes(dayISO(0),s.earlyHour,s.earlyMinute,s.earlyPeriod);if(m===null)return NaN;const at=m>nowM()?m-1440:m;return s.early==='switch'||nowM()-at<=720?at:NaN;}
const earlyHint=s=>!s?.early?'':s.early==='switch'?switchTimeHint(s):Number.isFinite(earlierMinutes(s))?'':s.earlyHour===''?t('hintClock'):t('hintEarlier');
function switchTimeHint(s){const at=earlierMinutes(s),saved=Date.parse(S.run?.startedAt||''),start=Number.isFinite(saved)?saved:Date.now()-timerElapsed(S.run)*60000;return Number.isFinite(at)&&Date.parse(localISOAt(at))>start?'':t('hintSwitch');}
const earlyHintHTML=s=>{const msg=earlyHint(s);return `<p class="field-error" role="status" data-early-hint${msg?'':' hidden'}>${msg}</p>`;};
const earlyClockOf=m=>{const c=clockOf(m);return {earlyHour:c.hh,earlyMinute:c.mm,earlyPeriod:c.period,earlyClock:undefined};};
function earlyFields(s,link,label){return s.early==='start'||s.early==='switch'?`${clockChoices('early',s.earlyHour,s.earlyMinute,s.earlyPeriod,label)}${earlyHintHTML(s)}`:`<button type="button" class="text-link" data-act="early">${link}</button>`;}
function moveStart(s,kind){const r=shownRun(activeTimer(kind));if(!r||!resourceAllowed('timers','change')||hasUnresolvedSheet(s))return '';return s.early===kind?`${clockChoices('early',s.earlyHour,s.earlyMinute,s.earlyPeriod,t('startTime'))}${earlyHintHTML(s)}${kind==='sleep'?'':`<button type="button" class="btn" data-act="save-start" data-arg="${kind}">${t('saveStart')}</button>`}`:`<button type="button" class="textlink" data-act="change-start" data-arg="${kind}">${t(kind==='feed'?'changeStartTime':'changeStart')}${glyph('chev')}</button>`;}
function moveFields(s,kind){const r=shownRun(activeTimer(kind));if(!r||!resourceAllowed('timers','change')||hasUnresolvedSheet(s))return '';return moveStart(s,kind)+(kind==='feed'?sideFields(s,r):'');}
function sideFields(s){if(S.run?.side==='bottle')return '';if(!s.correctingSide)return `<button type="button" class="text-link" data-act="wrong-side">${t('wrongSide')}</button>`;return `<div class="chips">${['L','R','B'].map(side=>chipB('correct-side',side,s.correctedSide===side,side==='B'?t('bothBreasts'):sideWord(side),'sel-feed')).join('')}</div><button type="button" class="btn" data-act="save-side">${t('save')}</button>`;}
// Amounts are typed in the unit on screen and kept in ml. A comma also works as the decimal mark.
// Empty is 0 (one pump side can be empty); anything that is not a number is NaN, which keeps Save off.
function typedMl(v,u){const s=String(v).trim().replace(',','.');if(!s)return 0;if(!/^(\d+\.?\d*|\.\d+)$/.test(s))return NaN;return u==='oz'?Math.round(s*ML):Math.round(s*10)/10;}
// A bottle saves the date and time its form shows (set when the Bottle tab opens).
function bottleAmountOk(s){return ['breast','formula'].includes(s?.milk)&&Number.isFinite(s?.ml)&&s.ml>0&&s.ml<=400;}
function bottleOk(s){return amountValid(s)&&['breast','formula'].includes(s?.milk)&&validDurationRange(s,'manualDate','hour','minute','period','manualDuration');}
function reminderSheet(s) { return sheetShell(t('moreRemind'),`<p class="cn">${t('reminderNote')}</p>${choices('recipient',t('recipient'),adultChoices(),s.recipient)}${choices('remindWhat',t('reminderFor'),[['feed',t('feed')],['medicine',t('medicine')],['sleep',t('sleep')]],s.what||'feed')}${field('remindDay',t('date'),s.date||dayISO(0),'date')}${clockChoices('remind',s.hour??'8',s.minute??'00',s.period||'AM')}<label class="chips">${chipB('reminderEnabled','yes',!!s.enabled,t('enableReminder'),'sel-sleep')}</label>`,{label:t('save'),on:!!s.enabled&&validEventDateTime(s)&&adultChoices().some(([name])=>name===s.recipient)}); }
// Round 3: a record opens as its own form. The common parts (Day, Logged by, Note) sit in More details; Delete is a text link after Save.
const pairChips=(act,label,vals,cur,cls='')=>`<div class="form-field"><span class="fl">${label}</span><div class="${vals.length===2?'pair':'chips'}" role="group" aria-label="${label}">${vals.map(([v,l])=>chipB(act,v,cur===v,l,cls)).join('')}</div></div>`;
const editMore=(s,inner,extra=false)=>`<details class="more-details" data-more-details data-r="R4"${extra?' data-extra':''}${s.detailsOpen?' open':''}><summary class="textlink">${t('moreDetails')}${glyph('chev')}</summary><div class="details-body">${inner}</div></details>`;
function editSheet(s) {
  const e=[...S.entries,...S.upcomingAppointments].find(x=>x.id===s.id);if(!e)return sheetShell(t('note'),'',null);
  const own=['appointment','visit'].includes(e.what),saveKey={feed:'saveFeed',bottle:'saveFeed',pump:'savePumping',sleep:'saveSleep',diaper:'saveDiaper',note:'saveNote'}[e.type],save={label:t(!own&&saveKey||'save'),on:validEdit(e,s)};
  // Appointments and visits draw their own date, time and note in editOtherFields.
  if(own)return sheetShell(t('edit'),editOtherFields(e,s),save);
  const ranged='valueEndHour' in s,day=field('editDay',t('dayL'),s.editDate,'date'),by=loggedByFields(s),note=textareaField('editNote',t('note'),s.editNote||'',3);
  const started=clockField('edit',ranged||e.type==='diaper'?t('startedL'):t('time'),s.hh,s.mm,s.period);
  const ended=`<div class="range-end">${clockField('editEnd',t('endedL'),s.valueEndHour,s.valueEndMinute,s.valueEndPeriod)}<p class="cn range-len" data-range-len data-extra aria-live="polite"${allowsZeroLength(s)&&!positive(s.valueDur)?' hidden':''}>${rangeText(s.valueDur)}</p>${lateError(s,'invalidRange')}</div>`;
  let main='',more='',extra=false;
  if(e.type==='feed'){
    main=pairChips('editSide',t('sideL'),[['L',t('left')],['R',t('right')],...(e.side==='B'||s.valueSide==='B'?[['B',t('bothBreasts')]]:[])],s.valueSide)+field('valueDur',t('minutesL'),s.valueDur??'','number','min="0" step="any" inputmode="numeric"')+started;
    more=day+ended+by+note;
  }else if(e.type==='sleep'){
    const type=`<div class="form-field"><span class="fl">${t('typeL')}</span><p class="readonly" id="sleep-kind">${s.valueNap===true?t('nap'):s.valueNap===false?t('night'):'—'}</p></div>`;
    main=started+ended+type;
    more=day+pairChips('editNap',t('sleepKind'),[['nap',t('nap')],['night',t('night')]],s.valueNap===true?'nap':s.valueNap===false?'night':'')+by+note;extra=true;
  }else if(e.type==='diaper'){
    main=pairChips('editKind',t('kindL'),[['W',t('wet')],['D',t('dirty')],['B',t('wetDirty')]],s.valueKind).replace('class="pair"','class="chips"')+started;
    more=day+editHealthFields(e,s).replace(/^[\s\S]*?(<div class="form-field"><label class="fl" for="f-valueTex")/,'$1')+by+note;extra=true;
  }else if(e.type==='note'){
    main=textareaField('editNote',t('note'),s.editNote||'',3)+started;
    more=day+editOtherFields(e,s)+by;extra=true;
  }else{
    main=(e.type==='bottle'||e.type==='pump'?editFeedingFields(e,s)+started+ended:editFeedingFields(e,s)+editHealthFields(e,s)+started)+editOtherFields(e,s);
    more=day+by+note;extra=true;
  }
  save.after=splitButton(e,s)+deleteButton(e);
  const what={feed:'feed',bottle:'feed',pump:'pump',sleep:'sleep',diaper:'diaper',note:'note'}[e.type];
  return sheetShell(what?t('editWhat',t(what)):t('edit'),main+editMore(s,more,extra),save);
}
// The one permission test for deleting a record: the edit form's Delete and the Timeline swipe both use it.
function canDeleteEntry(e){const resource=String(e.id).startsWith('app:')?(['bath','tummy'].includes(e.what)?'tummy-times':e.what==='appointment'?'notes':'feedings'):String(e.id).split(':')[0];return resourceAllowed(resource,'delete');}
function deleteButton(e){return canDeleteEntry(e)?`<button type="button" class="textlink" data-act="delete-entry">${t('deleteShort')}</button>`:'';}
function exactISOAt(minutes){return new Date(Date.parse(localISOAt(Math.floor(minutes)))+Math.round((minutes-Math.floor(minutes))*60000)).toISOString();}
const instantMinutes=iso=>(Date.parse(iso)-Date.parse(localISOAt(0)))/60000;
function loadedEdit(e){if(!['feed','bottle','pump','sleep'].includes(e.type))return {};const expected={start:e.startISO||exactISOAt(e.t),end:e.endISO||exactISOAt(e.t+(+e.dur||0))};return {loadedRange:{date:dayISO(dayOf(e.t)),start:clockOf(instantMinutes(expected.start)),end:clockOf(instantMinutes(expected.end)),expected}};}
function unchangedEditClock(s,end){const r=s.loadedRange,c=end?r?.end:r?.start,keys=end?['valueEndHour','valueEndMinute','valueEndPeriod']:['hh','mm','period'];return !!r&&keys.every((key,i)=>s[key]===c[['hh','mm','period'][i]]);}
function editRange(s){
  const shift=s.loadedRange?(isoDay(s.editDate)-isoDay(s.loadedRange.date))*1440:0;
  const start=unchangedEditClock(s,false)?instantMinutes(s.loadedRange.expected.start)+shift:startMinutes(s.editDate,s.hh,s.mm,s.period);
  let end=unchangedEditClock(s,true)?instantMinutes(s.loadedRange.expected.end)+shift:startMinutes(s.editDate,s.valueEndHour,s.valueEndMinute,s.valueEndPeriod);
  if(!unchangedEditClock(s,true)&&end!==null&&start!==null&&end<start)end+=1440;
  if(s.minutesTyped&&start!==null&&validNumber(s.valueDur))end=start+ +s.valueDur;  // typed minutes set the end exactly
  return {start,end};
}
function splitDefaults(expected){const start=Date.parse(expected.start)/60000,end=Date.parse(expected.end)/60000,first=Math.floor(start)+1,last=Math.ceil(end)-1;if(last-first<1)return null;const woke=Math.max(first,Math.min(last-1,Math.floor((start+end)/2)));return {wokeAt:new Date(woke*60000).toISOString(),sleptAt:new Date(Math.min(last,woke+10)*60000).toISOString()};}
function splitButton(e,s){return e.type==='sleep'&&/^sleep:\d+$/.test(String(e.id))&&['view','change','add'].every(action=>resourceAllowed('sleep',action))&&s.loadedRange&&splitDefaults(s.loadedRange.expected)?`<button type="button" class="btn" data-act="split" data-extra>${t('splitSleep')}</button>`:'';}
function openSplit(s){const expected=s.loadedRange?.expected,defaults=expected&&splitDefaults(expected);if(!defaults)return;const woke=clockOf(instantMinutes(defaults.wokeAt)),slept=clockOf(instantMinutes(defaults.sleptAt));S.sheet={kind:'split',id:s.id,expected,wokeHour:woke.hh,wokeMinute:woke.mm,wokePeriod:woke.period,sleptHour:slept.hh,sleptMinute:slept.mm,sleptPeriod:slept.period};}
function splitClock(s,prefix){const start=instantMinutes(s.expected.start),date=dayISO(dayOf(start));let minute=startMinutes(date,s[prefix+'Hour'],s[prefix+'Minute'],s[prefix+'Period']);if(minute===null)return NaN;if(minute<=start)minute+=1440;return Date.parse(localISOAt(minute));}
function validSplit(s){return Date.parse(s.expected.start)<splitClock(s,'woke')&&splitClock(s,'woke')<splitClock(s,'slept')&&splitClock(s,'slept')<Date.parse(s.expected.end);}
function splitSheet(s){return sheetShell(t('splitSleep'),clockChoices('woke',s.wokeHour,s.wokeMinute,s.wokePeriod,t('wokeAt'))+clockChoices('slept',s.sleptHour,s.sleptMinute,s.sleptPeriod,t('sleptAt')),{label:t('save'),on:validSplit(s)});}
function editFeedingFields(e,s){
  if(e.type==='feed')return choiceChips('editSide',t('feed'),[['L',t('left')],['R',t('right')],...(e.side==='B'||s.valueSide==='B'?[['B',t('bothBreasts')]]:[])],s.valueSide);
  if(e.type==='bottle')return field('valueMl',`${t('amount')} (ml)`,s.valueMl,'number','min="1" step="any"')+choiceChips('editMilk',t('milkWhat'),[['breast',t('milkBreast')],['formula',t('milkFormula')]],s.valueMilk);
  if(e.type==='pump')return field('valueLeftMl',`${t('left')} (ml)`,s.valueLeftMl??'','number','min="0" step="any"')+field('valueRightMl',`${t('right')} (ml)`,s.valueRightMl??'','number','min="0" step="any"');
  if(e.type==='sleep')return choiceChips('editNap',t('sleepKind'),[['nap',t('nap')],['night',t('night')]],s.valueNap===true?'nap':s.valueNap===false?'night':'','big3');
  return '';
}
// Pale, black or red stool: the pediatrician warning shows wherever the color can be picked.
const colWarn = col => ['pale', 'black', 'red'].includes(col) ? `<div class="warn">${ic('warn')}${t('callPed')}</div>` : '';
function editHealthFields(e,s){
  if(e.type==='diaper')return choiceChips('editKind',t('diaper'),[['W',t('wet')],['D',t('dirty')],['B',t('both')]],s.valueKind,'big3')+choices('valueTex',t('texture'),[['',t('notSet')],...TEXES.map(k=>[k,tt('tex',k)])],s.valueTex||'')+choices('valueCol',t('color'),[['',t('notSet')],...Object.keys(COLS).map(k=>[k,tt('col',k)])],s.valueCol||'')+`<div data-col-warn role="status">${colWarn(s.valueCol)}</div>`;
  if(e.type==='med')return field('valueName',t('medName'),s.valueName)+field('valueDose',t('dose'),s.valueDose,'number','min="0.01" step="any"')+choices('valueUnit',t('unit'),[['',t('chooseUnit')],['mg','mg'],['ml','ml'],['tablets','tablets'],['drops','drops']],s.valueUnit||'');
  if(e.type==='temp')return field('valueTemp',`${t('temp')} (°${s.valueTempUnit})`,s.valueTemp,'number','step="0.1"');
  if(e.type==='growth')return field('valueKg',`${t('weight')} (kg)`,s.valueKg??'','number','min="0" step="any"')+field('valueCm',`${t('length')} (cm)`,s.valueCm??'','number','min="0" step="any"')+field('valueHead',`${t('head')} (cm)`,s.valueHead??'','number','min="0" step="any"');
  return '';
}
function editOtherFields(e,s){
  if(e.what==='appointment')return field('editDay',t('date'),s.editDate,'date')+clockChoices('edit',s.hh,s.mm,s.period)+loggedByFields(s)+field('editAppointmentTitle',t('appointmentReason'),s.valueTitle||'')+field('editAppointmentProvider',t('provider'),s.valueProvider||'')+field('editAppointmentLocation',t('location'),s.valueLocation||'')+textareaField('editNote',t('note'),s.editNote||'',2)+(resourceAllowed('notes','delete')?`<button type="button" class="btn" data-act="delete-entry">${t('deleteRecord')}</button>`:'');
  if(e.what==='visit')return field('editDay',t('date'),s.editDate,'date')+clockChoices('edit',s.hh,s.mm,s.period)+loggedByFields(s)+field('editVisitReason',t('appointmentReason'),s.valueReason||'')+field('editVisitProvider',t('provider'),s.valueProvider||'')+textareaField('editObservations',t('observations'),s.valueObservations||'',3)+textareaField('editInstructions',t('providerInstructions'),s.valueInstructions||'',3)+field('editWeightKg',`${t('weight')} (kg)`,s.valueWeightKg??'','number','min="0" step="any"')+field('editLengthCm',`${t('length')} (cm)`,s.valueLengthCm??'','number','min="0" step="any"')+field('editHeadCm',`${t('head')} (cm)`,s.valueHeadCm??'','number','min="0" step="any"')+field('editFollowUp',t('followUp'),s.valueFollowUp||'','date')+`${photoPicker(s)}${s.photo?`<img class="note-photo" src="${s.photo}" alt="${esc(s.photoName||t('photoAdd'))}"><button type="button" class="btn" data-act="remove-photo">${t('removePhoto')}</button>`:''}`+(resourceAllowed('notes','delete')?`<button type="button" class="btn" data-act="delete-entry">${t('deleteRecord')}</button>`:'');
  let body='';
  if(e.type==='other'&&e.what==='solids')body+=field('editFood',t('food'),s.valueFood||'')+foodPreferenceHTML(s.valuePreference===undefined?e.preference:s.valuePreference,true)+field('editAmount',t('amountOptional'),s.valueAmount??'','number','min="0" step="any"');
  if(e.type==='other'&&(e.what==='tummy'||e.what==='bath'))body+=`<div class="chips">${chipB('editCompleted','yes',!!s.valueCompleted,t('completed'),'sel-sleep')}</div>`+field('editDuration',t('duration'),s.valueDur??'','number','min="0" step="1"')+(!validEditRange(s,s.valueDur)?`<p class="field-error" role="status">${t('invalidRange')}</p>`:'');
  if(e.type==='note'||e.what==='mile')body+=field('editTitle',t('moment'),s.editTitle||'')+`${photoPicker(s)}${s.photo?`<img class="note-photo" src="${s.photo}" alt="${esc(s.photoName||t('photoAdd'))}"><button class="btn" data-act="remove-photo">${t('removePhoto')}</button>`:''}`;
  if(e.type==='reminder')body+=choices('editRecipient',t('recipient'),adultChoices(),s.valueRecipient)+choices('editWhat',t('reminderFor'),[['feed',t('feed')],['medicine',t('medicine')],['sleep',t('sleep')]],s.valueWhat)+field('reminderDate',t('date'),s.valueDate,'date')+clockChoices('reminderEdit',s.valueHour,s.valueMinute,s.valuePeriod)+`<label class="chips">${chipB('editReminder','enabled',s.valueEnabled,t('enableReminder'),'sel-sleep')}</label>`;
  return body;
}
function validNumber(v){return v!==''&&Number.isFinite(+v)&&+v>=0;}
function startMinutes(date,hour,minute,period){if(!validDate(date)||isoDay(date)< -1095||!Number.isInteger(+hour)||+hour<1||+hour>12||!Number.isInteger(+minute)||+minute<0||+minute>59||!['AM','PM'].includes(period))return null;return isoDay(date)*1440+((+hour%12)+(period==='PM'?12:0))*60+(+minute);}
function validPointTime(s,dateKey,hourKey,minuteKey,periodKey){const start=startMinutes(s[dateKey],s[hourKey],s[minuteKey],s[periodKey]);return start!==null&&start<=nowM();}
function validDurationRange(s,dateKey,hourKey,minuteKey,periodKey,durationKey){const start=startMinutes(s[dateKey],s[hourKey],s[minuteKey],s[periodKey]),duration=s[durationKey];return start!==null&&(positive(duration)||allowsZeroLength(s)&&validNumber(duration))&&start+Number(duration)<=nowM();}
function validEditRange(s,duration){if(s.loadedRange){const r=editRange(s);return r.start!==null&&r.end!==null&&(r.start<r.end||allowsZeroLength(s)&&r.start===r.end)&&r.end<=nowExactM();}const start=startMinutes(s.editDate,s.hh,s.mm,s.period);return start!==null&&positive(duration)&&start+Number(duration)<=nowExactM();}
function rangeStart(s,dateKey,hourKey,minuteKey,periodKey){return startMinutes(s[dateKey],s[hourKey],s[minuteKey],s[periodKey]);}
function addTime(s,duration=0){return s.timeEdited?rangeStart(s,'manualDate','hour','minute','period'):nowExactM()-duration;}
function validDate(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const [y,m,d]=v.split('-').map(Number),x=new Date(Date.UTC(y,m-1,d));return x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d;}
function validEventDateTime(s){const h=+s.hour,m=+s.minute;return validDate(s.date||s.manualDate)&&Number.isInteger(h)&&h>=1&&h<=12&&Number.isInteger(m)&&m>=0&&m<=59&&['AM','PM'].includes(s.period);}
const EDIT_VALIDATORS={
  feed:s=>['L','R','B'].includes(s.valueSide)&&validEditRange(s,s.valueDur),
  bottle:s=>positive(s.valueMl)&&['breast','formula'].includes(s.valueMilk)&&validEditRange(s,s.valueDur),
  pump:s=>validNumber(s.valueLeftMl)&&validNumber(s.valueRightMl)&&(+s.valueLeftMl + +s.valueRightMl)>0&&validEditRange(s,s.valueDur),
  sleep:s=>[true,false].includes(s.valueNap)&&validEditRange(s,s.valueDur),
  diaper:s=>['W','D','B'].includes(s.valueKind),
  med:s=>!!s.valueName?.trim()&&positive(s.valueDose)&&['mg','ml','tablets','drops'].includes(s.valueUnit),
  temp:s=>validNumber(s.valueTemp),
  growth:s=>[s.valueKg,s.valueCm,s.valueHead].some(positive)&&[s.valueKg,s.valueCm,s.valueHead].every(v=>v===''||positive(v)),
  note:(s,e)=>e?.what==='visit'?!!(s.valueProvider||s.valueReason||s.valueObservations||s.valueInstructions||s.valueWeightKg!==''||s.valueLengthCm!==''||s.valueHeadCm!=='')&&startMinutes(s.editDate,s.hh,s.mm,s.period)<=nowM():!!s.editNote?.trim()||!!s.photo,
  other:(s,e)=>e.what==='appointment'?!!s.valueTitle?.trim()&&startMinutes(s.editDate,s.hh,s.mm,s.period)!==null:e.what==='mile'?!!s.editTitle?.trim():e.what==='solids'?!!s.valueFood?.trim()&&(s.valueAmount===''||validNumber(s.valueAmount)):(e.what==='tummy'||e.what==='bath')&&(s.valueCompleted?startMinutes(s.editDate,s.hh,s.mm,s.period)!==null&&startMinutes(s.editDate,s.hh,s.mm,s.period)<=nowM():validEditRange(s,s.valueDur)),
  reminder:s=>adultChoices().some(([name])=>name===s.valueRecipient)&&['feed','sleep','medicine'].includes(s.valueWhat)&&validDate(s.valueDate)&&validNumber(s.valueHour)&&validNumber(s.valueMinute)
};
function positive(v){return validNumber(v)&&+v>0;}
function validEdit(e,s){const h=+s.hh,m=+s.mm;return !!e&&validDate(s.editDate)&&Number.isInteger(h)&&h>=1&&h<=12&&Number.isInteger(m)&&m>=0&&m<=59&&['AM','PM'].includes(s.period)&&(EDIT_VALIDATORS[e.type]?.(s,e)??true);}
function hasDraft(s){return !!(s?.dirty||s?.startDirty);}
function dutySheet(s){const adults=S.people.map(personName).filter(Boolean);return sheetShell(t('dutyTitle'),`<div class="chips" role="group" aria-label="${t('dutyTitle')}">${adults.map(n=>chipB('dwho',n,s.who===n,esc(shownName(n)),'big3 sel-sleep')).join('')}</div>${textareaField('dutyNote',t('note'),s.note||'',2,`aria-label="${t('handoff')}" placeholder="${t('optional')}"`)}`,{label:t('save'),on:adults.includes(s.who)&&s.who!==S.duty});}
function confirmSheet(s){
  const retrying=S.retrySame===s,off=S.busy||!!S.pendingSheetOperation&&!retrying||hasUnresolvedSheet(s)&&!retrying;
  return bottomSheet(t('confirmT'),`<p class="cn" style="font-weight:700">${t('confirmBody',esc(shownName(s.by)))}</p>`,`<div class="sh-foot"><button type="button" class="btn" data-act="cancel">${t('cancel')}</button><button type="button" class="btn solid" data-act="save" ${off?'disabled aria-disabled="true"':''}>${t('confirmGo')}</button></div>`);
}
function correctionSheet(s){const started=localClock(s.start),date=new Intl.DateTimeFormat(S.lang==='es'?'es-MX':'en-US',{dateStyle:'medium',timeZone:LittleDaysZone.get()}).format(new Date(s.start));return sheetShell(t('correctTitle'),`<p><strong>${t('start')}:</strong> ${esc(date)} · ${clockAt(started.hour,started.minute,started.period)}</p><p>${t('correctHelp')}</p>${field('correctDate',t('date'),s.date,'date')}<div class="form-field">${clockChoices('correct',s.hour,s.minute,s.period,t('endTime'))}<p class="field-error" role="status" data-correction-error${validCorrection(s)?' hidden':''}>${correctionHint(s)}</p></div>`,{label:t('save'),on:validCorrection(s)});}
const correctionHint=s=>s.correctClock&&!parseClock(s.correctClock)?t('hintClock'):t('correctRange');
function validCorrection(s){if(!validDate(s.date)||!Number.isInteger(+s.hour)||+s.hour<1||+s.hour>12||!Number.isInteger(+s.minute)||+s.minute<0||+s.minute>59||!['AM','PM'].includes(s.period))return false;const end=Date.parse(localISOAt(isoDay(s.date)*1440+((+s.hour%12)+(s.period==='PM'?12:0))*60 + +s.minute)),start=Date.parse(s.start),limit=Math.min(Date.parse(s.maxEnd),Date.now());return Number.isFinite(end)&&Number.isFinite(start)&&end>start&&end-start<=86400000&&end<=limit;}
function discardSheet(s){return `<div class="over"><aside class="bsheet" key="sheet:discard" data-sheet role="dialog" aria-modal="true" aria-label="${esc(t('discard'))}"><div class="grab"></div><div class="sh-head"><span></span><h2>${t('discard')}</h2><span></span></div><div class="sh-body"><p>${t('unsaved')}</p><button class="btn solid" data-act="keep">${t('keepEditing')}</button><button class="btn" data-act="discard">${t('discard')}</button></div></aside></div>`;}
const SHEETS = {split:splitSheet, discard:discardSheet, edit:editSheet, quick: quickSheet, handoff: handoffSheet, reminder: reminderSheet, growth: growthSheet, feed: feedSheet, diaper: diaSheet, sleep: sleepSheet, more: moreSheet, settings: settingsSheet, care: careSheet, med: medSheet, temp: tempSheet, note: noteSheet, appointment:appointmentSheet, visit:visitSheet, duty: dutySheet, confirm: confirmSheet, correction:correctionSheet};

/* ---------- actions ---------- */
function localISOAt(offsetMinutes) {
  const date=dayISO(Math.floor(offsetMinutes/1440)),minute=((Math.floor(offsetMinutes)%1440)+1440)%1440;
  const [year,month,day]=date.split('-').map(Number),hour=Math.floor(minute/60),mins=minute%60,wanted=Date.UTC(year,month-1,day,hour,mins);
  let instant=wanted;
  const partsFmt=new Intl.DateTimeFormat('en-CA',{timeZone:LittleDaysZone.get(),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  for(let i=0;i<3;i++){
    const parts=partsFmt.formatToParts(new Date(instant)),get=k=>+parts.find(p=>p.type===k).value;
    const seen=Date.UTC(get('year'),get('month')-1,get('day'),get('hour'),get('minute'));
    const delta=wanted-seen;if(!delta)break;instant+=delta;
  }
  return new Date(instant).toISOString();
}
function eventForAPI(event) {
  const body={...event};delete body.id;delete body.by;delete body.t;delete body.sid;delete body.photoFile;
  const at=exactISOAt(event.t??nowExactM());body.time=at;
  if(Number.isFinite(+event.dur)&&event.dur!=null){body.start=at;body.end=exactISOAt((event.t??nowExactM())+Number(event.dur));body.duration=Number(event.dur);delete body.dur;}
  if(event.photo&&String(event.photo).startsWith('blob:'))delete body.photo;
  return body;
}
function operationFor(target){if(!target)return crypto.randomUUID();return target._operationId||(target._operationId=crypto.randomUUID());}
function clearOperation(target){if(target){delete target._operationId;delete target._undoOperationId;delete target._preparedEvents;delete target._preparedBody;delete target._preparedTimer;delete target._preparedStop;delete target._preparedSwitch;}}
function rejectedRequest(error){return Number.isInteger(error?.status)&&error.status>=400&&error.status<500&&error.status!==409;}
// A photo the server or the app refuses gets a message in the adult's language, never silence.
const photoProblem=f=>!/^image\/(jpeg|png|webp)$/.test(f.type)?'type':f.size>25*1024*1024?'size':'';
// A phone photo is big and can be HEIC. Decode it here, draw it at most 2048 px on the long side, and send that JPEG (quality 0.85) for the preview and the upload.
// A file the browser cannot decode goes on unchanged, so the type and size checks (25 MB) and their messages stay as they were.
const PHOTO_SIDE=2048,PHOTO_QUALITY=0.85;
async function decodePhoto(file){
  if(window.createImageBitmap){try{const bitmap=await createImageBitmap(file);return{source:bitmap,width:bitmap.width,height:bitmap.height,done:()=>bitmap.close?.()};}catch(_){}}
  const url=URL.createObjectURL(file),img=new Image();
  try{img.src=url;await img.decode();return{source:img,width:img.naturalWidth,height:img.naturalHeight,done:()=>{}};}finally{URL.revokeObjectURL(url);}
}
async function shrinkPhoto(file){
  try{
    const image=await decodePhoto(file),scale=Math.min(1,PHOTO_SIDE/Math.max(image.width,image.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
    const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image.source,0,0,canvas.width,canvas.height);image.done();
    const blob=await new Promise(done=>canvas.toBlob(done,'image/jpeg',PHOTO_QUALITY));
    return blob?.type==='image/jpeg'?new File([blob],`${file.name.replace(/\.[^.]*$/,'')||'photo'}.jpg`,{type:'image/jpeg'}):file;
  }catch(_){return file;}
}
// While a picked photo is being prepared, no Save can run on the sheet or screen that owns the pick, so a save never leaves the new photo behind.
// Only the last pick counts: a slower earlier shrink that ends later returns null and is dropped.
// A shrink that never ends (a decode that hangs) gives up after PHOTO_PREP_MS and the original file goes on; the busy mark also clears when its sheet or tab is gone. Hiding the page does not clear it: the read is still running, and a Save before it ends would drop the photo.
const PHOTO_PREP_MS=6000;
function settlePhotoBusy(){const o=S.photoOwner;if(S.photoBusy&&(!o||o.sheet!==S.sheet||o.tab!==S.tab)){S.photoBusy=false;S.photoOwner=null;}}
async function preparePhoto(picked){
  const pick=S.photoPick=(S.photoPick||0)+1;S.photoBusy=true;S.photoOwner={sheet:S.sheet,tab:S.tab};requestAnimationFrame(render);let timer;
  try{const file=await Promise.race([shrinkPhoto(picked),new Promise(done=>{timer=setTimeout(()=>done(picked),PHOTO_PREP_MS);})]);return S.photoPick===pick?file:null;}
  finally{clearTimeout(timer);if(S.photoPick===pick){S.photoBusy=false;S.photoOwner=null;}}
}
const photoErrorText=kind=>kind==='type'?t('photoType'):t('photoLimit');
const writeErrorText=error=>error?.code==='photo_type'?t('photoType'):error?.code==='photo_size'?t('photoLimit'):error?.code==='sleep_overlap'&&error.conflicts?.length?sleepOverlapText(error.conflicts):error?.message||t('saveFailed');
// "9:39 to 9:45 AM" / "9:39 a 9:45 a. m.", with the AM or PM on both times only when it changes. Non-breaking spaces keep each time on one line.
function sleepSpanText(item){
  const es=S.lang==='es',part=iso=>{const p=new Intl.DateTimeFormat('en-US',{timeZone:LittleDaysZone.get(),hour:'numeric',minute:'2-digit',hour12:true}).formatToParts(new Date(iso)),v=k=>p.find(x=>x.type===k)?.value||'';return{hm:`${v('hour')}:${v('minute')}`,ap:v('dayPeriod').toUpperCase()};};
  const a=part(item.start),b=part(item.end),ap=x=>'\u00a0'+(es?(x==='AM'?'a.\u00a0m.':'p.\u00a0m.'):x);
  return `${a.hm}${a.ap===b.ap?'':ap(a.ap)} ${es?'a':'to'} ${b.hm}${ap(b.ap)}`;
}
function sleepOverlapText(conflicts){const spans=conflicts.map(sleepSpanText);return spans.length===1?t('sleepOverlapOne',spans[0]):t('sleepOverlapMany',spans.length,spans.join(S.lang==='es'?' y ':' and '));}
async function recoverWrite(error,label,context={}){
  const owner=context.operationOwner;
  if(error?.status===401&&S.auth==='ready'){clearOperation(owner);context.release?.();context.onTerminal?.(error);await signInAgain(true);return;}
  if(rejectedRequest(error)){clearOperation(owner);context.release?.();if(context.onTerminal)context.onTerminal(error);S.message=S.writeError=writeErrorText(error);render();return;}
  if(error.status===409){const timerRejected=!!(owner?._preparedSwitch||owner?._preparedStop);if(timerRejected)clearOperation(owner);context.release?.();if(!context.sheet)context.onTerminal?.(error);S.pendingSheetOperation=timerRejected||!context.sheet?null:context.sheet;try{const state=await LittleDaysAPI.state();if(applyServerData(state)==='applied')resumePendingOperations(state.pendingOperations);}catch(_){}S.retrySame=null;S.retryAction=null;S.message=S.writeError=error.message||t('saveFailed');render();return;}
  if(!error.operationId){S.message=S.writeError=writeErrorText(error);render();return;}
  try{const result=await LittleDaysAPI.operation(error.operationId);await acceptWrite(result,label,{...context,operationId:error.operationId});}
  catch(checkError){// A refused split, or a save the check found refused for an overlap, is final: no Check again. An overlap names the saved sleep.
    if(checkError.knownTerminal&&(context.sheet?.kind==='split'||checkError.code==='sleep_overlap')){finalOperation({status:'failed',operationId:error.operationId,error:checkError.message,code:checkError.code,conflicts:checkError.conflicts},label,context);return;}if(checkError.status===404&&error.status!==409){context.release?.();S.retrySame=context.sheet||null;S.pendingSheetOperation=context.sheet||true;S.retryAction=context.retry||null;S.retryLabel=t('retry');S.message=t('retrySame');}
    // Outcome unknown: keep the operation (and its release) so Check again can finish it.
    else{(S.pendingOps||={})[error.operationId]={label,context:{...context,operationId:error.operationId}};uncertainOperation(error.operationId,checkFailText(checkError));return;}
    render();}
}
function setToast(label,operationId,undoUntil=null,pending=false,extra={}){if(S.toast?.pending&&S.toast.undoId!==operationId&&!pending){showDone(label);return;}clearTimeout(toastTimer);const deadline=undoUntil?Date.parse(undoUntil):null,remain=deadline?Math.max(0,deadline-Date.now()):TOAST_MS;S.toast={text:()=>typeof label==='function'?label():label,undoId:operationId||null,undoUntil,pending,k:Math.random(),total:remain,until:Date.now()+remain,...extra};const k=S.toast.k;
  if(!pending)toastTimer=setTimeout(()=>{S.toast=null;if(deadline)showDone(label);render();},remain);
  // A pending stop keeps polling, but its "Tap Undo" toast must end with the server's Undo window.
  else if(deadline)toastTimer=setTimeout(()=>{if(S.toast?.k!==k)return;S.toast=null;if(S.pendingOps?.[operationId])S.message=t('saving');render();},remain);}
// The Undo countdown and bar end at the server's deadline. When Undo ends, the plain success message takes over for a few seconds.
const TOAST_MS=10000;
function toastHTML(){const tt=S.toast;if(!tt)return '';if(tt.swipeUndo)return swipeToastHTML(tt);if(tt.cryUndo)return LittleDaysCryUI.toastHTML(tt);
  const now=Date.now(),secs=ms=>Math.max(0,Math.ceil(ms/1000)),undo=canUndo(),edit=!undo&&tt.editId,deadline=undo?Date.parse(tt.undoUntil):tt.until;
  const timer=undo||edit?` <span class="cdn" aria-hidden="true" data-countdown="${deadline}" data-kind="${undo?'undo':'edit'}">${secs(deadline-now)} s</span>`:'';
  const btn=undo?`<button type="button" class="u" data-act="undo">${t('undo')}${timer}</button>`:edit?`<button type="button" class="u" data-act="edit" data-arg="${esc(tt.editId)}">${t('addDetails')}${timer}</button>`:'<span></span>';
  const bar=tt.pending?'':`<span class="cd" style="animation-duration:${tt.total}ms;animation-delay:-${Math.max(0,tt.total-(tt.until-now))}ms"></span>`;
  return `<div class="toast" role="status" key="${tt.k}"><span>${esc(tt.text())}</span>${btn}${bar}</div>`;}
// A stop stays pending on the server until its Undo deadline, so Undo must work while the toast is pending.
function canUndo(){return !!S.toast?.undoId&&!!S.toast.undoUntil&&Date.parse(S.toast.undoUntil)>Date.now();}
// Hide a timer whose stop is waiting out its Undo window; it returns if the stop is undone or fails.
const shownRun=(r=S.run)=>r&&!S.stopping?.has(r.id)?r:null;
// Another write must not remove a different stop's pending Undo.
function clearPendingToast(id){if(S.toast?.undoId===id){clearTimeout(toastTimer);S.toast=null;}}
function clearOwnToast(id){if(!S.toast?.pending||S.toast.undoId===id){clearTimeout(toastTimer);S.toast=null;}}
// A success message clears itself after 4 seconds unless something replaced it.
function showDone(label){const done=typeof label==='function'?label():label||'';S.message=done;if(done)setTimeout(()=>{if(S.message===done){S.message='';render();}},4000);}
function localClock(iso){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:LittleDaysZone.get(),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso));
  const v=k=>parts.find(p=>p.type===k)?.value||'',hour24=+v('hour');
  return {date:`${v('year')}-${v('month')}-${v('day')}`,hour:String(hour24%12||12),hour24,minute:v('minute'),period:hour24>=12?'PM':'AM'};
}
function releasePreview(sheet){if(sheet?.photo?.startsWith?.('blob:'))URL.revokeObjectURL(sheet.photo);if(sheet)sheet.photoFile=null;}
function releaseDraft(draft){releasePreview(draft);if(draft?.kind==='discard')releaseDraft(draft.draft);}
function finalOperation(result,label,context={}){
  const id=result.operationId||context.operationId;
  // A save with no state in its reply still makes an older state request out of date.
  if(result.state)applyServerData(result.state);else if(result.status==='saved')LittleDaysAPI.writeApplied();
  if(result.correctionRequired){context.release?.();const start=result.startISO||result.start,max=result.maxEndISO||result.maxEnd,c=localClock(new Date(Math.min(Date.parse(max),Date.parse(start)+86400000)).toISOString());S.sheet={kind:'correction',operationId:id,parentOperationId:context.parentOperationId,timerId:result.timerId,start,maxEnd:max,date:c.date,hour:c.hour,minute:c.minute,period:c.period};S.pendingSheetOperation=null;S.toast=null;S.message='';render();return;}
  if(result.status==='saved'){
    if(S.photoRetry?.operationId===id)S.photoRetry=null;
    clearPendingToast(id);
    if(context.sheet&&S.sheet===context.sheet&&!context.keepOpen)S.sheet=null;
    // Close only the form that made this write; a form opened later (during an Undo window) stays open.
    if(context.close&&S.sheet===context.sheet)S.sheet=null;
    if(context.photoSheet)releasePreview(context.photoSheet);
    clearOperation(context.operationOwner);
    if(S.retrySame===context.operationOwner||S.retrySame===context.sheet)S.retrySame=null;S.retryAction=null;
    if(context.onSaved)context.onSaved(result);
    if(context.growth)growthChanged();
    if(context.clearToast)clearPendingToast(context.clearToast);
    S.pendingSheetOperation=null;delete S.pendingOps[id];S.message='';
    homeReadAttempts.clear();
    announceSaved(result,id,label,context);render();queueMicrotask(()=>refreshHomeEvidence(true));if(S.tab==='log')queueMicrotask(()=>loadTimelineDays(true));return;
  }
  if(result.status==='cancelled'){
    S.pendingSheetOperation=null;S.retrySame=null;S.retryAction=null;delete S.pendingOps[id];clearOwnToast(id);clearOperation(context.operationOwner);context.release?.();if(context.onTerminal)context.onTerminal(result);S.message='';render();return;
  }
  if(result.status==='failed'){
    S.pendingSheetOperation=null;S.retrySame=null;S.retryAction=null;delete S.pendingOps[id];clearOwnToast(id);clearOperation(context.operationOwner);context.release?.();if(context.onTerminal)context.onTerminal(result);S.message=S.writeError=writeErrorText({...result,message:result.error});render();return;
  }
}
function offerDetails(entryId,label){S.message='';setToast(label,null,null,false,{editId:entryId});}
// A save that finished after polling or error recovery has no state in its reply: reload the state, then offer details for the entry ID the server returned.
function offerDetailsWhenSaved(id,label){
  const has=()=>S.entries.some(e=>String(e.id)===String(id));
  if(has()){offerDetails(id,label);return true;}
  // Not syncFamily(): it returns early while S.busy is set, which is still true during error recovery.
  void LittleDaysAPI.state().then(state=>{applyServerData(state);if(has()&&!S.sheet){offerDetails(id,label);render();}}).catch(()=>{});
  return false;
}
function announceSaved(result,id,label,context){
  // One hop for one save, here where every save ends. The toast and the plain message are only words.
  setTimeout(()=>LittleDaysBunny.react(),60);
  if(result.sleepDiscarded)label=()=>ft('sleepDiscarded');
  if(result.sleepEnded)label=()=>ft('autoSleepEnded');
  if(context.detailsToast&&result.id&&offerDetailsWhenSaved(result.id,label))return;
  if(context.undoable===false||!result.undoUntil||context.toast===false)showDone(label);else setToast(label,id,result.undoUntil,false);
}
const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));
// A check of a save that got no answer in time says the save is not confirmed; any other failure keeps its own words.
const checkFailText=error=>error?.code==='timeout'?t('saveNotConfirmed'):error?.message||t('pollFailed');
function uncertainOperation(id,message=t('saveNotConfirmed')){const pending=S.pendingOps[id];if(!pending)return;pending.timedOut=true;S.pendingSheetOperation=null;S.retryAction=()=>checkOperationAgain(id);S.retryLabel=t('checkAgain');S.message=message;render();}
async function checkOperationAgain(id){const pending=S.pendingOps[id];if(!pending)return;S.retryAction=null;S.pendingSheetOperation=pending.context.sheet||null;S.message=t('saving');render();try{const latest=await LittleDaysAPI.operation(id),context={...pending.context,operationId:id};if(!S.pendingOps[id])return;if(['pending','finishing'].includes(latest.status)&&!latest.needsReview&&!latest.needsRetry&&!latest.correctionRequired){void pollOperation(latest,pending.label,context);return;}await handleOperationStatus(latest,pending.label,context);}catch(error){if(!S.pendingOps[id])return;if(error.status===404){notReceived(id,pending.context);return;}uncertainOperation(id,checkFailText(error));}}
// The server never received this write: release a stop guard and offer the same request again.
function notReceived(id,context){context.release?.();delete S.pendingOps[id];S.retrySame=context.sheet||null;S.pendingSheetOperation=context.sheet||true;S.retryAction=context.retry||null;S.retryLabel=t('retry');S.message=t('retrySame');render();}
async function handleOperationStatus(latest,label,context){
  const id=latest.operationId||context.operationId;
  if(latest.state)applyServerData(latest.state);
  if(interruptedSleepAttention(latest,label,context))return false;
  if(latest.correctionRequired){delete S.pendingOps[id];finalOperation(latest,label,{...context,operationId:id});return false;}
  if(latest.conflict||latest.needsReview){S.pendingOps[id]={label,context,review:true};uncertainOperation(id,latest.error||t('reviewConflict'));return false;}
  if(latest.needsRetry&&latest.requiresPhoto){S.pendingOps[id]={label,context,photoRetry:true};S.photoRetry={operationId:id,event:latest.event,portrait:!!latest.portrait};S.pendingSheetOperation=null;S.retryAction=context.retry||(()=>document.querySelector('#retry-photo-picker')?.click());S.retryLabel=t('retry');S.message=t('photoRetry');render();return false;}
  if(['pending','finishing'].includes(latest.status))return true;
  if(['saved','cancelled','failed'].includes(latest.status)){finalOperation(latest,label,{...context,operationId:id});return false;}
  uncertainOperation(id,t('unknownSave'));return false;
}
async function pollOperation(result,label,context={}){
  const id=result.operationId;if(!id)throw new Error(t('unknownSave'));
  S.pendingOps ||= {};S.pendingOps[id]={label,context};S.pendingSheetOperation=context.sheet||null;
  if(result.state)applyServerData(result.state);
  if(result.undoUntil){setToast(()=>t('stopPending'),id,result.undoUntil,true);S.message='';if(context.close&&S.sheet===context.sheet){S.sheet=null;S.pendingSheetOperation=null;}}else{if(!S.toast?.pending)S.toast=null;S.message=t('saving');}render();
  const deadline=Date.now()+30000;
  while(S.pendingOps[id]&&Date.now()<deadline){
    await wait(700);
    let latest;
    try{latest=await LittleDaysAPI.operation(id);}catch(error){if(!S.pendingOps[id])return;S.message=error.message||t('pollFailed');render();continue;}
    if(!S.pendingOps[id])return;
    if(!await handleOperationStatus(latest,label,{...context,operationId:id}))return;
  }
  if(S.pendingOps[id])uncertainOperation(id);
}
async function acceptWrite(result,label,context={}){
  if(interruptedSleepAttention(result,label,context))return false;
  if(result.status==='saved'){finalOperation(result,label,context);return true;}
  if(result.status==='pending'||result.status==='finishing'){void pollOperation(result,label,context).catch(error=>{S.message=error.message||t('pollFailed');S.pendingSheetOperation=null;render();});return false;}
  if(result.status==='cancelled'){finalOperation(result,label,context);return false;}
  if(result.status==='failed'){clearOperation(context.operationOwner);context.release?.();throw Object.assign(new Error(result.error||t('saveFailed')),{knownTerminal:true,code:result.code,conflicts:result.conflicts});}
  throw new Error(t('unknownSave'));
}
async function addEntries(list,label,photoFile=null,opts={}) {
  const draft=S.sheet,ctx={sheet:draft,close:true,photoSheet:draft?.photoFile?draft:null,operationOwner:draft,...opts};
  S.busy=true;S.message='';render();
  try{
    const bodies=draft?(draft._preparedEvents||(draft._preparedEvents=list.map(event=>withLoggedBy(eventForAPI(event),draft)))):list.map(eventForAPI);let last=null;
    for(let i=0;i<bodies.length;i++){const body=bodies[i],op=operationFor(draft||list[i]);last=photoFile?await LittleDaysAPI.writes.savePhoto(body,photoFile,op):await LittleDaysAPI.writes.createEntry(body,op);if(last.status!=='saved'){if(last.status==='pending'||last.status==='finishing')break;await acceptWrite(last,label,ctx);return;}applyServerData(last.state);}
    if(!last)throw new Error(t('saveFailed'));
    const ok=await acceptWrite(last,label,ctx);
    if(!ok&&(last.status==='failed'||last.status==='cancelled'))S.message=last.error||t('saveFailed');
  }catch(error){
    await recoverWrite(error,label,{...ctx,retry:()=>addEntries(list,label,photoFile,opts)});
  }finally{S.busy=false;render();}
}
// Save is always on for a bottle. A value that cannot save shows the mockup's inline error and the cursor goes to that field.
function flagBottle(s){
  const bad=!amountValid(s)?'ml':!s.milk?'milk':null;
  Object.assign(s,{amountBad:bad==='ml',milkBad:bad==='milk'});
  if(!bad){s.detailsOpen=true;S.message=saveHint(s)||t('hintGeneric');render();return;}
  render();document.getElementById(bad==='ml'?'f-ml':'milk-label')?.closest('.form-field')?.querySelector('input,button')?.focus();
}
async function saveFeed(s){
  if(s.early==='switch')return switchFeed(false,s.nextFeed);
  if(s.tab==='breast'&&s.manual&&s.manualSide&&validDurationRange(s,'manualDate','hour','minute','period','manualDuration')){const start=rangeStart(s,'manualDate','hour','minute','period');return addEntries([{type:'feed',side:s.manualSide,dur:+s.manualDuration,t:start,note:s.note||''}],()=>t('savedFeed'));}
  if(s.tab==='bottle'&&!bottleOk(s))return flagBottle(s);
  if(s.tab==='bottle'&&bottleOk(s))return addEntries([{type:'bottle',ml:s.ml,milk:s.milk,note:s.note||'',dur:+s.manualDuration,t:addTime(s,+s.manualDuration)}],()=>t('savedBottle',fmtVol(s.ml)));
  if(s.tab==='pump'&&S.pumpRun)return stopTimer('pump');
  if(s.tab==='pump'&&s.pL+s.pR>0&&pumpTimeOk(s))return addEntries([{type:'pump',leftMl:s.pL,rightMl:s.pR,dur:+s.manualDuration,note:s.note||'',t:addTime(s,+s.manualDuration)}],()=>t('savedPump',fmtVol(s.pL+s.pR)));
}
async function saveSleep(s){
  if(s.manual)syncManualNap(s);
  if(!s.manual&&S.sleepRun&&s.early==='sleep')return changeStart('sleep');
  if(!s.manual&&S.sleepRun&&canStopRun(S.sleepRun)){return stopTimer('sleep');}
  if(s.manual&&s.nap!==null&&validDurationRange(s,'manualDate','hour','minute','period','manualDuration')){const start=rangeStart(s,'manualDate','hour','minute','period');return addEntries([{type:'sleep',dur:+s.manualDuration,nap:s.nap,t:start,note:s.note||''}],()=>t('savedSleep'));}
  if(!s.manual&&s.nap!==null)return startTimer({kind:'sleep',nap:s.nap,note:s.note||''});
}
async function saveQuick(s){
  if(!SAVE_VALIDATORS.quick(s))return;
  const e={type:'other',what:s.what,note:(s.text||'').trim(),t:['tummy','bath'].includes(s.what)?rangeStart(s,'manualDate','hour','minute','period'):addTime(s)};
  if(s.what==='solids'){e.food=s.food.trim();e.foodId=LITTLE_DAYS_FOODS.resolve(e.food);e.preference=s.preference??null;if(s.amount)e.amount=+s.amount;}
  if(s.what==='tummy'||s.what==='bath'){if(!s.completed&&s.duration)e.dur=+s.duration;e.completed=!!s.completed;}
  if(s.what==='mile'){e.title=s.moment.trim();e.photoName=s.photoName||'';}
  return addEntries([e],()=>t('savedItem',t(s.what)),s.photoFile||null);
}
function editBase(e,s){if(e.type==='note')e.text=s.editNote||'';else e.note=s.editNote||'';e.t=isoDay(s.editDate)*1440+((+s.hh%12)+(s.period==='PM'?12:0))*60+(+s.mm||0);if(e.type==='note'||e.what==='mile'){e.title=s.editTitle||'';e.photo=s.photoRemoved?null:(s.photo||e.photo);e.photoName=s.photoRemoved?'':(s.photoName||e.photoName||'');}}
function editEntryValues(e,s){editFeedValues(e,s);editHealthValues(e,s);editOtherValues(e,s);if(e.what==='appointment')Object.assign(e,{title:s.valueTitle.trim(),provider:s.valueProvider,location:s.valueLocation,note:s.editNote});if(e.what==='visit')Object.assign(e,{provider:s.valueProvider,reason:s.valueReason,observations:s.valueObservations,instructions:s.valueInstructions,weightKg:s.valueWeightKg===''?null:+s.valueWeightKg,lengthCm:s.valueLengthCm===''?null:+s.valueLengthCm,headCm:s.valueHeadCm===''?null:+s.valueHeadCm,followUpDate:s.valueFollowUp||null});}
function editFeedValues(e,s){if(e.type==='feed')Object.assign(e,{side:s.valueSide,dur:+s.valueDur});if(e.type==='bottle')Object.assign(e,{ml:+s.valueMl,milk:s.valueMilk,dur:+s.valueDur});if(e.type==='pump'){e.sideAmounts={L:+s.valueLeftMl,R:+s.valueRightMl};e.leftMl=+s.valueLeftMl;e.rightMl=+s.valueRightMl;e.ml=+s.valueLeftMl + +s.valueRightMl;e.side='B';e.dur=+s.valueDur;}if(e.type==='sleep')Object.assign(e,{dur:+s.valueDur,nap:s.valueNap});}
function editHealthValues(e,s){if(e.type==='diaper')Object.assign(e,{kind:s.valueKind,tex:s.valueTex||null,col:s.valueCol||null});if(e.type==='med')Object.assign(e,{name:s.valueName,dose:s.valueDose,unit:s.valueUnit});if(e.type==='temp')e.c=s.valueTempUnit==='F'?f2c(+s.valueTemp):+s.valueTemp;if(e.type==='growth'){for(const k of ['kg','cm','head'])delete e[k];if(s.valueKg!=='')e.kg=+s.valueKg;if(s.valueCm!=='')e.cm=+s.valueCm;if(s.valueHead!=='')e.head=+s.valueHead;}if(e.type==='reminder')Object.assign(e,{recipient:s.valueRecipient,what:s.valueWhat,enabled:s.valueEnabled,day:isoDay(s.valueDate),hour:+s.valueHour,minute:+s.valueMinute,period:s.valuePeriod});}
function editOtherValues(e,s){if(e.type==='other'&&e.what==='solids')Object.assign(e,{food:s.valueFood.trim(),foodId:LITTLE_DAYS_FOODS.resolve(s.valueFood),preference:s.valuePreference===undefined?e.preference??null:s.valuePreference,amount:s.valueAmount===''?null:+s.valueAmount});if(e.type==='other'&&(e.what==='tummy'||e.what==='bath'))Object.assign(e,{dur:s.valueCompleted?null:(s.valueDur===''?null:+s.valueDur),completed:!!s.valueCompleted});}
function reminderPayload(recipient,what,date,hour,minute,period,enabled){const day=isoDay(date),h=+hour,m=+minute;if(!Number.isFinite(day)||!Number.isInteger(h)||h<1||h>12||!Number.isInteger(m)||m<0||m>59)throw new Error(t('saveFailed'));return {recipient,what,scheduledAt:localISOAt(day*1440+(h%12+(period==='PM'?12:0))*60+m),enabled:!!enabled};}
function editForAPI(e,s){const body=withLoggedBy(eventForAPI(e),s);if(!s.loadedRange)return body;const r=editRange(s);return {...body,time:exactISOAt(r.start),start:exactISOAt(r.start),end:exactISOAt(r.end),duration:r.end-r.start,expected:s.loadedRange.expected};}
async function saveEdit(s){const original=[...S.entries,...S.upcomingAppointments].find(x=>String(x.id)===String(s.id));if(!original||!validEdit(original,s))return;const e={...original};editBase(e,s);editEntryValues(e,s);let body=e.type==='reminder'?reminderPayload(s.valueRecipient,s.valueWhat,s.valueDate,s.valueHour,s.valueMinute,s.valuePeriod,s.valueEnabled):editForAPI(e,s);if((e.type==='note'||e.what==='mile')&&s.photoRemoved&&!s.photoFile)body.removePhoto=true;body=s._preparedBody||(s._preparedBody=body);
  const draft=S.sheet,op=operationFor(s);S.busy=true;S.message='';render();try{const result=e.type==='reminder'?await LittleDaysAPI.writes.saveReminder(e.id,body,op):draft.photoFile?await LittleDaysAPI.writes.savePhoto({...body,id:e.id},draft.photoFile,op):await LittleDaysAPI.writes.updateEntry(e.id,body,op);const ctx={sheet:draft,close:true,photoSheet:draft?.photoFile?draft:null,operationOwner:s,growth:e.type==='growth'};await acceptWrite(result,()=>t('saved'),ctx);}catch(error){await recoverWrite(error,()=>t('saved'),{sheet:draft,close:true,photoSheet:draft?.photoFile?draft:null,operationOwner:s,growth:e.type==='growth',retry:()=>saveEdit(s)});}finally{S.busy=false;render();}}
async function deleteEntry(s){if(!s||!window.confirm(t('confirmDelete')))return;return removeEntry(s,S.sheet,{retry:()=>deleteEntry(s)});}
// The delete request itself, for the edit form (draft = its open form) and the Timeline swipe (no form; `more` adds its own callbacks and wording).
async function removeEntry(s,draft,more={}){const owner=s._deleteOperation||(s._deleteOperation={}),op=operationFor(owner),label=more.label||(()=>t('saved')),ctx={sheet:draft,close:!!draft,operationOwner:owner,growth:S.entries.some(x=>String(x.id)===String(s.id)&&x.type==='growth'),retry:()=>removeEntry(s,draft,more),...more};S.busy=true;S.message='';render();try{const result=await LittleDaysAPI.writes.deleteEntry(s.id,op,more.keepalive);await acceptWrite(result,label,ctx);}catch(error){await recoverWrite(error,label,ctx);}finally{S.busy=false;render();}}
async function saveSplit(s){
  if(!validSplit(s))return;
  const body=s._preparedBody||(s._preparedBody={wokeAt:new Date(splitClock(s,'woke')).toISOString(),sleptAt:new Date(splitClock(s,'slept')).toISOString(),expected:s.expected}),op=operationFor(s),context={sheet:s,close:true,operationOwner:s,retry:()=>saveSplit(s)};
  S.busy=true;S.message='';render();
  try{await acceptWrite(await LittleDaysAPI.writes.splitEntry(s.id,body,op),()=>t('savedSleep'),context);}
  catch(error){await recoverWrite(error,()=>t('savedSleep'),context);}
  finally{S.busy=false;render();}
}
// Every diaper type saves on tap. Texture and color are an optional edit afterward (Add details on the toast, or the Timeline row).
async function saveDiaper(kind){
  const s=S.sheet;
  if(!pointTimeOk(s)){S.message=t('hintTime');render();return;}
  return addEntries([{type:'diaper',kind,note:s.note||'',...(s.tex?{tex:s.tex}:{}),...(s.col?{col:s.col}:{}),t:addTime(s)}],()=>t('savedDia',kindWord(kind)),null,{detailsToast:true});
}
async function saveOther(s){
  if(s.kind==='med'&&s.name?.trim()&&positive(s.dose)&&['mg','ml','tablets','drops'].includes(s.unit)&&validEventDateTime(s)){const tm=isoDay(s.date||dayISO(0))*1440+(+s.hour%12+(s.period==='PM'?12:0))*60+(+s.minute||0);return addEntries([{type:'med',name:s.name.trim(),dose:s.dose.trim(),unit:s.unit.trim(),next:s.next||null,t:tm,note:s.note||''}],()=>t('savedItem',t('medicine')));}
  if(s.kind==='temp'&&Number.isFinite(s.c)&&s.c>=0&&validEventDateTime(s)){const tm=isoDay(s.date||dayISO(0))*1440+(+s.hour%12+(s.period==='PM'?12:0))*60+(+s.minute||0);return addEntries([{type:'temp',c:s.c,t:tm,note:s.tempNote||''}],()=>t('savedItem',t('temp')));}
  if(s.kind==='growth')return saveGrowth(s);
  if(s.kind==='note'&&(s.text.trim()||s.photoFile)&&pointTimeOk(s))return addEntries([{type:'note',title:s.title||'',text:s.text.trim(),t:addTime(s)}],()=>t('savedItem',t('note')),s.photoFile||null);
  if(s.kind==='appointment')return saveAppointment(s);
  if(s.kind==='visit')return saveVisit(s);
  if(s.kind==='handoff'&&s.text?.trim())return addEntries([{type:'note',title:'handoff',text:s.text.trim(),t:nowM()}],()=>t('savedItem',t('handoff')));
  if(s.kind==='reminder'&&s.enabled&&s.recipient&&s.date)return saveReminder(s);
  if(s.kind==='duty')return saveDuty(s);
}
async function saveAppointment(s){return addEntries([{type:'other',what:'appointment',title:s.title.trim(),provider:s.provider||'',location:s.location||'',note:s.note||'',t:startMinutes(s.date,s.hour,s.minute,s.period)}],()=>t('savedItem',t('appointment')));}
async function saveVisit(s){return addEntries([{type:'note',what:'visit',provider:s.provider||'',reason:s.reason||'',observations:s.observations||'',instructions:s.instructions||'',weightKg:s.weightKg===''?null:+s.weightKg,lengthCm:s.lengthCm===''?null:+s.lengthCm,headCm:s.headCm===''?null:+s.headCm,followUpDate:s.followUpDate||null,t:startMinutes(s.date,s.hour,s.minute,s.period)}],()=>t('savedItem',t('visitRecord')),s.photoFile||null);}
async function saveGrowth(s){
  if(!growthDateOk(s))return;
  const e={type:'growth',note:s.note||'',date:s.timeEdited?s.manualDate:dayISO(0),t:addTime(s)};
  if(resourceAllowed('weight','add')&&positive(s.weight))e.kg=s.wu==='lb'?+s.weight*OZ_KG*16:+s.weight;
  if(resourceAllowed('height','add')&&positive(s.length))e.cm=s.lu==='in'?+s.length*2.54:+s.length;
  if(resourceAllowed('head-circumference','add')&&positive(s.head))e.head=s.hu==='in'?+s.head*2.54:+s.head;
  if(e.kg&&e.cm&&s.recumbent===true)e.recumbent=true;
  if(e.kg||e.cm||e.head)return addEntries([e],()=>t('savedItem',t('growth')),null,{growth:true});
}
async function saveReminder(s){const draft=S.sheet,body=reminderPayload(s.recipient,s.what,s.date,s.hour,s.minute,s.period,s.enabled),op=operationFor(s);S.busy=true;S.message='';render();try{const result=await LittleDaysAPI.writes.saveReminder(s.id||null,body,op);await acceptWrite(result,()=>t('reminderLimited'),{sheet:draft,close:true,operationOwner:s});}catch(error){await recoverWrite(error,()=>t('reminderLimited'),{sheet:draft,close:true,operationOwner:s,retry:()=>saveReminder(s)});}finally{S.busy=false;render();}}
async function saveDuty(s){const draft=S.sheet,op=operationFor(s);S.busy=true;S.message='';render();try{const result=await LittleDaysAPI.writes.saveDuty(s.who,s.note||'',op);await acceptWrite(result,()=>t('savedItem',t('dutyTitle')),{sheet:draft,close:true,operationOwner:s});}catch(error){await recoverWrite(error,()=>t('savedItem',t('dutyTitle')),{sheet:draft,close:true,operationOwner:s,retry:()=>saveDuty(s)});}finally{S.busy=false;render();}}
async function persistPreferences(values,retry=false){if(S.busy||S.pendingSheetOperation&&!retry)return;const fingerprint=JSON.stringify(values);if(S.preferenceFingerprint!==fingerprint){S.preferenceFingerprint=fingerprint;S.preferenceOperation=null;}S.preferenceOperation||=crypto.randomUUID();S.busy=true;S.message=t('saving');render();const ctx={undoable:false,toast:false,onSaved:()=>{S.preferenceOperation=null;S.preferenceFingerprint='';},onTerminal:()=>{S.preferenceOperation=null;S.preferenceFingerprint='';},retry:()=>persistPreferences(values,true)};try{const result=await LittleDaysAPI.writes.savePreferences({...S.preferences,...values},S.preferenceOperation);await acceptWrite(result,'',ctx);}catch(error){await recoverWrite(error,'',ctx);}finally{S.busy=false;render();}}
async function save() {
  const s=S.sheet;if(!s||S.busy||S.photoBusy||S.pendingSheetOperation&&S.retrySame!==s||hasUnresolvedSheet(s)&&S.retrySame!==s)return;
  if(s.kind==='correction')return saveCorrection(s);
  if(s.kind==='split')return saveSplit(s);
  if(s.kind==='diaper')return saveDiaper(s.type);if(s.kind==='feed')return saveFeed(s);if(s.kind==='sleep')return saveSleep(s);if(s.kind==='quick')return saveQuick(s);if(s.kind==='edit')return saveEdit(s);if(s.kind==='confirm')return confirmTimer(s);return saveOther(s);
}
async function saveCorrection(s){if(!validCorrection(s)||S.busy)return;const end=localISOAt(isoDay(s.date)*1440+((+s.hour%12)+(s.period==='PM'?12:0))*60 + +s.minute);S.busy=true;S.message=t('saving');render();try{const result=await LittleDaysAPI.writes.correctTimer(s.operationId,end);await acceptWrite(result,()=>t(s.parentOperationId?'savedSleep':'savedFeed'),{sheet:s,close:true,undoable:true,toast:true,operationOwner:s,onSaved:s.parentOperationId?()=>void checkOperationAgain(s.parentOperationId):null,onTerminal:s.parentOperationId?()=>void checkOperationAgain(s.parentOperationId):null});}catch(error){S.message=S.writeError=writeErrorText(error);render();}finally{S.busy=false;render();}}
async function cancelCorrection(s){if(S.busy)return;if(s.parentOperationId){S.sheet=null;deferInterruptedSleep(s.parentOperationId);return;}const op=s._cancelOperation||(s._cancelOperation=crypto.randomUUID());S.busy=true;S.message=t('saving');render();try{const result=await LittleDaysAPI.writes.undo(s.operationId,op);await acceptWrite(result,()=>'',{sheet:s,close:true,undoable:false,toast:false,operationOwner:s});}catch(error){S.message=S.writeError=error.message||t('saveFailed');render();}finally{S.busy=false;render();}}
function otherAdult(by){const who=personName(by)||String(by||'');return !!who&&who!==personName(S.me)&&who!==String(typeof S.me==='object'?S.me.id:'');}
function activeTimer(kind){return kind==='feed'?S.run:kind==='sleep'?S.sleepRun:kind==='pump'?S.pumpRun:S.timers.find(x=>x.kind===kind)||null;}
// A retry passes its first sheet, so a retry tapped from another form never closes that form.
async function timerRequest(request,label,{close=true,undoable=false,toast=false,owner=S.sheet,stopId=null,keepOpen=false,onSaved=null,sheet=S.sheet}={}){
  if(S.busy)return;S.busy=true;S.message='';
  // A stopping timer stays hidden until the server gives a final answer; a lost reply keeps it hidden.
  if(stopId)(S.stopping||=new Set()).add(stopId);
  const release=stopId?()=>S.stopping.delete(stopId):null;render();
  // The accepted path keeps retry too: Sleep has no header Save, so a start the server later loses needs the Retry button.
  const ctx={sheet,close,undoable,toast,operationOwner:owner||S,release,keepOpen,onSaved,retry:()=>timerRequest(request,label,{close,undoable,toast,owner:owner||S,stopId,keepOpen,onSaved,sheet})};
  try{const result=await request(operationFor(owner||S));await acceptWrite(result,label,ctx);}
  catch(error){await recoverWrite(error,label,ctx);}
  finally{S.busy=false;render();}
}
function startTimer(timer){
  if(!canStartTimer()){S.message=t('saveFailed');render();return;}
  // A start has its own save ID: a stop that waits out its Undo window on this form or on Home keeps its own.
  const holder=S.sheet||S,owner=holder._startOwner||(holder._startOwner={}),kind=timer.kind,stayOpen=kind==='pump',early=S.sheet?.early==='start'?earlierMinutes(S.sheet):null;
  if(Number.isNaN(early)){S.message=earlyHint(S.sheet);render();return;}
  const input=owner._preparedTimer||(owner._preparedTimer={...timer,note:timer.note??S.sheet?.note??'',...(early===null?{}:{start:localISOAt(early)})});
  return timerRequest(op=>LittleDaysAPI.writes.startTimer(input,op),()=>t('started'),{close:!stayOpen,toast:false,undoable:false,owner});
}
function changeStart(kind){
  const s=S.sheet,r=activeTimer(kind),at=s?.early===kind?earlierMinutes(s):NaN;
  if(!r?.id||!Number.isFinite(at)){S.message=earlyHint(s)||t('saveFailed');render();return;}
  // The form stays open, so a note or pump amounts typed before Change start are kept.
  // The typed time stays until the change is confirmed. A confirmation without fresh state moves the shown start here.
  // The start is fixed when sent, so a reply after midnight keeps its day. The change has its own save ID,
  // so a pump start from this form while the change is unconfirmed never reuses it.
  const start=localISOAt(at),owner=s._startChange||(s._startChange={});
  const onSaved=res=>{if(s.early===kind)s.early=null;s.startDirty=false;const run=activeTimer(kind);if(!res.state&&run?.id===r.id)Object.assign(run,{t0:at,startedAt:start});};
  return timerRequest(op=>LittleDaysAPI.writes.changeTimerStart(r.id,start,op),()=>t('startChanged',clk(at)),{close:false,toast:false,undoable:false,keepOpen:true,owner,onSaved});
}
function changeSide(){
  const s=S.sheet,run=shownRun();
  if(!run?.id||!resourceAllowed('timers','change')||!['L','R','B'].includes(s?.correctedSide))return;
  const side=s.correctedSide,owner=s._sideChange||(s._sideChange={});
  const onSaved=res=>{s.correctingSide=false;if(!res.state&&S.run?.id===run.id)S.run.side=side;};
  return timerRequest(op=>LittleDaysAPI.writes.changeTimerSide(run.id,side,op),()=>t('sideChanged'),{close:false,keepOpen:true,owner,onSaved});
}
function stopTimer(kind,confirmOther=false){
  const run=activeTimer(kind);if(!run?.id){S.message=t('saveFailed');render();return;}
  if(!canStopRun(run)){S.message=t('saveFailed');render();return;}
  if(S.stopping?.has(run.id)){S.message=t('stopPending');render();return;}
  // One Undo at a time: a second stop would replace the first stop's Undo button.
  if(S.toast?.pending&&canUndo()){S.message=t('waitUndo');render();return;}
  if(otherAdult(run.by)&&!confirmOther){S.sheet={kind:'confirm',act:kind==='sleep'?'sleepstop':kind==='pump'?'pumpstop':'stop',by:personName(run.by)||run.by,draft:S.sheet};render();return;}
  const owner=S.sheet||S,prepared=owner._preparedStop;
  const amounts=prepared?.kind===kind?prepared.amounts:kind==='pump'?{leftMl:S.sheet?.pL??0,rightMl:S.sheet?.pR??0}:kind==='feed'&&run.side==='bottle'?{ml:S.sheet?.ml,milk:S.sheet?.milk}:undefined;
  if(kind==='feed'&&run.side==='bottle'&&!bottleAmountOk(amounts)){S.message=t('hintAmount');render();return;}
  // A side that holds no number (NaN) stops here too, so the timer never saves it as 0.
  if(kind==='pump'&&!(amounts.leftMl+amounts.rightMl>0)){S.message=t('hintAmount');render();return;}
  const note=prepared?.kind===kind?prepared.note:S.sheet?.note||'';if(!prepared||prepared.kind!==kind)owner._preparedStop={kind,amounts,note,confirmOther};
  const label=kind==='sleep'?()=>t('savedSleep'):kind==='pump'?()=>t('savedPump',fmtVol(amounts.leftMl+amounts.rightMl)):()=>t('savedFeed');
  return timerRequest(op=>LittleDaysAPI.writes.stopTimer(run.id,amounts,confirmOther,op,note),label,{close:true,undoable:true,toast:true,owner,stopId:run.id});
}
async function requestSwitch(prepared,op){
  try{return await LittleDaysAPI.writes.switchFeed(prepared.id,prepared.side,prepared.confirmOther,op,prepared.note,prepared.at,prepared.amounts);}
  catch(error){
    if(error.status===400){try{applyServerData(await LittleDaysAPI.state());}catch{}}
    if(error.message===W.sideChangedElsewhere[0])error.message=t('sideChangedElsewhere');
    throw error;
  }
}
function openSwitchTime(){if(S.sheet?._preparedSwitch||!shownRun()||!canStopRun()||hasUnresolvedSheet(S.sheet))return;if(S.sheet?.kind!=='feed')formAction('open-feed');Object.assign(S.sheet,{tab:S.run.side==='bottle'?'bottle':'breast',early:'switch',nextFeed:S.run.side==='L'?'R':'L',correctingSide:false},earlyClockOf(nowM()));}
function switchFeed(confirmOther=false,side){const run=S.run;if(!run?.id){S.message=t('saveFailed');render();return;}const s=S.sheet;side=side||s?.nextFeed||(run.side==='L'?'R':'L');if(s?.early==='switch'&&earlyHint(s)){S.message=earlyHint(s);render();return;}if(run.side==='bottle'&&!bottleAmountOk(s)){S.message=t('hintAmount');render();return;}if(otherAdult(run.by)&&!confirmOther){if(s)s.nextFeed=side;S.sheet={kind:'confirm',act:'switch',nextFeed:side,by:personName(run.by)||run.by,draft:s};render();return;}const at=s?.early==='switch'?localISOAt(earlierMinutes(s)):undefined,owner=s||S,prepared=owner._preparedSwitch||(owner._preparedSwitch={id:run.id,side,note:s?.note||'',confirmOther,at,...(run.side==='bottle'?{amounts:{ml:s.ml,milk:s.milk}}:{})});return timerRequest(op=>requestSwitch(prepared,op),()=>t('started'),{close:true,undoable:false,toast:false,owner});}
function executeTimer(action,confirmOther=false){if(action==='sleep-end-paused')return pausedSleepAction('end',confirmOther);if(action==='sleep-pause')return requestSleepAction('pause',confirmOther);if(action==='sleep-discard')return requestSleepAction('discard',confirmOther);if(action==='switch')return switchFeed(confirmOther);if(action==='sleepstop')return stopTimer('sleep',confirmOther);if(action==='pumpstop')return stopTimer('pump',confirmOther);return stopTimer('feed',confirmOther);}
function confirmTimer(s){S.sheet=s.draft||null;return s.act==='switch'?switchFeed(true,s.nextFeed):executeTimer(s.act,true);}
// The portrait saves as soon as a pick is ready (owner, 2026-11-19: a separate Save tap was missed, so no photo ever saved).
// One upload at a time: it is open from its PUT until the answer is final, a pending answer included (Codex r1). A pick made
// while it is open, or while another request runs, waits and starts when nothing else runs, so an older pick's answer always
// comes before a newer pick's. A failed upload keeps its draft and a Retry.
// An operation the server sent back for the photo again (photoRetry) is not open: its Retry must be able to resend (Codex r2).
// The same photo picked again is answered with the first pick's pending operation (server/photos.ts pendingDuplicate). The newer
// draft adopts that id, so a check, Retry or saved answer for it belongs to the current draft (Codex r3).
const samePortraitSave=draft=>{const d=S.portraitDraft;return !!d&&(d===draft||!!draft._operationId&&d._operationId===draft._operationId);};
const portraitOpen=()=>!!S.portraitUploading||Object.values(S.pendingOps||{}).some(p=>p.context?.portrait&&!p.photoRetry);
async function submitPortrait(){const draft=S.portraitDraft;if(!resourceAllowed('children','change')||!draft?.file||draft.saving||S.busy||S.photoBusy||portraitOpen())return;dropOlderPortrait(draft);draft.saving=true;draft.tried=true;S.portraitUploading=true;S.busy=true;S.message=t('saving');render();const context={portrait:true,undoable:false,toast:false,operationOwner:draft,onSaved:()=>{URL.revokeObjectURL(draft.url);if(samePortraitSave(draft))S.portraitDraft=null;},retry:Object.assign(()=>{if(samePortraitSave(draft))return submitPortrait();},{portraitDraft:draft})};try{const op=draft._operationId||(draft._operationId=crypto.randomUUID()),result=await LittleDaysAPI.writes.savePortrait(draft.file,op);if(result?.operationId&&result.operationId!==op)draft._operationId=result.operationId;await acceptWrite(result,()=>t('portraitSaved'),context);}catch(error){await recoverWrite(error,()=>t('portraitSaved'),context);}finally{draft.saving=false;S.portraitUploading=false;S.busy=false;render();}}
// When an older pick failed and its Retry waits in the status bar, a newer waiting pick replaces it: the newer one is what the
// parent wants, and the older Retry would send nothing (Codex r2).
function dropOlderPortrait(d){const old=S.retryAction?.portraitDraft;if(!old||old===d)return;
  S.retryAction=null;S.retrySame=null;S.pendingSheetOperation=null;S.message='';if(S.photoRetry&&S.photoRetry.operationId===old._operationId)S.photoRetry=null;
  for(const [id,p] of Object.entries(S.pendingOps||{}))if(p.context?.operationOwner===old&&p.photoRetry)delete S.pendingOps[id];queueMicrotask(render);}
function startWaitingPortrait(){const d=S.portraitDraft;if(d&&!d.tried&&!d.saving)dropOlderPortrait(d);if(d&&!d.tried&&!d.saving&&!S.busy&&!S.photoBusy&&!S.pendingSheetOperation&&!portraitOpen()&&resourceAllowed('children','change'))queueMicrotask(submitPortrait);}
function saveUndo(){const toast=S.toast;if(!canUndo()||S.busy)return;const op=toast._undoOperationId||(toast._undoOperationId=crypto.randomUUID()),ctx={undoable:false,toast:false,clearToast:toast.undoId,operationOwner:toast,onSaved:()=>{const pending=S.pendingOps[toast.undoId];pending?.context?.release?.();clearOperation(pending?.context?.operationOwner);delete S.pendingOps[toast.undoId];pending?.context?.onTerminal?.({status:'cancelled'});},retry:()=>saveUndo()};S.busy=true;S.message=t('saving');render();LittleDaysAPI.writes.undo(toast.undoId,op).then(result=>acceptWrite(result.status==='cancelled'?{...result,status:'saved'}:result,()=>t('undone'),ctx)).catch(error=>recoverWrite(error,()=>t('undone'),ctx)).finally(()=>{S.busy=false;render();});}

function formAction(a){switch(a){
    case 'open-feed': { const b=lastOf('bottle'); S.sheet=S.drafts.feed||{kind:'feed',tab:shownRun(S.pumpRun)?'pump':shownRun()?.side==='bottle'?'bottle':'breast',ml:shownRun()?.side==='bottle'?0:b?.ml||60,milk:b?.milk||null,pL:0,pR:0,vu:DEFU.vol(unitsOf())};delete S.drafts.feed;break; }
    case 'open-dia': S.sheet = {kind: 'diaper', type: null, tex: null, col: null}; break;
    case 'open-sleep': {const draft=S.drafts.sleep||{kind:'sleep',nap:napNow(),manual:false};if(!canStartTimer()&&!shownRun(S.sleepRun)&&!draft.manual){draft.manual=true;draft.manualDate=dayISO(0);const c=currentClock();Object.assign(draft,c,{endHour:c.hour,endMinute:c.minute,endPeriod:c.period,manualDuration:'0'});}S.sheet=draft;delete S.drafts.sleep;break;}
    case 'open-more': S.sheet = {kind: 'more'}; break;
    case 'open-settings': S.sheet = {kind: 'settings'}; break;
    case 'night-open': if(S.sheet?.kind==='settings')S.sheet.nightOpen=!S.sheet.nightOpen; break;
    case 'open-care': S.message='';S.sheet={kind:'care',careStart:'',careEnd:''};void refreshCare();break;
    case 'open-med': S.sheet=S.drafts.med||{kind:'med',name:'',dose:'',unit:'',next:'',date:dayISO(0),...currentClock()};delete S.drafts.med;break;
    case 'open-temp': S.sheet=S.drafts.temp||{kind:'temp',tu:DEFU.temp(unitsOf()),temperature:'',c:null,date:dayISO(0),...currentClock(),tempNote:''};delete S.drafts.temp;break;
    case 'open-growth': S.sheet=S.drafts.growth||{kind:'growth',weight:'',length:'',head:'',wu:DEFU.wt(unitsOf()),lu:DEFU.len(unitsOf()),hu:DEFU.len(unitsOf())};delete S.drafts.growth;break;
    case 'growth-birth': if(S.sheet?.kind==='growth'&&validDate(S.child?.birthDate))Object.assign(S.sheet,{manualDate:S.child.birthDate,timeEdited:true,dirty:true});break;
    case 'open-note': S.sheet=S.drafts.note||{kind:'note',text:'',photo:''};delete S.drafts.note;break;
    case 'open-appointment': S.sheet=S.drafts.appointment||{kind:'appointment',title:'',provider:'',location:'',note:'',date:dayISO(1),hour:'9',minute:'00',period:'AM'};delete S.drafts.appointment;break;
    case 'open-visit': S.sheet=S.drafts.visit||{kind:'visit',provider:'',reason:'',observations:'',instructions:'',weightKg:'',lengthCm:'',headCm:'',followUpDate:'',date:dayISO(0),...currentClock(),photo:''};delete S.drafts.visit;break;
    case 'open-handoff': S.sheet=S.drafts.handoff||{kind:'handoff',text:''};delete S.drafts.handoff;break;
    case 'open-reminder': S.sheet=S.drafts.reminder||{kind:'reminder',recipient:signedInRecipient(),what:'feed',date:dayISO(0),hour:'8',minute:'00',period:'AM',enabled:false};delete S.drafts.reminder;break;
    default:return false;}return true;}
function clockOf(t){const m=((Math.floor(t)%1440)+1440)%1440,h=Math.floor(m/60);return {hh:String(h%12||12),mm:pad(m%60),period:h<12?'AM':'PM'};}
function currentClock(){const c=clockOf(nowM());return {hour:c.hh,minute:c.mm,period:c.period};}
// Typed time text belongs to the boxes on screen. A tab or mode change drops it, so old text cannot set a hint.
function dropClockText(s){for(const k of Object.keys(s))if(/Clock$/.test(k))delete s[k];}
function editAction(arg){const e=[...S.entries,...S.upcomingAppointments].find(x=>String(x.id)===String(arg));if(e){const c=clockOf(e.t),sides=e.sideAmounts||{};S.sheet=S.drafts.edit?.id===e.id?S.drafts.edit:{kind:'edit',id:e.id,editDate:dayISO(dayOf(e.t)),...c,...editEnd(e),...loadedEdit(e),editNote:e.type==='note'?(e.text||''):(e.note||''),editTitle:e.title||'',valueTitle:e.title||'',valueProvider:e.provider||'',valueLocation:e.location||'',valueReason:e.reason||'',valueObservations:e.observations||'',valueInstructions:e.instructions||'',valueWeightKg:e.weightKg??'',valueLengthCm:e.lengthCm??'',valueHeadCm:e.headCm??'',valueFollowUp:e.followUpDate||'',valueSide:e.side,valueDur:e.dur,valueNap:e.nap,valueCompleted:e.completed,valueFood:e.food||'',valueAmount:e.amount??'',valueMl:e.ml,valueLeftMl:sides.L??e.leftMl??'',valueRightMl:sides.R??e.rightMl??'',valueMilk:e.milk,valueKind:e.kind,valueTex:e.tex,valueCol:e.col,valueName:e.name,valueDose:e.dose,valueUnit:e.unit,valueTempUnit:DEFU.temp(unitsOf()),valueTemp:e.c!=null?String(S.units[S.me]==='us'?c2f(e.c):e.c):'',valueKg:e.kg??'',valueCm:e.cm??'',valueHead:e.head??'',valueRecipient:e.recipient,valueWhat:e.what,valueEnabled:e.enabled,valueDate:dayISO(e.day??dayOf(e.t)),valueHour:String(e.hour||12),valueMinute:pad(e.minute||0),valuePeriod:e.period||'AM',photo:e.photo,photoName:e.photoName};}delete S.drafts.edit;}
function sheetAction(a,arg){const s=S.sheet;switch(a){
    case 'split':openSplit(s);break;
    case 'ftab':{const was=allowsZeroLength(s);if(s.early==='switch')s.early=null;s.tab=arg;dropClockText(s);resetRangeOnTab(s,was);break;}
    case 'logged-by':if(!loggedByLocked(s)){s.by=arg;s.dirty=true;}break;
    case 'duty': S.sheet = {kind: 'duty', who: S.duty}; break;
    case 'cancel': case 'scrim': if(S.sheet?.kind==='correction')return cancelCorrection(S.sheet);if(S.sheet?.kind==='discard'){S.sheet=S.sheet.draft;break;}if(S.sheet&&hasDraft(S.sheet)){S.sheet={kind:'discard',draft:S.sheet};break;}S.sheet=null;break;
    case 'keep': S.sheet=s.draft;break;
    case 'discard': {const after=s.after;releaseDraft(s.draft);delete S.drafts[s.draft.kind];S.sheet=null;if(S.retrySame===s.draft){clearOperation(s.draft);S.retrySame=null;S.pendingSheetOperation=null;S.retryAction=null;S.message='';}if(after?.type==='shortcut')openShortcut(after.arg);break;}
    case 'save': save(); break;
    case 'note-open': s.noteOpen=true;requestAnimationFrame(()=>document.getElementById('f-'+arg)?.focus({preventScroll:true}));break;
    // Focus the new group, not its date field, so a phone does not open the date picker by itself.
    case 'show-when': s.when=true;requestAnimationFrame(()=>document.getElementById('when-fields')?.focus({preventScroll:true}));break;
    case 'edit':editAction(arg);break;
    default:return false;}return true;}
function measurementAction(a,arg){const s=S.sheet;switch(a){
    case 'wu': case 'lu': case 'hu': {const key={wu:'weight',lu:'length',hu:'head'}[a],old=s[a],dest=arg;if(s[key]&&old!==dest){const toBase=old==='lb'?+s[key]*0.453592:+s[key],fromBase=dest==='lb'?toBase/0.453592:toBase;const toCm=old==='in'?+s[key]*2.54:+s[key],fromCm=dest==='in'?toCm/2.54:toCm;s[key]=String(a==='wu'?fromBase:fromCm);}s[a]=dest;break;}
    default:return false;}return true;}
// A preset amount fills the pump side in use, or the bottle amount.
function setPreset(s,arg){if(s.tab==='pump')s['p'+(s.pumpFocus||'L')]=+arg;else{s.ml=+arg;s.amountBad=false;}s.dirty=true;}
function feedAction(a,arg){const s=S.sheet;if(measurementAction(a,arg))return true;switch(a){
    case 'clock-period': {const [prefix,period]=arg.split(':');updateInput(prefix+'Period',period);break;}
    case 'switch-earlier': openSwitchTime();break;
    case 'next-feed': s.nextFeed=arg;break;
    case 'wrong-side': s.early=null;s.correctingSide=true;s.correctedSide=S.run?.side;break;
    case 'correct-side': s.correctedSide=arg;break;
    case 'save-side': void changeSide();break;
    case 'start': case 'switch': case 'stop': case 'pumpTimer': return false;
    // The clocks restart at now, so the Start is untouched again: a Day the parent did not pick restarts at today (followStartDay
    // may have moved it; review r1), and earlier typing no longer steers Minutes or Ended (review r2). A picked Day keeps timeEdited.
    case 'manual': s.manual=!s.manual;dropClockText(s);if(s.manual){s.early=null;const c=currentClock();delete s.manualMinutesTyped;if(s.dayEdited)s.manualDate ||= dayISO(0);else{s.manualDate=dayISO(0);delete s.timeEdited;}Object.assign(s,c,{endHour:c.hour,endMinute:c.minute,endPeriod:c.period,manualDuration:'0'});delete s.endEdited;}s.dirty=true;break;
    case 'manualSide': s.manualSide=arg;if(s.manual)s.dirty=true;break;
    case 'ml-set': setPreset(s,arg);break;
    case 'dkind': s.type=arg;s.dirty=true;break;
    case 'early': Object.assign(s,{early:'start'},earlyClockOf(nowM()));break;
    case 'change-start': {const r=activeTimer(arg);Object.assign(s,{early:arg,correctingSide:false},r&&nowM()-r.t0<=720?earlyClockOf(r.t0):{earlyHour:'',earlyMinute:'',earlyPeriod:currentClock().period,earlyClock:undefined});break;}
    case 'vu': s.vu = arg; break;
    case 'tu': s.tu=arg;break;
    case 'milk': s.milk = s.milk === arg ? null : arg; break;
    case 'dtype': s.type = arg; break;
    case 'tex': s.tex = s.tex === arg ? null : arg; break;
    case 'col': s.col = s.col === arg ? null : arg; break;
    case 'nap': s.nap = arg === 'nap'; s.napPicked = true; break;
    case 'mname': s.name = arg; break;
    case 'mdose': s.dose = arg; break;
    case 'mnext': s.next = +arg; break;
    case 'temp': s.c = s.tu === 'F' ? f2c(tempShown(s) + +arg / 10) : Math.round(s.c * 10) / 10 + +arg / 10; break;
    default:return false;}return true;}
function openShortcut(arg){history.replaceState(null,'','#'+arg);S.sheet=arg==='feed'?{kind:'feed',tab:shownRun(S.pumpRun)?'pump':'breast',ml:lastOf('bottle')?.ml||60,milk:lastOf('bottle')?.milk||null,pL:0,pR:0,vu:DEFU.vol(unitsOf())}:{kind:'diaper',type:null,tex:null,col:null};}
// The growth history is out of date: reload it now on Charts, or on the next visit to Charts.
// A save that is a growth save and also brings a changed measurement calls this twice: one reload covers both.
let growthReloadQueued=false;
function growthChanged(){
  S.growthLoaded=false;homeGrowthAt=0;
  if(growthPending===S.growthRequest)S.growthRequest++;
  if(S.tab!=='charts'&&!homeVisible()||growthReloadQueued)return;
  growthReloadQueued=true;
  queueMicrotask(()=>{growthReloadQueued=false;if(S.tab==='charts')void loadGrowthHistory();else refreshHomeEvidence();});
}
// What each tab loads when it opens. Growth history loads on the first visit to Charts; a growth change marks it as not loaded.
function openedTab(tab){
  if(tab==='home')refreshHomeEvidence();
  if(tab==='log')void loadTimelineDays();
  if(tab==='charts'){void loadTrendRange();if(!S.growthLoaded)void loadGrowthHistory();}
  if(tab==='photos'){if(S.photoId){S.photoId=null;render();}void loadPhotos();}
}
// A thumbnail picks its photo by ID, so photos that load later do not change which one is large.
function pickPhoto(index){const entry=S.entries.filter(e=>e.photo)[+index];S.photoId=entry?String(entry.id):null;}
function viewAction(a,arg){const s=S.sheet;switch(a){
    case 'retry-trends':void loadTrendRange();break;
    case 'theme': setThemeMode(arg); break;
    case 'dwho': s.who = arg; break;
    case 'quick': S.sheet=S.drafts.quick||{kind:'quick',what:arg,food:'',amount:'',duration:'',text:'',moment:'',manualDate:dayISO(0),completed:false,...currentClock()}; delete S.drafts.quick; break;
    case 'completed': s.completed=arg==='yes'; break;
    case 'reminderEnabled': s.enabled=!s.enabled; break;
    case 'editReminder': s.valueEnabled=!s.valueEnabled; s.dirty=true;break;
    case 'editNap': s.valueNap=arg==='nap';s.dirty=true;break;
    case 'editSide': s.valueSide=arg;s.dirty=true;break;
    case 'editMilk': s.valueMilk=arg;s.dirty=true;break;
    case 'editKind': s.valueKind=arg;s.dirty=true;break;
    case 'editCompleted': s.valueCompleted=!s.valueCompleted;s.dirty=true;break;
    case 'remove-photo': if(S.sheet){if(S.sheet.photo?.startsWith?.('blob:'))URL.revokeObjectURL(S.sheet.photo);S.sheet.photo=null;S.sheet.photoFile=null;S.sheet.photoName='';S.sheet.photoRemoved=true;S.sheet.dirty=true;} break;
    case 'shortcut': if(S.sheet?.kind==='discard')break;if(S.sheet&&hasDraft(S.sheet))S.sheet={kind:'discard',draft:S.sheet,after:{type:'shortcut',arg}};else openShortcut(arg);break;
    case 'growth-measure': S.growthMeasure=arg; break;
    case 'growth-recumbent': if(s?.kind==='growth')Object.assign(s,{recumbent:!s.recumbent,dirty:true});break;
    case 'retry-growth': void loadGrowthHistory(); break;
    case 'chart': S.chart = arg; break;
    case 'photo': pickPhoto(arg); break;
    case 'photos-older': void loadPhotos(true); break;
    case 'tab': S.tab = arg;queueMicrotask(()=>openedTab(arg));break;
    case 'undo': saveUndo(); return true;
    case 'lang': S.lang = arg; break;
    case 'night': S.night = !S.night; break;
    case 'view': S.view = arg; break;
    case 'me': S.me = arg; break;
    case 'units': S.units[S.me] = arg; break;
    default:return tlAction(a,arg);}return true;}
// Timer actions answer with their write. A table keeps act() under the complexity limit.
const TIMER_ACTS={
  start:(arg,s)=>startTimer({kind:'feed',side:arg,note:s?.note||''}),
  'save-start':arg=>changeStart(arg),
  switch:arg=>switchFeed(false,arg),
  stop:()=>stopTimer('feed'),
  pumpTimer:(arg,s)=>S.pumpRun?stopTimer('pump'):startTimer({kind:'pump',note:s?.note||''}),
  'sleep-start':(arg,s)=>{if(s?.kind!=='sleep')return;s.nap=s.napPicked?arg==='nap':startsAsNap(s);return saveSleep(s);},
  'stop-sleep':()=>stopTimer('sleep',true),
  // Home pins one Stop per timer; it asks first (round 3). The sheet's confirm button runs the stop.
};
// Stopping a timer asks first (round 3): the confirm sheet carries the live Stop. True when this action was the question or its answer.
function stopGate(a){
  if((a==='stop'&&S.run||a==='stop-sleep'&&S.sleepRun)&&!S.stopOk){S.confirmStop=a==='stop'?'feed':'sleep';S.confirmAt={sheet:S.sheet,tab:S.tab};S.stopOpener=S.lastClick||'';render();requestAnimationFrame(()=>document.querySelector('.confirm [data-act="stop-go"]')?.focus());return true;}
  if(a==='stop-keep'){S.confirmStop=null;render();return true;}
  if(a==='stop-go'){const w=S.confirmStop==='sleep'?'stop-sleep':'stop';S.confirmStop=null;S.stopOk=true;try{act(w,'');}finally{S.stopOk=false;}return true;}
  return false;
}
const BUSY_OK=new Set(['undo','swipe-undo']);
// Actions that run one function and return its result. A table keeps act() under the complexity limit.
const CALL_ACTS={
  'ask-ai':()=>openChat(),
  'chat-back':()=>closeChat(),
  'ai-retry':arg=>submitChat(+arg),
  'delete-entry':(arg,s)=>deleteEntry(s),
  undo:()=>saveUndo(),
  confirm:(arg,s)=>confirmTimer(s),
  'portrait-save':()=>submitPortrait(),
  'care-refresh':()=>refreshCare(),
  'care-confirm':()=>confirmCare(),
  'care-toggle':()=>toggleCareSharing(),
  'care-revoke':arg=>revokeCare(arg),
};
// The fact card's own actions. True when this action was one of them.
function factAction(a,arg){
  if(a==='fact-next'||a==='fact-previous'){moveFact(a==='fact-next'?1:-1);return true;}
  if(a==='fact-log'&&validDate(arg)){
    const day=Math.min(0,isoDay(arg));
    S.day=day;S.tab='log';S.search='';S.filter='all';render();
    const reveal=()=>{if(S.tab==='log'&&S.day===day)$(`[data-day="${day}"]`)?.scrollIntoView({block:'start'});};
    reveal();void loadDayRange(day-1,day,true).then(reveal);
    return true;
  }
  return false;
}
function act(a,arg){if(a.startsWith('cry-')&&LittleDaysCryUI.handle(a,arg))return;const s=S.sheet;if(S.busy&&!BUSY_OK.has(a))return;
  if((a.startsWith('open-')||a==='quick')&&!S.retryAction&&!Object.keys(S.pendingOps||{}).length)S.message='';
  if(a==='quick'&&arg==='solids')queueMicrotask(()=>loadFoods());
  if(stopGate(a)||feedbackAction(a,arg)||factAction(a,arg))return;
  if(Object.hasOwn(CALL_ACTS,a))return CALL_ACTS[a](arg,s);
  if(a==='pick-photo'){document.querySelector('[data-sheet] [data-fid="photo"]')?.click();return;}
  if(a==='retry-write'&&S.retryAction)return S.retryAction();
  if(Object.hasOwn(TIMER_ACTS,a))return TIMER_ACTS[a](arg,s);
  if(a==='dtype'&&s?.kind==='diaper')return saveDiaper(arg);
  if(s&&['vu','tu','wu','lu','hu','milk','dtype','tex','col','nap','dwho','completed','reminderEnabled','mname','mdose','mnext','editReminder','editNap','editCompleted','remove-photo'].includes(a))s.dirty=true;
  if(!formAction(a)&&!sheetAction(a,arg)&&!feedAction(a,arg)&&!viewAction(a,arg))return;
  if (S.sheet && S.toast && !S.toast.pending && a!=='undo') { clearTimeout(toastTimer); S.toast = null; }
  render();if(a==='shortcut')requestAnimationFrame(()=>document.querySelector('.app')?.scrollIntoView({block:'start'}));
}

/* ---------- render ---------- */
// Dim theme: the rules live in theme.js, which also sets the theme before the first paint.
const themeMode=()=>LittleDaysTheme.mode(),dimOn=()=>LittleDaysTheme.dimOn();
function setThemeMode(m){LittleDaysTheme.set(m);syncTheme();}
function syncTheme(){LittleDaysTheme.apply();}
const $ = q => document.querySelector(q);
// The stop confirm (round 3): a small sheet at the bottom over the running screen, with the live Stop and a way back.
function confirmStopHTML(){
  const w=S.confirmStop;if(!w)return '';
  const feed=w==='feed',r=feed?S.run:S.sleepRun;
  const sub=feed?t('confirmFeedSub',sideWord(r?.side),r?runClock(timerElapsed(r)):''):t('asleepFor',r?durText(timerElapsed(r)):'');
  return `<div class="overlay"><section class="confirm" key="stop:${esc(w)}:${esc(r?.id||'')}" role="dialog" aria-modal="true" aria-labelledby="c-title"><h2 id="c-title">${feed?t('stopThisFeed'):t('stopThisSleep')}</h2><p class="sub">${sub}</p><div class="actions"><button type="button" class="btn-primary" data-act="stop-go">${feed?t('stopFeed'):t('stopSleep')}</button><button type="button" class="back" data-act="stop-keep">${feed?t('keepFeeding'):t('keepSleeping')}</button></div></section></div>`;
}
// A form just closed: the click guard (see the click handler) holds the pinned Stop bar still for 400 ms.
// The Stop question belongs to the sheet and tab it was asked on, and to a timer that still runs. Anything else (a form opens or closes, the tab changes, the timer ended elsewhere) removes it, so it never shows over something new.
function settleConfirmStop(){const c=S.confirmStop,a=S.confirmAt;if(c&&((a&&(a.sheet!==S.sheet||a.tab!==S.tab))||!(c==='feed'?S.run:S.sleepRun)))S.confirmStop=null;}
function markFormClosed(){if(!S.sheet&&S.hadSheet)S.overlayClosedAt=performance.now();S.hadSheet=!!S.sheet;}
function appHTML() {
  if(S.tab==='chat'&&!LittleDaysAPI.ai)S.tab='home';
  markFormClosed();settlePhotoBusy();settleConfirmStop();syncSwipeDelete();
  const sh=S.sheet?(S.sheet.kind==='cancelSleep'?cancelSleepSheet(S.sheet):SHEETS[S.sheet.kind](S.sheet)):'',toast=toastHTML();
  // The Crying screens and their questions sit on top of the app like a form (cry-ui.js).
  const cry=LittleDaysCryUI.layerHTML(),cryOpen=LittleDaysCryUI.open();
  const cls=(S.night?'app phone night':'app phone')+(S.sheet&&S.sheet.kind!=='discard'&&S.sheet.kind!=='confirm'||cryOpen?' form-open':'');
  const titles={log:'tabLog',charts:'tabCharts',photos:'tabPhotos',chat:'askAI'};
  // Every screen but Home has the same title bar. Ask keeps its own Home action (it puts focus back on the Ask button on Home) and a focusable title.
  const chat=S.tab==='chat',home=chat?'data-act="chat-back"':'data-act="tab" data-arg="home"',h1=chat?' id="chat-title" data-focus="chat-title" tabindex="-1"':'';
  const top=S.tab==='home'?'':`<header class="bar screen-top"><button type="button" class="back" ${home}>${glyph('back')}${t('tabHome')}</button><h1${h1}>${t(titles[S.tab]||'tabHome')}</h1>${S.tab==='log'?tlBarEnd():''}</header>`;
  // The chat scrolls its own thread, so it skips the shared scroll area and the dock.
  const screen=S.tab==='home'?homeHTML():S.tab==='log'?timelineHTML():S.tab==='charts'?chartsHTML():photosHTML();
  const body=S.tab==='chat'?chatHTML():`<div class="scroll" data-scroll>${screen}</div>${S.tab==='home'&&!S.sheet&&!cryOpen?dockHTML():''}`;
  return `<div class="${cls}" lang="${S.lang}"><input id="retry-photo-picker" type="file" accept="image/jpeg,image/png,image/webp" hidden><div class="main" ${S.sheet||S.confirmStop||cryOpen?'inert':''}>${top}${body}</div>${S.confirmStop||LittleDaysCryUI.sheetOpen()?sh.replace('data-sheet','inert data-sheet'):sh}${cry}${toast}${confirmStopHTML()}</div>`;
}
const keyOf = e => e && e.dataset ? (e.dataset.focus ? 'focus|' + e.dataset.focus : e.dataset.act ? e.dataset.act + '|' + (e.dataset.arg || '') : e.dataset.fid ? 'fid|' + e.dataset.fid : '') : '';
// Skip the page behind an open sheet: the Home dock and the Sleep sheet both hold Stop sleep.
const byKey = k => k && [...document.querySelectorAll('[data-act],[data-fid],[data-focus]')].find(e => keyOf(e) === k && !e.closest('[inert]'));
function messageHTML() {
  if(!S.message&&!S.retryAction)return '';
  const uncertain=['pollFailed','unknownSave','saveNotConfirmed','retrySame','photoRetry','reviewConflict'].some(key=>S.message===t(key));
  const failed=!uncertain&&!!S.message&&(S.message===t('saveFailed')||S.message===S.writeError);
  const alert=failed||uncertain;
  const label=failed?t('notSaved'):t('saveNotConfirmed');
  return `<div class="status-message${alert?' save-error':''}" data-status role="${alert?'alert':'status'}">${alert?ic('warn'):''}<div>${alert?`<strong>${label}</strong>`:''}${S.message!==label?`<p>${esc(S.message===W.chooseLoggedBy[0]?t('chooseLoggedBy'):S.message)}</p>`:''}</div>${S.retryAction?`<button type="button" class="btn" data-act="retry-write">${S.retryLabel||t('retry')}</button>`:''}</div>`;
}
let chartDrag = null;
function selectChartDay(date,toggle=false,source=S.chartSource) {
  S.chartDetail=toggle&&S.chartDetail===date&&S.chartSource===source?null:date;S.chartSource=source;
  syncChartSelection();
}
// A tap or a drag on the bars of one chart picks the day under the finger.
function chartDayAt(event,root) {
  const box=root.querySelector('.hit').getBoundingClientRect(), dates=root.querySelector('.hit').dataset.dates.split('|');
  return dates[Math.max(0,Math.min(dates.length-1,Math.floor((event.clientX-box.left)/box.width*dates.length)))];
}
document.addEventListener('pointerdown',event=>{
  const root=event.target.closest?.('.plot[data-select]');
  if(!root||event.button!==0||!event.target.closest('.hit'))return;
  const date=chartDayAt(event,root);if(!date)return;
  chartDrag={root,date,x:event.clientX,y:event.clientY,moved:false};root.setPointerCapture(event.pointerId);
});
document.addEventListener('pointermove',event=>{
  if(!chartDrag)return;
  if(Math.hypot(event.clientX-chartDrag.x,event.clientY-chartDrag.y)>4)chartDrag.moved=true;
  const date=chartDayAt(event,chartDrag.root);
  if(chartDrag.moved&&date){event.preventDefault();selectChartDay(date,false,chartDrag.root.dataset.chart);}
});
function endChartDrag() {
  chartDrag=null;
  if(S.chartDirty&&!S.sheet&&!S.toast)render();
}
document.addEventListener('pointerup',event=>{
  if(!chartDrag)return;
  const root=chartDrag.root, date=chartDayAt(event,root);
  if(date)selectChartDay(date,!chartDrag.moved,root.dataset.chart);
  endChartDrag();
});
document.addEventListener('pointercancel',endChartDrag);
document.addEventListener('lostpointercapture',endChartDrag);
// The arrow keys move the pick from the chart's slider. Enter or Space on the picked day clears it.
document.addEventListener('keydown',event=>{
  const hit=event.target.closest?.('.plot[data-select] .hit');
  if(!hit)return;
  const dates=hit.dataset.dates.split('|'), steps={ArrowLeft:-1,ArrowUp:-1,ArrowRight:1,ArrowDown:1}, index=+hit.dataset.i;
  let next=index;
  if(event.key in steps)next=Math.max(0,Math.min(dates.length-1,index+steps[event.key]));
  else if(event.key==='Home')next=0;
  else if(event.key==='End')next=dates.length-1;
  else if(event.key!=='Enter'&&event.key!==' ')return;
  event.preventDefault();selectChartDay(dates[next],event.key==='Enter'||event.key===' ',hit.closest('.plot').dataset.chart);
});
// Action swipes use Cancel, so drafts, in-flight saves and timers keep the button's behavior.
let formDrag=null,formSwiped=false;
function resetFormDrag(d){
  if(!d.node.isConnected)return;
  const transform=getComputedStyle(d.node).transform;d.node.style.transform='';
  if(factMotion.matches||transform==='none'){d.node.classList.remove('form-dragging');return;}
  const animation=d.node.animate([{transform},{transform:'translateX(0)'}],{duration:160,easing:'cubic-bezier(0.23, 1, 0.32, 1)'});
  animation.onfinish=()=>d.node.classList.remove('form-dragging');
}
document.addEventListener('pointerdown',ev=>{
  formSwiped=false;
  const node=ev.target.closest?.('.formscreen'),cancel=node?.querySelector('[data-act="cancel"]');
  if(!ev.isPrimary||(ev.pointerType==='mouse'&&ev.button!==0)||!cancel||cancel.disabled||S.confirmStop||ev.target.closest('input,textarea,select,button,a,summary,[contenteditable]'))return;
  const transform=getComputedStyle(node).transform,base=transform==='none'?0:new DOMMatrixReadOnly(transform).m41;
  node.getAnimations().forEach(a=>a.cancel());node.style.transform=base?`translateX(${base}px)`:'';
  formDrag={id:ev.pointerId,x:ev.clientX,y:ev.clientY,base,node,sheet:S.sheet,on:false};
});
document.addEventListener('pointermove',ev=>{
  const d=formDrag;if(!d||ev.pointerId!==d.id)return;
  if(!d.node.isConnected||d.sheet!==S.sheet){formDrag=null;return;}
  const dx=ev.clientX-d.x,dy=ev.clientY-d.y;
  if(!d.on){
    if(Math.abs(dy)>Math.max(10,Math.abs(dx))||dx>10){formDrag=null;resetFormDrag(d);return;}
    if(dx>=-10||Math.abs(dx)<=Math.abs(dy))return;
    d.on=true;d.node.classList.add('form-dragging');d.node.setPointerCapture(ev.pointerId);
  }
  ev.preventDefault();d.node.style.transform=`translateX(${Math.min(0,d.base+dx)}px)`;
},{passive:false});
function endFormDrag(ev,cancelled){
  const d=formDrag;if(!d||ev.pointerId!==d.id)return;formDrag=null;
  if(!d.node.isConnected||d.sheet!==S.sheet)return;
  if(d.on)formSwiped=true;
  const cancel=d.node.querySelector('[data-act="cancel"]');
  if(d.on&&!cancelled&&!cancel?.disabled&&swipeDirection(ev.clientX-d.x,ev.clientY-d.y)===1){act('cancel');if(!d.node.isConnected)return;}
  resetFormDrag(d);
}
document.addEventListener('pointerup',ev=>endFormDrag(ev,false));
document.addEventListener('pointercancel',ev=>endFormDrag(ev,true));
document.addEventListener('lostpointercapture',ev=>{if(ev.target===formDrag?.node)endFormDrag(ev,true);});
document.addEventListener('click',ev=>{if(formSwiped){formSwiped=false;ev.preventDefault();ev.stopImmediatePropagation();}},true);
document.addEventListener('keydown',()=>{formSwiped=false;},true);
let lastSheetKind = null, lastConfirm = false, keyboardInput = false;
document.addEventListener('keydown',()=>{keyboardInput=true;},true);
document.addEventListener('pointerdown',()=>{keyboardInput=false;},true);
// The Stop confirm is not a sheet, so it keeps its own opener: the button last clicked when the question opened (the Home bar or the Stop in the running form).
function returnToStopButton(){const o=S.stopOpener&&byKey(S.stopOpener);S.stopOpener=null;if(o)o.focus({preventScroll:true});return !!o;}
// Keep Tab and Shift+Tab inside the elements the selector finds (the open sheet, or the Stop confirm above it).
function trapTab(ev,selector){
  const f=[...document.querySelectorAll(selector)].filter(el=>el.getClientRects().length);
  if(!f.length)return;
  const i=f.indexOf(document.activeElement);
  if(ev.shiftKey&&i<=0){ev.preventDefault();f[f.length-1].focus();}
  else if(!ev.shiftKey&&(i===f.length-1||i<0)){ev.preventDefault();f[0].focus();}
}
// A redraw (for example, another phone's record) keeps the text and caret of the field being typed in,
// and does not select it the way a tap does.
let refocusing = false;
const typedField = el => el?.matches?.('input[type="text"],textarea') ? {value: el.value, start: el.selectionStart, end: el.selectionEnd, dir: el.selectionDirection} : null;
function refocus(key, typed) {
  const el = byKey(key); if (!el) return;
  refocusing = true; el.focus({preventScroll: true}); refocusing = false;
  if (typed && el.matches('input[type="text"],textarea')) { el.value = typed.value; el.setSelectionRange(typed.start, typed.end, typed.dir); }
}
// The phone's photo picker belongs to one file input. A redraw that swaps in a new input would send the chosen photo to a
// node that is no longer on the page, so the input with the picker open moves into the new screen instead.
function keepOpenPickers(open){for(const old of open){const next=[...document.querySelectorAll('#stage input[type=file]')].find(el=>el.id===old.id&&el.dataset.fid===old.dataset.fid);if(next)next.replaceWith(old);}}
document.addEventListener('click',ev=>{if(ev.target?.type==='file')ev.target._picking=true;},true);
document.addEventListener('cancel',ev=>{if(ev.target?.type==='file')S.overlayClosedAt=performance.now();},true);
function render() {
  LittleDaysCryUI.checkOwner();  // each sign-in, switch and sign-out stops the last adult's cry queues and recordings
  queueMicrotask(syncFactCarousel);
  if(chartDrag){S.chartDirty=true;return;}
  if(factSwipe&&S.auth==='ready'&&S.tab==='home'){factRedraw='full';return;}
  factRedraw=false;
  if(S.tab==='home')S.homeRenderedMinute=`${todayISO()}:${nowM()}`;
  const hadApp=!!$('#stage .main'), previousEntrances=new Set([...document.querySelectorAll('.bsheet,.overlay .confirm,.toast')].map(el=>el.getAttribute('key')));
  LittleDaysBunny.release();
  syncTheme();
  const key = keyOf(document.activeElement), typed = typedField(document.activeElement);
  const sc = $('[data-scroll]'), st = sc ? sc.scrollTop : 0, sb = $('.sh-body,.formscreen'), sbt = sb ? sb.scrollTop : 0, hadSheet = !!sb;
  const tableScroll=[...document.querySelectorAll('[data-chart-numbers]')].map(el=>({kind:el.dataset.chartNumbers,open:el.open,left:el.querySelector('.chart-table-scroll').scrollLeft}));
  const status=$('#shell-status');if(status){status.innerHTML=S.sheet||S.auth==='login'||S.auth==='error'?'':messageHTML();status.className=status.innerHTML?'shell-status':'';}
  if(S.auth==='loading'){ document.documentElement.lang=S.lang; $('#stage').innerHTML=`<div class="shell-card loading" role="status">${t('loading')}</div>`; return; }
  if(S.auth==='error'){ document.documentElement.lang=S.lang; $('#stage').innerHTML=`<div class="shell-card"><h1>${t('connectionError')}</h1><p class="shell-error" role="alert">${ic('warn')}${esc(S.message||t('tryAgain'))}</p><button class="btn solid" type="button" data-shell="retry">${t('retry')}</button></div>`; return; }
  if(S.auth==='login'){ document.documentElement.lang=S.lang; $('#stage').innerHTML=loginHTML(); return; }
  if(S.auth==='setup'){ document.documentElement.lang=S.lang; $('#stage').innerHTML=childSetupHTML(); return; }
  document.documentElement.lang=S.lang;const openPickers=[...document.querySelectorAll('#stage input[type=file]')].filter(el=>el._picking);$('#stage').innerHTML=appHTML();keepOpenPickers(openPickers);
  drawCharts();
  for(const saved of tableScroll){const el=document.querySelector(`[data-chart-numbers="${saved.kind}"]`);if(el){el.open=saved.open;el.querySelector('.chart-table-scroll').scrollLeft=saved.left;}}
  const sc2 = $('[data-scroll]'); if (sc2) sc2.scrollTop = st;
  LittleDaysBunny.scan();
  const sb2 = $('.sh-body,.formscreen'); if (sb2 && hadSheet) sb2.scrollTop = sbt;
  if(S.busy||S.pendingSheetOperation){document.querySelectorAll('[data-sheet] input,[data-sheet] select,[data-sheet] textarea,[data-sheet] button').forEach(el=>{if(!S.busy&&!hasUnresolvedSheet(S.sheet)&&el.matches('[data-act="delete-entry"]')||el.closest('.settings-card')||el.matches('[data-act="retry-write"]')||el.matches('.portrait-file')&&portraitOpen()&&!S.pendingSheetOperation)return;const retrying=S.retrySame&&(S.retrySame===S.sheet||S.sheet?.kind==='discard'&&S.sheet.draft===S.retrySame),retrySave=retrying&&el.matches('[data-act="save"]'),discardControl=retrying&&['cancel','keep','discard'].includes(el.dataset.act);if(!retrySave&&!discardControl&&!el.matches('[data-act="undo"]'))el.disabled=true;});}
  const kind = S.sheet ? S.sheet.kind : null;
  if (kind && kind !== lastSheetKind) { const c = $('[data-sheet] [data-act="cancel"]') || $('[data-sheet] button:not([disabled])'); if (c) c.focus({preventScroll: true}); }   // a new sheet starts on Cancel; a confirm with no Cancel starts on its first button
  else if (!kind && lastSheetKind && S.opener) { const o = byKey(S.opener); S.opener = null; if (o) o.focus({preventScroll: true}); }  // closing returns to the button that opened it
  else if (lastConfirm && !S.confirmStop && returnToStopButton()) { /* the Stop confirm closed: focus is back on the Stop button that asked */ }
  else refocus(key, key==='fid|ai-question'&&typed?.value!==S.chat.draft?null:typed);
  if(S.tab==='chat')fitChatField();
  lastSheetKind = kind;
  lastConfirm = !!S.confirmStop;
  startWaitingPortrait();  // every request ends with a render, so a waiting portrait pick starts as soon as nothing else runs
  // A redraw of the same notice or question settles immediately; only a new one enters.
  if(hadApp&&!keyboardInput&&!factMotion.matches&&!document.hidden){
    for(const el of document.querySelectorAll('.bsheet,.overlay .confirm,.toast')){
      if(previousEntrances.has(el.getAttribute('key')))continue;
      const toast=el.matches('.toast'),base=toast?'translateX(-50%) ':'';
      const animation=el.animate([{opacity:0,transform:`${base}translateY(8px)${toast?'':' scale(.97)'}`},{opacity:1,transform:`${base}translateY(0)${toast?'':' scale(1)'}`}],{duration:toast?140:180,easing:'cubic-bezier(0.23, 1, 0.32, 1)'});
      animation.id='ui-enter';
    }
  }
}
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'scrim') { if (ev.target === b) act('cancel'); return; }
  if (b.getAttribute('aria-disabled') === 'true') return;
  // The form's Save sits over the top of the pinned Stop bar. A second tap on Save, or the tap that closes a picker, must not press Stop under it. Resume sleep and Finish bottle are safe to press and act at once.
  if (b.closest('.dock:not(.in-sheet)') && ['stop','stop-sleep'].includes(b.dataset.act) && performance.now() - (S.overlayClosedAt ?? -1e9) < 400) return;
  if (!S.sheet) S.opener = keyOf(b);
  S.lastClick = keyOf(b);
  act(b.dataset.act, b.dataset.arg);
});
async function retrySelectedPhoto(file){const retry=S.photoRetry;if(!retry||!file)return;file=await preparePhoto(file);if(!file)return;const problem=photoProblem(file);if(problem){S.message=photoErrorText(problem);render();return;}const owner={_operationId:retry.operationId,_preparedEvents:retry.event?[retry.event]:[]},context={operationOwner:owner,undoable:false,toast:false,retry:()=>document.querySelector('#retry-photo-picker')?.click()};S.busy=true;S.pendingSheetOperation=null;S.message=t('saving');render();try{const result=retry.portrait?await LittleDaysAPI.writes.savePortrait(file,retry.operationId):await LittleDaysAPI.writes.savePhoto(retry.event,file,retry.operationId);await acceptWrite(result,()=>retry.portrait?t('portraitSaved'):t('savedItem',t('note')),context);if(result.status==='saved')S.photoRetry=null;}catch(error){await recoverWrite(error,()=>t('savedItem',t('note')),context);}finally{S.busy=false;render();}}
async function readPhoto(target){const picked=target.files?.[0],id=target.dataset.fid;S.overlayClosedAt=performance.now();target._picking=false;if(target.id!=='retry-photo-picker')target.value='';if(target.id==='retry-photo-picker'){void retrySelectedPhoto(picked);target.value='';return;}if(!picked||id==='portrait'&&!resourceAllowed('children','change'))return;const draft=S.sheet,f=await preparePhoto(picked);if(!f)return;const problem=photoProblem(f);if(problem){if(id==='portrait')S.portraitError=problem;else if(S.sheet)S.sheet.photoError=problem;requestAnimationFrame(render);return;}
  let preview;try{preview=URL.createObjectURL(f);}catch(_){if(id==='portrait')S.portraitError=true;else if(S.sheet===draft)draft.photoError=true;requestAnimationFrame(render);return;}
  if(id==='portrait'){S.portraitDraft={file:f,url:preview,name:f.name};S.portraitError=false;requestAnimationFrame(render);void submitPortrait();return;}
  if(S.sheet!==draft){URL.revokeObjectURL(preview);return;}if(draft.photo?.startsWith?.('blob:'))URL.revokeObjectURL(draft.photo);draft.photo=preview;draft.photoFile=f;draft.photoName=f.name;draft.photoRemoved=false;draft.photoError=false;draft.dirty=true;requestAnimationFrame(render);
}
const SAVE_VALIDATORS={
  split:validSplit,
  correction:validCorrection,
  feed:s=>s.early==='switch'?!earlyHint(s)&&(S.run?.side!=='bottle'||bottleAmountOk(s)):s.tab==='pump'?s.pL+s.pR>0&&pumpTimeOk(s):s.tab==='bottle'?bottleOk(s):s.tab==='breast'&&s.manual?!!s.manualSide&&validDurationRange(s,'manualDate','hour','minute','period','manualDuration'):true,
  sleep:s=>s.early==='sleep'?!earlyHint(s):!s.manual?s.nap!==null&&!(s.early==='start'&&earlyHint(s)):s.nap!==null&&validDurationRange(s,'manualDate','hour','minute','period','manualDuration'),
  note:s=>(!!s.text?.trim()||!!s.photo)&&pointTimeOk(s),
  diaper:s=>!!s.type&&pointTimeOk(s),
  appointment:s=>!!s.title?.trim()&&validEventDateTime(s)&&startMinutes(s.date,s.hour,s.minute,s.period)>nowM(),
  visit:s=>!!(s.provider||s.reason||s.observations||s.instructions||s.weightKg!==''||s.lengthCm!==''||s.headCm!=='')&&validEventDateTime(s)&&startMinutes(s.date,s.hour,s.minute,s.period)<=nowM(),
  med:s=>!!s.name?.trim()&&positive(s.dose)&&['mg','ml','tablets','drops'].includes(s.unit)&&validEventDateTime(s),
  temp:s=>validNumber(s.temperature)&&Number.isFinite(s.c)&&s.c>=0&&validEventDateTime(s),
  growth:s=>[s.weight,s.length,s.head].some(positive)&&[s.weight,s.length,s.head].every(v=>v===''||positive(v))&&growthDateOk(s),
  quick:s=>s.what==='solids'?!!s.food?.trim()&&(!s.amount||validNumber(s.amount))&&pointTimeOk(s):s.what==='tummy'||s.what==='bath'?s.completed?validPointTime(s,'manualDate','hour','minute','period'):validDurationRange(s,'manualDate','hour','minute','period','duration'):!!s.moment?.trim()&&pointTimeOk(s),
  handoff:s=>!!s.text?.trim(),
  reminder:s=>!!s.enabled&&validEventDateTime(s),
  edit:s=>validEdit([...S.entries,...S.upcomingAppointments].find(e=>e.id===s.id),s)
};
function hasUnresolvedSheet(sheet){return Object.values(S.pendingOps||{}).some(op=>op.context?.sheet===sheet);}
function updateSaveState(s){const yes=(SAVE_VALIDATORS[s.kind]?.(s)??true)&&!S.busy&&!S.photoBusy&&(!S.pendingSheetOperation||S.retrySame===s)&&(!hasUnresolvedSheet(s)||S.retrySame===s),b=$('.sh-foot [data-act="save"]');if(b){const on=yes||b.hasAttribute('data-always');b.disabled=!on;if(on)b.removeAttribute('aria-disabled');else b.setAttribute('aria-disabled','true');}const h=$('[data-save-hint]');if(h&&(b||s.kind==='diaper')&&!b?.hasAttribute('data-always')){const msg=saveHint(s);h.hidden=!msg;h.textContent=msg;}const err=$('[data-range-err]');if(err)err.hidden=!rangeLate(s);const correctionError=document.querySelector('[data-correction-error]');if(correctionError){correctionError.hidden=validCorrection(s);correctionError.textContent=correctionHint(s);}document.querySelectorAll('[data-sheet] .sleep-start').forEach(button=>{button.disabled=!yes;});if(S.run?.side==='bottle')document.querySelectorAll('[data-sheet] [data-act="switch"],[data-sheet] [data-act="stop"]').forEach(button=>{button.disabled=!bottleAmountOk(s)||S.busy||!!S.pendingSheetOperation||hasUnresolvedSheet(s);});const eh=$('[data-early-hint]');if(eh){const msg=earlyHint(s);eh.hidden=!msg;eh.textContent=msg;}}
function updateInput(id,value){if(id==='valueCol'){const w=$('[data-col-warn]');if(w)w.innerHTML=colWarn(value);}
  const map={appointmentTitle:'title',appointmentProvider:'provider',appointmentLocation:'location',appointmentDate:'date',appointmentNote:'note',visitProvider:'provider',visitReason:'reason',visitDate:'date',visitObservations:'observations',visitInstructions:'instructions',visitWeight:'weightKg',visitLength:'lengthCm',visitHead:'headCm',visitFollowUp:'followUpDate',editAppointmentTitle:'valueTitle',editAppointmentProvider:'valueProvider',editAppointmentLocation:'valueLocation',editObservations:'valueObservations',editInstructions:'valueInstructions',editVisitProvider:'valueProvider',editVisitReason:'valueReason',editWeightKg:'valueWeightKg',editLengthCm:'valueLengthCm',editHeadCm:'valueHeadCm',editFollowUp:'valueFollowUp',eventNote:'note',manualDate:'manualDate',manualDuration:'manualDuration',note:'text',text:'text',food:'food',amount:'amount',editFood:'valueFood',editAmount:'valueAmount',editDuration:'valueDur',duration:'duration',moment:'moment',name:'name',dose:'dose',unit:'unit',next:'next',medDate:'date',tempDate:'date',temperature:'temperature',weight:'weight',length:'length',head:'head',recipient:'recipient',remindDay:'date',remindWhat:'what',reminderDate:'valueDate',tempNote:'tempNote',medNote:'note',editDay:'editDate',editNote:'editNote',editTitle:'editTitle',editRecipient:'valueRecipient',editWhat:'valueWhat',photo:'photo',valueDur:'valueDur',valueMl:'valueMl',valueLeftMl:'valueLeftMl',valueRightMl:'valueRightMl',valueTex:'valueTex',valueCol:'valueCol',valueName:'valueName',valueDose:'valueDose',valueUnit:'valueUnit',valueTemp:'valueTemp',valueKg:'valueKg',valueCm:'valueCm',valueHead:'valueHead',correctDate:'date',careStart:'careStart',careEnd:'careEnd'};const cm={appointmentHour:'hour',appointmentMinute:'minute',appointmentPeriod:'period',visitHour:'hour',visitMinute:'minute',visitPeriod:'period',medHour:'hour',medMinute:'minute',medPeriod:'period',earlyHour:'earlyHour',earlyMinute:'earlyMinute',earlyPeriod:'earlyPeriod',manualHour:'hour',manualMinute:'minute',manualPeriod:'period',manualEndHour:'endHour',manualEndMinute:'endMinute',manualEndPeriod:'endPeriod',editEndHour:'valueEndHour',editEndMinute:'valueEndMinute',editEndPeriod:'valueEndPeriod',remindHour:'hour',remindMinute:'minute',remindPeriod:'period',reminderEditHour:'valueHour',reminderEditMinute:'valueMinute',reminderEditPeriod:'valuePeriod',editHour:'hh',editMinute:'mm',editPeriod:'period',tempHour:'hour',tempMinute:'minute',tempPeriod:'period',correctHour:'hour',correctMinute:'minute',correctPeriod:'period'};S.sheet[cm[id]||map[id]||id]=value;
  // Fields update in place: a full render while typing would steal focus after the first digit.
  // Until a date or time is typed, an untouched range saves at the time of the tap.
  if(/Clock$/.test(id))readClock(id.slice(0,-5),value,{...cm,wokeHour:'wokeHour',wokeMinute:'wokeMinute',wokePeriod:'wokePeriod',sleptHour:'sleptHour',sleptMinute:'sleptMinute',sleptPeriod:'sleptPeriod'});
  if(['ml','pL','pR'].includes(id)){S.sheet[id]=typedMl(value,S.sheet.vu);S.sheet[id+'Text']=value;}
  if(['manualDate','manualClock','manualPeriod','manualEndClock','manualEndPeriod'].includes(id))S.sheet.timeEdited=true;
  if(id==='manualDate')S.sheet.dayEdited=true;
  syncRange(id);
  document.querySelectorAll('[data-act="clock-period"]').forEach(button=>{const [prefix,period]=button.dataset.arg.split(':');button.setAttribute('aria-pressed',String(S.sheet[CLOCK_KEYS[prefix][2]]===period));});
  if(/^care(Start|End)(Date|Clock|Period)$/.test(id))updateCareClock(id);
  if(id==='temperature')S.sheet.c=validNumber(value)?(S.sheet.tu==='F'?f2c(+value):+value):null;if(S.sheet.kind==='care'){const button=$('[data-act=care-confirm]');if(button)button.disabled=S.careLoading||!S.sheet.careStart||!S.sheet.careEnd;}
  // Saving a timer's start does not save the form's note or pump amounts.
  if(/^early(Clock|Period)$/.test(id)&&['feed','sleep','pump'].includes(S.sheet.early))S.sheet.startDirty=true;else S.sheet.dirty=true;updateSaveState(S.sheet);}
// The question field tracks `input` only: a `change` fires when a redraw removes the focused field and would put a sent question back.
function handleInput(ev){const id=ev.target.dataset?.fid;if(!id||ev.target.type==='file')return;const value=ev.target.value;if(id==='ai-question'){if(ev.type==='change')return;S.chat.draft=value;const send=$('[data-ai-send]');if(send){send.hidden=!value.trim();send.disabled=!S.chat.available||S.chat.loading||!value.trim();}fitChatField();return;}if(id==='search'||id==='filter'){if(id==='search')S.search=value;else S.filter=value;const start=id==='search'?ev.target.selectionStart:null,end=id==='search'?ev.target.selectionEnd:null;requestAnimationFrame(()=>{render();if(id==='search'){const input=$('[data-fid=search]');input?.focus({preventScroll:true});if(input&&start!==null)input.setSelectionRange(start,end);}});return;}if(S.sheet)updateInput(id,value);}
document.addEventListener('toggle',ev=>{
  if(!ev.target.isConnected)return;
  if(ev.target.matches('details[data-feed-adjust]')&&S.sheet?.kind==='feed')S.sheet.feedAdjustOpen=ev.target.open;
  if(ev.target.matches('details[data-more-details]')&&S.sheet)S.sheet.detailsOpen=ev.target.open;
  if(ev.target.matches('details[data-chart-numbers]')){S.chartNumbers||={};S.chartNumbers[ev.target.dataset.chartNumbers]=ev.target.open;}
  if(ev.target.matches('details[data-chat-sources]')){const turn=S.chat.messages[+ev.target.dataset.chatSources];if(turn)turn.open=ev.target.open;}
},true);
document.addEventListener('input',ev=>{const input=ev.target;if(input.matches?.('[data-clock-numeric]')&&!ev.inputType?.startsWith('delete')&&/^\d{1,2}:?\d{2,3}$/.test(input.value)){const digits=input.value.replace(':','');if(digits.length<=4){const before=input.value.slice(0,input.selectionStart).replace(':','').length;input.value=digits.slice(0,-2)+':'+digits.slice(-2);const caret=before+(before>digits.length-2?1:0);input.setSelectionRange(caret,caret);}}handleInput(ev);});
// Enter sends the question and Shift+Enter starts a new line, as in a chat app.
document.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&!ev.shiftKey&&!ev.isComposing&&ev.target.id==='ai-question'){ev.preventDefault();ev.target.form.requestSubmit();}});
document.addEventListener('change',ev=>{if(ev.target.type==='file'){readPhoto(ev.target);return;}const c=ev.target.matches?.('[data-clock]')&&parseClock(ev.target.value),withPeriod=ev.target.hasAttribute?.('data-clock-text');if(c&&!withPeriod)ev.target.value=`${c.hh}:${c.mm}`;handleInput(ev);if(c&&withPeriod&&S.sheet){const k=CLOCK_KEYS[ev.target.dataset.fid.slice(0,-5)];if(k)ev.target.value=clockText(S.sheet[k[0]],S.sheet[k[1]],S.sheet[k[2]]);}});
// A tap on a typed time or amount selects it, so the first digit replaces the old value.
// select() also moves focus in Chrome, so a field that lost focus within the frame must not take it back.
document.addEventListener('focusin',ev=>{if(S.sheet&&ev.target.matches?.('[data-fid="pL"],[data-fid="pR"]'))S.sheet.pumpFocus=ev.target.dataset.fid.slice(1);if(!refocusing&&ev.target.matches?.('[data-clock],[data-amount]'))requestAnimationFrame(()=>{if(document.activeElement===ev.target)ev.target.select();});});
document.addEventListener('keydown', ev => {
  if(!S.sheet&&ev.target?.getAttribute('role')==='button'&&ev.target.dataset?.act&&(ev.key==='Enter'||ev.key===' ')){ev.preventDefault();act(ev.target.dataset.act,ev.target.dataset.arg);return;}
  if(S.confirmStop){if(ev.key==='Escape'){ev.preventDefault();act('stop-keep');}else if(ev.key==='Tab')trapTab(ev,'.overlay .confirm button:not([disabled])');return;}
  if (!S.sheet) return;
  if (ev.key === 'Escape') { act('cancel'); return; }
  if (ev.key !== 'Tab') return;  // keep Tab inside the open sheet
  trapTab(ev,'[data-sheet] button:not([disabled]), [data-sheet] input:not([disabled]), [data-sheet] select:not([disabled]), [data-sheet] textarea:not([disabled]), [data-sheet] summary');
});
window.addEventListener('beforeunload',ev=>{if((S.sheet&&hasDraft(S.sheet))||Object.values(S.drafts).some(Boolean)){ev.preventDefault();ev.returnValue='';}});
window.addEventListener('resize',drawCharts);
let refreshingDay=false;
// One poll at a time, and none while the tab is hidden or a save is running. The 15 s timer and the tab coming back to the front both use this.
function pollFamily(){
  if(document.hidden||S.auth!=='ready'||S.busy||refreshingDay)return null;
  refreshingDay=true;return syncFamily().finally(()=>{refreshingDay=false;});
}
function tick() {  // reload shared family state while preserving the open form and filters.
  if(S.auth!=='ready'||document.hidden)return;
  refreshHomeEvidence();LittleDaysCryUI.tick();
  if(pollFamily())return;
  if (!S.sheet && !S.toast && !chartDrag) render();
}
setInterval(tick, 15000);
setInterval(()=>{if(themeMode()==='auto')syncTheme();},30000);
document.addEventListener('visibilitychange',()=>{document.documentElement.toggleAttribute('data-page-hidden',document.hidden);LittleDaysBunny.sync();if(document.visibilityState==='visible'){syncTheme();refreshHomeEvidence();void pollFamily();}});
function updateCountdowns(){if(document.hidden)return;document.querySelectorAll('[data-countdown]').forEach(e=>{const left=Math.max(0,Math.ceil((+e.dataset.countdown-Date.now())/1000));e.textContent=`${left} s`;if(!left&&e.dataset.kind==='undo')render();});}
// With a timer running, the day totals count up when the minute changes. Only their text changes, so a field being typed in keeps its focus.
let totalsMinute=null;
function updateDayTotals(){
  const minute=nowM();
  if(minute===totalsMinute)return;
  totalsMinute=minute;
  if(!S.run&&!S.sleepRun)return;
  updateTimelineTotals();
}
function updateTimerDisplays(){if(document.hidden)return;updateDayTotals();document.querySelectorAll('[data-live="run"]').forEach(e=>{if(S.run)e.textContent=mmss(timerElapsed(S.run));});document.querySelectorAll('[data-live="runclock"]').forEach(e=>{if(S.run)e.textContent=runClock(timerElapsed(S.run));});document.querySelectorAll('[data-live="sleep"]').forEach(e=>{if(S.sleepRun)e.textContent=mmss(timerElapsed(S.sleepRun));});document.querySelectorAll('[data-live="pump"]').forEach(e=>{if(S.pumpRun)e.textContent=mmss(timerElapsed(S.pumpRun));});}
setInterval(updateTimerDisplays,1000);
setInterval(updateCountdowns,250);
syncTheme(); boot();
