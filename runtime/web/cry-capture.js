/* Sound capture for the Crying screen.
   One path: getUserMedia -> AudioContext -> AudioWorklet (cry-worklet.js) -> 16 bit WAV. No other library.

   The page calls, from inside the tap handler that asks for sound (the AudioContext must be made there):
     const rec = LittleDaysCry.prepare({onState});   // makes the AudioContext and starts both deadlines
     ... the create request goes to the server ...
     rec.start();                                     // call it when the server reply says sound is on
   rec.result is a promise. It settles once with {ok: true, wav, ...} or {ok: false, reason}.
   rec.stop(cause) ends now and keeps the clip so far: cause 'left' (the parent left the screen, the default) or 'row' (a row tap).
   A kept clip says what ended it in `end`: 'full' (10 s), 'left', 'row' or 'ended' (the microphone track ended).
   rec.cancel(reason) ends now and keeps nothing (the adult changed, the phone locked). A hidden page cancels by itself.
   Reasons of {ok: false}: no-support, no-worklet, late-reply, first-sample-deadline, denied, no-microphone, error, stopped, too-short, hidden,
   cancelled (or the reason given to cancel) and interrupted (the blocks stopped or came late, so the clip would span a gap: a call or a lock). */
globalThis.LittleDaysCry = (() => {
  const MIN_MS = 3000, MAX_MS = 12000, MAX_BYTES = 2 * 1024 * 1024, MIN_RATE = 8000, MAX_RATE = 48000, HEADER = 44, STALL_MS = 2000;
  const SOUND = ['echoCancellation', 'noiseSuppression', 'autoGainControl'];
  const PROBLEMS = {
    'too-big': 'more than 2 MB', 'no-header': 'shorter than the 44 byte header', 'not-wav': 'not the 44 byte header of the app',
    'not-pcm': 'not PCM', channels: 'not 1 channel', bits: 'not 16 bit', rate: 'sample rate outside 8 to 48 kHz',
    'data-length': 'the header length is not the number of bytes that follow', 'whole-samples': 'not a whole number of samples',
    'too-short': 'under 3 s', 'too-long': 'over 12 s',
  };

  // ---- WAV: the writer of the app and the rule check ----

  const ascii = (v, at) => String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3));
  const putAscii = (v, at, text) => { for (let i = 0; i < 4; i++) v.setUint8(at + i, text.charCodeAt(i)); };

  // samples: Float32Array from -1 to 1. Returns the bytes of a 44 byte header and 16 bit PCM, 1 channel.
  function encodeWav(samples, sampleRate) {
    const dataLen = samples.length * 2, bytes = new Uint8Array(HEADER + dataLen), v = new DataView(bytes.buffer);
    putAscii(v, 0, 'RIFF'); v.setUint32(4, 36 + dataLen, true); putAscii(v, 8, 'WAVE');
    putAscii(v, 12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    putAscii(v, 36, 'data'); v.setUint32(40, dataLen, true);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(HEADER + i * 2, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
    }
    return bytes;
  }

  function readHeader(v) {
    return {
      riff: ascii(v, 0), riffSize: v.getUint32(4, true), wave: ascii(v, 8), fmt: ascii(v, 12), fmtSize: v.getUint32(16, true),
      format: v.getUint16(20, true), channels: v.getUint16(22, true), rate: v.getUint32(24, true), byteRate: v.getUint32(28, true),
      align: v.getUint16(32, true), bits: v.getUint16(34, true), data: ascii(v, 36), dataLen: v.getUint32(40, true),
    };
  }

  function formProblems(h, size) {
    const p = [];
    const own = h.riff === 'RIFF' && h.wave === 'WAVE' && h.fmt === 'fmt ' && h.fmtSize === 16 && h.data === 'data'
      && h.riffSize === size - 8 && h.byteRate === h.rate * 2 && h.align === 2;
    if (!own) p.push('not-wav');
    if (h.format !== 1) p.push('not-pcm');
    if (h.channels !== 1) p.push('channels');
    if (h.bits !== 16) p.push('bits');
    if (h.rate < MIN_RATE || h.rate > MAX_RATE) p.push('rate');
    return p;
  }

  function lengthProblems(h, size) {
    const p = [], body = size - HEADER, samples = Math.floor(body / 2);
    if (h.dataLen !== body) p.push('data-length');
    if (body % 2 || h.dataLen % 2) p.push('whole-samples');
    if (h.rate > 0 && samples * 1000 < MIN_MS * h.rate) p.push('too-short');
    if (h.rate > 0 && samples * 1000 > MAX_MS * h.rate) p.push('too-long');
    return p;
  }

  // The rules of "Recording rules": the app's own header, PCM, 16 bit, 1 channel, 8 to 48 kHz, an exact data length,
  // a whole number of samples, 3 s to 12 s by sample count, 2 MB at most. Returns {ok, problems: [codes], ...facts}.
  function checkWav(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const out = {ok: false, problems: [], bytes: bytes.length, sampleRate: 0, channels: 0, bits: 0, samples: 0, durationMs: 0};
    if (bytes.length > MAX_BYTES) out.problems.push('too-big');
    if (bytes.length < HEADER) { out.problems.push('no-header'); return out; }
    const h = readHeader(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    out.problems.push(...formProblems(h, bytes.length), ...lengthProblems(h, bytes.length));
    Object.assign(out, {sampleRate: h.rate, channels: h.channels, bits: h.bits, samples: Math.floor((bytes.length - HEADER) / 2)});
    out.durationMs = h.rate > 0 ? Math.round(out.samples / h.rate * 1000) : 0;
    out.ok = out.problems.length === 0;
    return out;
  }

  // ---- The browser pieces, in one object so a test can replace them ----

  function browserEnv() {
    const g = globalThis;
    return {
      AudioContext: g.AudioContext || g.webkitAudioContext,
      AudioWorkletNode: g.AudioWorkletNode,
      mediaDevices: g.navigator && g.navigator.mediaDevices,
      ua: () => (g.navigator && g.navigator.userAgent) || '',
      mode: () => (g.navigator && g.navigator.standalone === true) || (g.matchMedia && g.matchMedia('(display-mode: standalone)').matches) ? 'homescreen' : 'browser',
      onHidden(fn) {
        if (!g.document) return () => {};
        const check = () => { if (g.document.visibilityState === 'hidden') fn(); };
        g.document.addEventListener('visibilitychange', check);
        g.addEventListener('pagehide', fn);
        return () => { g.document.removeEventListener('visibilitychange', check); g.removeEventListener('pagehide', fn); };
      },
    };
  }

  const isSupported = (env = browserEnv()) => !!(env.AudioContext && env.AudioWorkletNode && env.mediaDevices && env.mediaDevices.getUserMedia);

  // What the phone says about this clip: the three sound settings, the supported settings, the mode. A setting the phone does not report is null.
  function captureOf(stream, ctx, env) {
    const track = stream.getAudioTracks()[0];
    const got = (track && track.getSettings && track.getSettings()) || {};
    const asked = (env.mediaDevices.getSupportedConstraints && env.mediaDevices.getSupportedConstraints()) || {};
    const out = {mode: env.mode(), ua: env.ua().slice(0, 160), contextRate: ctx.sampleRate, supported: {}};
    for (const key of [...SOUND, 'channelCount', 'sampleRate']) {
      out[key] = got[key] === undefined ? null : got[key];
      out.supported[key] = asked[key] === true;
    }
    return out;
  }

  const stopTracks = stream => { for (const t of stream.getTracks()) { try { t.stop(); } catch { /* already stopped */ } } };
  const quiet = promise => { if (promise && promise.catch) promise.catch(() => {}); };
  const detailOf = err => (err ? `${err.name || 'Error'}: ${err.message || ''}`.slice(0, 120) : '');

  function whyOpenFailed(err) {
    const name = err && err.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no-microphone';
    return 'error';
  }

  // ---- One recording ----

  class Recording {
    constructor(opts, env) {
      this.o = Object.assign({replyWaitMs: 5000, firstSampleMs: 15000, seconds: 10, minMs: MIN_MS, workletUrl: '/cry-worklet.js', onState() {}}, opts);
      this.env = env;
      this.tapAt = performance.now();
      this.state = 'prepared';
      this.done = false;
      this.started = false;
      this.chunks = [];
      this.count = 0;
      this.firstAt = null;
      this.timers = [];
      this.off = () => {};
      this.capture = null;
      this.result = new Promise(resolve => { this.settle = resolve; });
      if (!isSupported(env)) { this.fail('no-support'); return; }
      this.setup();
    }

    elapsedMs() { return performance.now() - this.tapAt; }

    setState(state) {
      this.state = state;
      try { this.o.onState(state, this); } catch { /* a page callback must not stop the recording */ }
    }

    setup() {
      try {
        this.ctx = new this.env.AudioContext();
        quiet(this.ctx.resume());
        this.module = this.ctx.audioWorklet.addModule(this.o.workletUrl);
        quiet(this.module);
      } catch (err) { this.fail('no-worklet', detailOf(err)); return; }
      this.timers.push(setTimeout(() => { if (!this.started) this.fail('late-reply'); }, this.o.replyWaitMs));
      this.timers.push(setTimeout(() => { if (this.firstAt === null) this.fail('first-sample-deadline'); }, this.o.firstSampleMs));
      this.off = this.env.onHidden(() => this.cancel('hidden'));
    }

    // Call when the server reply says sound is on. A reply later than replyWaitMs opens no microphone.
    start() {
      if (this.done || this.started) return this.result;
      if (this.elapsedMs() >= this.o.replyWaitMs) { this.fail('late-reply'); return this.result; }
      this.started = true;
      this.setState('starting');
      this.open().catch(err => this.fail(whyOpenFailed(err), detailOf(err)));
      return this.result;
    }

    async open() {
      const stream = await this.env.mediaDevices.getUserMedia({audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1}});
      if (this.done) { stopTracks(stream); return; }
      this.stream = stream;
      try { await this.module; } catch (err) { this.fail('no-worklet', detailOf(err)); return; }
      if (this.done) return;
      this.capture = captureOf(stream, this.ctx, this.env);
      this.wire(stream);
      quiet(this.ctx.resume());
    }

    wire(stream) {
      const ctx = this.ctx;
      this.source = ctx.createMediaStreamSource(stream);
      this.node = new this.env.AudioWorkletNode(ctx, 'cry-capture', {numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit'});
      // The node outputs silence. Some browsers run a node only when it reaches the speakers, so it goes through a gain of 0.
      this.mute = ctx.createGain();
      this.mute.gain.value = 0;
      this.node.port.onmessage = event => this.take(event.data);
      this.source.connect(this.node);
      this.node.connect(this.mute);
      this.mute.connect(ctx.destination);
      const track = stream.getAudioTracks()[0];
      if (track && track.addEventListener) track.addEventListener('ended', () => this.stop('ended'));
    }

    take(block) {
      if (this.done) return;
      if (this.firstAt !== null && performance.now() - this.firstAt > this.o.seconds * 1000 + STALL_MS) { this.fail('interrupted'); return; }
      if (this.firstAt === null) {
        if (this.elapsedMs() >= this.o.firstSampleMs) { this.fail('first-sample-deadline'); return; }
        this.firstAt = performance.now();
        // If blocks stop (a call or a lock while the page stays visible), the recording is cancelled on the wall clock: the clip would span a gap.
        this.timers.push(setTimeout(() => this.fail('interrupted'), this.o.seconds * 1000 + STALL_MS));
        this.setState('recording');
      }
      const need = Math.round(this.o.seconds * this.ctx.sampleRate), room = need - this.count;
      this.chunks.push(block.length > room ? block.subarray(0, room) : block);
      this.count += Math.min(block.length, room);
      if (this.count >= need) this.complete(false);
    }

    // End and keep nothing. The reason is for the page and the test page.
    cancel(reason = 'cancelled') { this.fail(reason); }

    // End now and keep the clip so far, if it is long enough. The cause is the `end` of a kept clip:
    // 'left' (the parent left the screen), 'row' (a row tap) or 'ended' (the microphone track ended).
    stop(cause = 'left') {
      if (this.done) return;
      if (this.firstAt === null) this.fail('stopped'); else this.complete(true, cause);
    }

    teardown() {
      this.done = true;
      for (const t of this.timers) clearTimeout(t);
      this.off();
      if (this.node) this.node.port.onmessage = null;
      for (const part of [this.source, this.node, this.mute]) { try { if (part) part.disconnect(); } catch { /* not connected */ } }
      if (this.stream) stopTracks(this.stream);
      if (this.ctx) quiet(this.ctx.close());
    }

    fail(reason, detail = '') {
      if (this.done) return;
      const startMs = this.firstAt === null ? null : Math.round(this.firstAt - this.tapAt);
      this.teardown();
      this.setState('cancelled');
      this.settle({ok: false, reason, detail, startMs, capture: this.capture});
    }

    // A recording that filled its 10 s ends with 'full'.
    complete(partial, end = 'full') {
      if (this.done) return;
      const rate = this.ctx.sampleRate, samples = new Float32Array(this.count);
      let at = 0;
      for (const c of this.chunks) { samples.set(c, at); at += c.length; }
      const durationMs = Math.round(this.count / rate * 1000), startMs = Math.round(this.firstAt - this.tapAt);
      const capture = this.capture;
      this.teardown();
      if (durationMs < this.o.minMs) {
        this.setState('cancelled');
        this.settle({ok: false, reason: 'too-short', detail: '', durationMs, startMs, capture});
        return;
      }
      this.setState('done');
      this.settle({ok: true, partial, end, wav: encodeWav(samples, rate), sampleRate: rate, durationMs, startMs, capture});
    }
  }

  // Call inside the tap handler. opts: replyWaitMs (5000), firstSampleMs (15000), seconds (10), minMs (3000), workletUrl, onState(state, rec), env.
  function prepare(opts = {}) {
    return new Recording(opts, opts.env || browserEnv());
  }

  // Play WAV bytes through Web Audio. Call inside a tap handler. Returns {stop, ended, durationMs, sampleRate}.
  async function play(wav, env = browserEnv()) {
    if (globalThis.navigator?.audioSession) { try { globalThis.navigator.audioSession.type = 'playback'; } catch { /* unsupported */ } }
    const ctx = new env.AudioContext();
    await Promise.resolve(ctx.resume()).catch(() => {});
    const buffer = await ctx.decodeAudioData(wav.slice().buffer);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const ended = new Promise(resolve => { source.onended = () => { quiet(ctx.close()); resolve(); }; });
    source.start();
    return {stop() { try { source.stop(); } catch { /* already ended */ } }, ended, durationMs: Math.round(buffer.duration * 1000), sampleRate: buffer.sampleRate};
  }

  return {prepare, play, isSupported, encodeWav, checkWav, PROBLEMS, MIN_MS, MAX_MS, MAX_BYTES};
})();
