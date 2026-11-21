(() => {
  let csrf = '';
  let sessionMe = null;
  let labels = {};
  let careLink = false;
  let ai = false;
  const headers = () => csrf ? {'X-CSRF-Token': csrf} : {};
  // Reply order: one counter numbers each state request when it starts and notes how many write results the page had applied by then.
  // The page compares both numbers when the reply arrives (applyServerData in app.js).
  let replySeq = 0, writesApplied = 0;
  const tickets = new WeakMap();
  // A request that does not answer in time ends as a timeout. A write that times out takes the page's "Save not confirmed" path.
  const REQUEST_LIMIT_MS = 30000, PHOTO_LIMIT_MS = 120000;
  // Safari rejects a timed-out fetch with AbortError; the signal's reason still names the timeout.
  const isTimeout = (error, signal) => error?.name === 'TimeoutError' || signal?.reason?.name === 'TimeoutError';
  const timedOut = (error, signal) => isTimeout(error, signal) ? Object.assign(new Error('The server did not answer in time.'), {code: 'timeout'}) : error;
  async function request(path, options = {}) {
    const method=options.method||'GET', signal=options.signal||AbortSignal.timeout(REQUEST_LIMIT_MS);
    let response;
    try {
      response = await fetch(path, {
        credentials: 'same-origin',
        ...options,
        signal,
        headers: {...(['GET','HEAD','OPTIONS'].includes(method.toUpperCase())?{}:headers()), ...(options.headers || {})},
      });
    } catch (error) { throw timedOut(error, signal); }
    let body = {};
    try { body = await response.json(); } catch (error) {
      // Only an error reply may lack a JSON body. A 2xx reply that stalls or is cut off must not read as an empty state.
      if (isTimeout(error, signal)) throw timedOut(error, signal);
      if (response.ok) throw new Error('The server could not complete this request.');
    }
    if (!response.ok) {
      const error = new Error(body.error || (response.status === 401 ? 'Sign in is required.' : 'The server could not complete this request.'));
      error.status = response.status;
      // A sleep overlap names the saved sleeps it crosses, so the page can word it in the adult's language.
      if (body.code === 'sleep_overlap' && Array.isArray(body.conflicts)) Object.assign(error, {code: body.code, conflicts: body.conflicts});
      throw error;
    }
    return body;
  }
  // The Crying button. Each call answers {status, body} and never throws for an error reply: the cry queue
  // (cry.js) and the screens judge the status. A network failure or a timeout rejects.
  async function cryCall(path, options = {}) {
    const method = options.method || 'GET';
    const response = await fetch(path, {
      credentials: 'same-origin', ...options, signal: AbortSignal.timeout(REQUEST_LIMIT_MS),
      headers: {...(method === 'GET' ? {} : headers()), ...(options.headers || {})},
    });
    const json = (response.headers.get('content-type') || '').includes('json');
    const body = json ? await response.json().catch(() => undefined) : undefined;
    // A 2xx reply with no JSON or a cut-off body is a lost reply: it rejects like a network failure, so the caller tries again.
    if (response.ok && body === undefined) throw new Error('The reply was cut off.');
    return {status: response.status, body: body ?? null};
  }
  // keepalive: the no-clip reason of the method fixes leaves also when the page hides.
  const cryJson = (path, method, payload, keepalive = false) => cryCall(path, {method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload), ...(keepalive ? {keepalive: true} : {})});
  const cryPath = id => `/api/cries/${encodeURIComponent(id)}`;
  const cries = {
    home: () => cryCall('/api/cries?home=1'),
    list: () => cryCall('/api/cries'),
    passages: () => cryCall('/api/care-passages'),
    create: body => cryJson('/api/cries', 'POST', body),
    clip: (id, wav, capture) => cryCall(`${cryPath(id)}/clip`, {method: 'PUT', headers: {'Content-Type': 'audio/wav', 'x-cry-capture': capture}, body: wav}),
    patch: (id, change, keepalive) => cryJson(cryPath(id), 'PATCH', change, keepalive),
    sound: sound => cryJson('/api/cries/sound', 'PUT', {sound}),
    deleteClip: id => cryCall(`${cryPath(id)}/clip`, {method: 'DELETE'}),
    deleteCry: id => cryCall(cryPath(id), {method: 'DELETE'}),
    deleteClips: () => cryCall('/api/cries/clips', {method: 'DELETE'}),
    async clipBytes(id) {
      const response = await fetch(`${cryPath(id)}/clip`, {credentials: 'same-origin', signal: AbortSignal.timeout(REQUEST_LIMIT_MS)});
      if (!response.ok) throw Object.assign(new Error('The clip did not load.'), {status: response.status});
      return new Uint8Array(await response.arrayBuffer());
    },
  };
  const operationId = () => crypto.randomUUID();
  const operationResult = async (body, opId) => {
    const statuses=['saved','pending','finishing','cancelled','failed'];
    if(!statuses.includes(body.status))throw new Error('The server returned an unknown save status. Refresh state before retrying.');
    const terminal=['saved','cancelled','failed'].includes(body.status);
    // The server has already answered for this save, so a failed read of the new state must not turn it into an error.
    return {...body,operationId:body.operationId||opId,confirmed:body.status==='saved',state:body.state||(terminal?await request('/api/state').catch(()=>null):null)};
  };
  const confirmed = async (path, method, payload, existingId, keepalive) => {
    const opId=existingId||operationId();
    try {
      const body = await request(path, {method, keepalive, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...payload,operationId:opId})});  // keepalive: a delete sent as the page closes still goes out
      return await operationResult(body,opId);
    } catch (error) { error.operationId=opId; throw error; }
  };
  const careWrite = async (path, method, payload, existingId) => {
    const opId=existingId||operationId();
    try { return await request(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,operationId:opId})}); }
    catch(error) { error.operationId=opId; throw error; }
  };
  const formMutation = async (path, method, payload, file, existingId) => {
    if (!file) throw new Error('Choose an image under 25 MB.');
    // The app words these in the adult's language from `code`; the English text is the fallback.
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw Object.assign(new Error('Choose a JPEG, PNG, or WebP photo.'), {code: 'photo_type'});
    if (file.size > 25 * 1024 * 1024) throw Object.assign(new Error('Choose an image under 25 MB.'), {code: 'photo_size'});
    const opId=existingId||operationId(),form = new FormData();
    form.append('operationId', opId);
    for (const [key, value] of Object.entries(payload || {})) form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
    form.append('file', file);
    let response;
    const signal = AbortSignal.timeout(PHOTO_LIMIT_MS);
    try { response = await fetch(path, {method, credentials: 'same-origin', headers: headers(), body: form, signal}); }
    catch(error) { const failure = timedOut(error, signal); failure.operationId=opId; throw failure; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(body.error || 'The server could not complete this request.'), {status: response.status,operationId:opId,code:{413:'photo_size',415:'photo_type'}[response.status]});
    try { return await operationResult(body,opId); } catch(error) { error.operationId=opId; throw error; }
  };
  window.LittleDaysAPI = {
    async refreshSession() {
      const body = await request('/api/session');
      csrf = body.csrf || '';
      sessionMe = body.me || null;
      labels = body.labels && typeof body.labels === 'object' ? body.labels : {};
      if (typeof body.tz === 'string') LittleDaysZone.set(body.tz);
      careLink = body.careLink === true;
      ai = body.ai === true;
      return body;
    },
    // The household passcode returns the adult names. It starts no sign-in.
    async unlock(passcode) {
      const body = await request('/api/session/passcode', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({passcode})});
      labels = body.labels && typeof body.labels === 'object' ? body.labels : {};
      return body;
    },
    async login(username, passcode) {
      const body = await request('/api/session', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(passcode === undefined ? {username} : {username, passcode})});
      csrf = body.csrf || '';
      sessionMe = body.me || null;
      return body;
    },
    async state(from, to) {
      const q=from&&to?`?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`:'', ticket={seq:++replySeq,writes:writesApplied};
      const body=await request(`/api/state${q}`);
      if(body&&typeof body==='object')tickets.set(body,ticket);
      return body;
    },
    // The number a state reply got when its request started, or null for a state that came with a write result.
    ticketOf(state) { return tickets.get(state)||null; },
    get writeCount() { return writesApplied; },
    // A write result (or a full reload) was applied: every state request that started before it is out of date. Returns the number it takes.
    writeApplied() { writesApplied++; return {seq:++replySeq,writes:writesApplied}; },
    async growth() { return request('/api/growth'); },
    async foods() { return request('/api/foods'); },
    async aiStatus() { return request('/api/ai/status'); },
    async development() { return request('/api/development',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(60000)}); },
    async chat(payload) { return request('/api/ai/chat', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload), signal:AbortSignal.timeout(30000)}); },
    async care() { return request('/api/care'); },
    async confirmCare(period, opId) { return careWrite('/api/care/confirmations','POST',period,opId); },
    async revokeCare(id, opId) { return careWrite(`/api/care/confirmations/${encodeURIComponent(id)}/revoke`,'POST',{},opId); },
    async setCareOptIn(enabled, opId) { return careWrite('/api/care/export-opt-in','PUT',{enabled},opId); },
    async operation(id) { return request(`/api/operations/${encodeURIComponent(id)}`); },
    async logout() {
      if (!csrf) await this.refreshSession();
      const body = await request('/api/session', {method: 'DELETE'});
      csrf = body.csrf || '';
      sessionMe = null;
      return body;
    },
    async createChild(child, opId) { return confirmed('/api/children', 'POST', child, opId); },
    get me() { return sessionMe; },
    get labels() { return labels; },
    get careLink() { return careLink; },
    // The server turns AI on with a key. With it off the app shows no insight card and no Chat, and sends no AI request.
    get ai() { return ai; },
    cries,
    writes: {
      sleepAction: (id,action,confirmOther,opId,note='') => confirmed(`/api/timers/${encodeURIComponent(id)}/${action}`, 'POST', {confirmOther,note},opId),
      pausedSleep: (action,pauseId,opId,confirmOther=false) => confirmed(`/api/timers/sleep/${action}`, 'POST', {pauseId,confirmOther},opId),
      confirmSleep: id => request(`/api/operations/${encodeURIComponent(id)}/confirm-sleep`, {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(body=>operationResult(body,id)),
      createEntry: (event, opId) => confirmed('/api/events', 'POST', {event},opId),
      updateEntry: (id, event, opId) => confirmed(`/api/events/${encodeURIComponent(id)}`, 'PATCH', {event},opId),
      splitEntry: (id, split, opId) => confirmed(`/api/events/${encodeURIComponent(id)}/split`, 'POST', {split},opId),
      deleteEntry: (id, opId, keepalive) => confirmed(`/api/events/${encodeURIComponent(id)}`, 'DELETE', {},opId,keepalive),
      startTimer: (timer, opId) => confirmed('/api/timers', 'POST', timer,opId),
      changeTimerStart: (id, start, opId) => confirmed(`/api/timers/${encodeURIComponent(id)}/start-time`, 'POST', {start}, opId),
      changeTimerSide: (id, side, opId) => confirmed(`/api/timers/${encodeURIComponent(id)}/side`, 'POST', {side}, opId),
      stopTimer: (id, amounts, confirmOther=false, opId, note='') => confirmed(`/api/timers/${encodeURIComponent(id)}/stop`, 'POST', {amounts,confirmOther,...(note?{note}:{})},opId),
      switchFeed: (id, side, confirmOther=false, opId, note='', at, amounts) => confirmed(`/api/timers/${encodeURIComponent(id)}/switch`, 'POST', {side,confirmOther,amounts,...(note?{note}:{}),...(at?{at}:{})},opId),
      undo: (id, opId) => confirmed(`/api/operations/${encodeURIComponent(id)}/undo`, 'POST', {},opId),
      correctTimer: (id,end) => request(`/api/operations/${encodeURIComponent(id)}/correct`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({end})}).then(body=>operationResult(body,id)),
      savePhoto: (event, file, opId) => formMutation('/api/photos', 'POST', {event}, file,opId),
      savePortrait: (file, opId) => formMutation('/api/child/portrait', 'PUT', {}, file,opId),
      saveReminder: (id, preferences, opId) => id ? confirmed(`/api/reminders/${encodeURIComponent(id)}`, 'PATCH', preferences,opId) : confirmed('/api/reminders', 'POST', preferences,opId),
      savePreferences: (preferences, opId) => confirmed('/api/preferences','PATCH',preferences,opId),
      saveDuty: (who,note,opId) => confirmed('/api/duty','POST',{who,note},opId),
    },
  };
})();
