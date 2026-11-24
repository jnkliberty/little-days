import test, {mock} from 'node:test';
import assert from 'node:assert/strict';

// The browser file for the Crying sound clip. It sets globalThis.LittleDaysCry and touches no browser object at load.
await import('../web/cry-capture.js');
const {encodeWav, checkWav, prepare, preparePlay} = (globalThis as any).LittleDaysCry;

// Synthetic sound only: a quiet tone, no voice.
const tone = (rate: number, seconds: number) => Float32Array.from({length: Math.round(rate * seconds)}, (_, i) => 0.2 * Math.sin(i / 20));
const clip = (seconds: number, rate = 48000) => encodeWav(tone(rate, seconds), rate);

// A PCM file with any channel count and bit depth, for the shapes that the app's writer never makes.
function raw({channels = 1, bits = 16, rate = 48000, seconds = 5} = {}) {
  const align = channels * bits / 8, data = Math.round(rate * seconds) * align, bytes = new Uint8Array(44 + data), v = new DataView(bytes.buffer);
  const tag = (at: number, text: string) => { for (let i = 0; i < 4; i++) v.setUint8(at + i, text.charCodeAt(i)); };
  tag(0, 'RIFF'); v.setUint32(4, 36 + data, true); tag(8, 'WAVE'); tag(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, channels, true); v.setUint32(24, rate, true); v.setUint32(28, rate * align, true); v.setUint16(32, align, true); v.setUint16(34, bits, true);
  tag(36, 'data'); v.setUint32(40, data, true);
  return bytes;
}

const problemsOf = (bytes: Uint8Array) => checkWav(bytes).problems;

test('a good 10 s clip passes and the writer makes the 44 byte header of the app', () => {
  const bytes = clip(10), check = checkWav(bytes);
  assert.equal(bytes.length, 44 + 480000 * 2);
  assert.deepEqual(check.problems, []);
  assert.equal(check.ok, true);
  assert.equal(check.durationMs, 10000);
  assert.equal(check.sampleRate, 48000);
  assert.equal(String.fromCharCode(...bytes.subarray(0, 4)), 'RIFF');
  assert.equal(String.fromCharCode(...bytes.subarray(36, 40)), 'data');
});

test('the writer turns -1 to 1 samples into 16 bit values and clamps the rest', () => {
  const bytes = encodeWav(Float32Array.from([0, 1, -1, 0.5, 2, -2]), 8000), v = new DataView(bytes.buffer);
  const values = [0, 1, 2, 3, 4, 5].map(i => v.getInt16(44 + i * 2, true));
  assert.deepEqual(values, [0, 32767, -32768, 16384, 32767, -32768]);
});

test('3 s and 12 s pass by sample count, and one sample outside either limit fails', () => {
  assert.deepEqual(problemsOf(clip(3, 8000)), []);
  assert.deepEqual(problemsOf(clip(12, 8000)), []);
  assert.deepEqual(problemsOf(encodeWav(new Float32Array(3 * 8000 - 1), 8000)), ['too-short']);
  assert.deepEqual(problemsOf(encodeWav(new Float32Array(12 * 8000 + 1), 8000)), ['too-long']);
});

test('2 channels, 24 bit, under 3 s, over 12 s and over 2 MB each fail', () => {
  assert.ok(problemsOf(raw({channels: 2})).includes('channels'));
  assert.ok(problemsOf(raw({bits: 24})).includes('bits'));
  assert.deepEqual(problemsOf(clip(2.9)), ['too-short']);
  assert.deepEqual(problemsOf(clip(12.5)), ['too-long']);
  const big = checkWav(clip(25));
  assert.ok(big.bytes > 2 * 1024 * 1024 && big.problems.includes('too-big'));
});

test('a header that names more bytes than the body holds fails', () => {
  const good = clip(5), cut = good.slice(0, good.length - 1000);
  const problems = problemsOf(cut);
  assert.ok(problems.includes('data-length') && problems.includes('not-wav'));
  const v = new DataView(good.buffer.slice(0));
  v.setUint32(40, v.getUint32(40, true) + 2, true);
  assert.ok(problemsOf(new Uint8Array(v.buffer)).includes('data-length'));
});

test('a body that is not a whole number of samples fails', () => {
  const odd = new Uint8Array(clip(5).length + 1);
  odd.set(clip(5));
  assert.ok(problemsOf(odd).includes('whole-samples'));
});

test('a rate outside 8 to 48 kHz and a file that is not WAV fail', () => {
  assert.ok(problemsOf(raw({rate: 7999, seconds: 5})).includes('rate'));
  assert.ok(problemsOf(raw({rate: 48001, seconds: 5})).includes('rate'));
  assert.ok(problemsOf(new TextEncoder().encode('x'.repeat(200000))).includes('not-wav'));
  assert.deepEqual(problemsOf(new Uint8Array(10)), ['no-header']);
});

// ---- The recording rules, with a fake microphone and fake Web Audio ----

function fakeEnv({gum}: {gum?: () => Promise<any>} = {}) {
  const log: any = {gum: 0, tracksStopped: 0, ctxClosed: false, node: null, hidden: null};
  const track = {stop() { log.tracksStopped++; }, getSettings: () => ({echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1}), addEventListener() {}};
  const stream = {getTracks: () => [track], getAudioTracks: () => [track]};
  const part = () => ({connect() {}, disconnect() {}});
  class Context {
    sampleRate = 8000;
    destination = {};
    audioWorklet = {addModule: async () => {}};
    async resume() {}
    async close() { log.ctxClosed = true; }
    createMediaStreamSource() { return part(); }
    createGain() { return {...part(), gain: {value: 1}}; }
  }
  class Worklet {
    port: any = {onmessage: null};
    constructor() { log.node = this; }
    connect() {}
    disconnect() {}
  }
  const env = {
    AudioContext: Context, AudioWorkletNode: Worklet,
    mediaDevices: {getUserMedia: () => { log.gum++; return gum ? gum() : Promise.resolve(stream); }, getSupportedConstraints: () => ({echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: true})},
    ua: () => 'synthetic test browser', mode: () => 'browser', onHidden: (fn: () => void) => { log.hidden = fn; return () => {}; },
  };
  return {env, log, stream};
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
// Send n blocks of 1024 samples, as the audio thread does.
const feed = (log: any, n: number) => { for (let i = 0; i < n; i++) { if (log.node.port.onmessage) log.node.port.onmessage({data: new Float32Array(1024).fill(0.1)}); } };

test('a reply that comes after the wait opens no microphone', async () => {
  const {env, log} = fakeEnv();
  const rec = prepare({env, replyWaitMs: 40, firstSampleMs: 500});
  await wait(80);
  const result = await rec.start();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'late-reply');
  assert.equal(log.gum, 0);
  assert.equal(log.ctxClosed, true);
});

test('a recording takes exactly the seconds asked for from the first sample and its clip passes the WAV rules', async () => {
  const {env, log} = fakeEnv();
  const states: string[] = [];
  const rec = prepare({env, seconds: 3, onState: (s: string) => states.push(s)});
  rec.start();
  await wait(10);
  feed(log, 40); // the 24th block ends the clip: the recording ignores the blocks after it
  const result = await rec.result;
  assert.equal(result.ok, true);
  assert.equal(result.durationMs, 3000);
  assert.equal(result.wav.length, 44 + 24000 * 2);
  assert.deepEqual(checkWav(result.wav).problems, []);
  assert.deepEqual(states, ['starting', 'recording', 'done']);
  assert.equal(result.capture.echoCancellation, false);
  assert.equal(result.capture.supported.autoGainControl, true);
  assert.equal(result.capture.mode, 'browser');
  assert.equal(typeof result.startMs, 'number');
  assert.equal(log.tracksStopped, 1);
  assert.equal(log.ctxClosed, true);
});

test('the last block is cut at the requested length', async () => {
  const {env, log} = fakeEnv();
  const rec = prepare({env, seconds: 0.5, minMs: 100});
  rec.start();
  await wait(10);
  feed(log, 4); // 4096 samples; 0.5 s at 8 kHz is 4000
  const result = await rec.result;
  assert.deepEqual([result.ok, result.durationMs, result.wav.length], [true, 500, 44 + 8000]);
});

test('a stream that arrives after a cancel is stopped at once', async () => {
  let release: (s: any) => void = () => {};
  const {env, log, stream} = fakeEnv({gum: () => new Promise(resolve => { release = resolve; })});
  const rec = prepare({env});
  rec.start();
  rec.cancel('adult');
  release(stream);
  const result = await rec.result;
  await wait(10);
  assert.deepEqual([result.ok, result.reason], [false, 'adult']);
  assert.equal(log.tracksStopped, 1);
  assert.equal(log.node, null);
});

test('a stream that arrives after the first sample deadline is stopped and makes no clip', async () => {
  const {env, log, stream} = fakeEnv({gum: () => wait(120).then(() => stream)});
  const rec = prepare({env, firstSampleMs: 60});
  rec.start();
  const result = await rec.result;
  assert.equal(result.reason, 'first-sample-deadline');
  await wait(100);
  assert.equal(log.tracksStopped, 1);
  assert.equal(log.node, null);
});

test('stop keeps the clip so far when it is long enough and drops it when it is under the minimum', async () => {
  const kept = fakeEnv(), short = fakeEnv();
  const a = prepare({env: kept.env}), b = prepare({env: short.env});
  a.start(); b.start();
  await wait(10);
  feed(kept.log, 32); feed(short.log, 8); // 4.1 s and 1.0 s at 8 kHz
  a.stop(); b.stop();
  const [ra, rb] = [await a.result, await b.result];
  assert.deepEqual([ra.ok, ra.partial, ra.durationMs], [true, true, 4096]);
  assert.deepEqual([rb.ok, rb.reason, rb.wav], [false, 'too-short', undefined]);
  assert.equal(kept.log.tracksStopped + short.log.tracksStopped, 2);
});

// Failure case: a kept clip does not say what ended it (plan 2026-11-20 M5), or says the wrong cause, so the 7-day check of D3
// (a row tap ends the clip) counts wrong. Gap: the stop test above reads only ok, partial and the length.
test('a kept clip says what ended it: full, left, row or ended', async () => {
  const run = async (end: (rec: any, ended: () => void) => void, blocks = 32) => {
    const {env, log, stream} = fakeEnv();
    let ended = () => {};
    stream.getAudioTracks()[0].addEventListener = (name: string, fn: () => void) => { if (name === 'ended') ended = fn; };
    const rec = prepare({env, seconds: 5});
    rec.start();
    await wait(10);
    feed(log, blocks);
    end(rec, ended);
    return rec.result;
  };
  assert.deepEqual(await run(() => {}, 40).then((r: any) => [r.ok, r.end]), [true, 'full'], '5 s complete');
  assert.deepEqual(await run(rec => rec.stop()).then((r: any) => [r.ok, r.end]), [true, 'left'], 'the parent left the screen');
  assert.deepEqual(await run(rec => rec.stop('row')).then((r: any) => [r.ok, r.end]), [true, 'row'], 'a row tap');
  assert.deepEqual(await run((_rec, ended) => ended()).then((r: any) => [r.ok, r.end]), [true, 'ended'], 'the microphone track ended');
});

test('a hidden page cancels and stops the microphone track', async () => {
  const {env, log} = fakeEnv();
  const rec = prepare({env});
  rec.start();
  await wait(10);
  feed(log, 5);
  log.hidden();
  const result = await rec.result;
  assert.deepEqual([result.ok, result.reason], [false, 'hidden']);
  assert.equal(log.tracksStopped, 1);
  feed(log, 5); // a block that arrives after the end changes nothing
});

test('a refused microphone gives the reason denied', async () => {
  const {env} = fakeEnv({gum: () => Promise.reject(Object.assign(new Error('no'), {name: 'NotAllowedError'}))});
  const result = await prepare({env}).start();
  assert.deepEqual([result.ok, result.reason], [false, 'denied']);
});

// Failure case: blocks stop after the first one (a phone call or a lock while the page stays visible); the microphone stays open and a resume adds late sound.
test('a recording whose blocks stop is cancelled on the wall clock, 2 s after the requested length, and keeps nothing', async () => {
  const {env, log} = fakeEnv();
  mock.timers.enable({apis: ['setTimeout']});
  try {
    const rec = prepare({env, seconds: 1, minMs: 100});
    rec.start();
    await new Promise(resolve => setImmediate(resolve));
    feed(log, 2); // 0.26 s, then nothing
    mock.timers.tick(2999);
    assert.equal(rec.done, false, 'not before seconds + 2 s');
    mock.timers.tick(1);
    assert.equal(rec.done, true);
    const result = await rec.result;
    assert.deepEqual([result.ok, result.reason, result.wav], [false, 'interrupted', undefined]);
    assert.equal(log.tracksStopped, 1);
  } finally { mock.timers.reset(); }
});

// Failure case: a late block that arrives before the stall timer runs fills the quota, so the clip spans the interruption.
test('a block that comes more than 2 s after the requested length cancels the recording instead of filling it', async () => {
  const {env, log} = fakeEnv();
  let clock = 0;
  mock.timers.enable({apis: ['setTimeout']});
  mock.method(performance, 'now', () => clock);
  try {
    const rec = prepare({env, seconds: 1, minMs: 100});
    rec.start();
    await new Promise(resolve => setImmediate(resolve));
    feed(log, 1);
    clock = 3000;
    feed(log, 1);
    assert.equal(rec.done, false, 'exactly seconds + 2 s is still in time');
    clock = 3001;
    feed(log, 7); // would fill the 8000 samples
    assert.equal(rec.done, true);
    const result = await rec.result;
    assert.deepEqual([result.ok, result.reason], [false, 'interrupted']);
    assert.equal(log.tracksStopped, 1);
  } finally { mock.restoreAll(); mock.timers.reset(); }
});

// Failure case: a first block that was queued before the deadline timer ran starts a recording that began after the first sample limit.
test('a first block that comes after the first sample limit fails the recording', async () => {
  const {env, log} = fakeEnv();
  mock.timers.enable({apis: ['setTimeout']}); // the deadline timer never runs, so only take() can enforce the limit
  try {
    const rec = prepare({env, firstSampleMs: 50});
    rec.start();
    await new Promise(resolve => setImmediate(resolve));
    for (const t = performance.now(); performance.now() - t < 60;) { /* let 60 ms pass */ }
    feed(log, 1);
    assert.equal(rec.done, true);
    assert.equal((await rec.result).reason, 'first-sample-deadline');
  } finally { mock.timers.reset(); }
});

// ---- Playback: synchronous tap unlock, PCM decode fallback, audioSession lifecycle and stop races ----

function fakePlayEnv({decodeFails = false, staySuspended = false, withAudioSession = true}: {decodeFails?: boolean; staySuspended?: boolean; withAudioSession?: boolean} = {}) {
  const log: any = {created: 0, resumed: 0, started: [], stopped: 0, closed: 0, decodeCalls: 0, audioSessionTypes: [], silentStarted: 0};
  const session = withAudioSession ? {
    _type: 'auto',
    get type() { return this._type; },
    set type(v: string) { this._type = v; log.audioSessionTypes.push(v); },
  } : null;
  class PlayContext {
    sampleRate = 48000;
    state = 'suspended';
    destination = {};
    constructor() { log.created++; }
    async resume() { log.resumed++; if (!staySuspended) this.state = 'running'; }
    async close() { this.state = 'closed'; log.closed++; }
    createBuffer(channels: number, length: number, rate: number) {
      const data = new Float32Array(length);
      return {numberOfChannels: channels, length, sampleRate: rate, duration: length / rate, getChannelData: () => data};
    }
    createBufferSource() {
      const node: any = {
        buffer: null, onended: null,
        connect() {},
        start() {
          if (node.buffer?.length === 1) { log.silentStarted++; return; }
          log.started.push({length: node.buffer?.length, sampleRate: node.buffer?.sampleRate, duration: node.buffer?.duration, sample0: node.buffer?.getChannelData?.(0)?.[0]});
          log.lastSource = node;
        },
        stop() { log.stopped++; },
      };
      return node;
    }
    async decodeAudioData(buf: ArrayBuffer) {
      log.decodeCalls++;
      if (decodeFails) throw new Error('EncodingError');
      const v = new DataView(buf), rate = v.getUint32(24, true), samples = v.getUint32(40, true) / 2;
      const out = this.createBuffer(1, samples, rate);
      const ch = out.getChannelData(0);
      for (let i = 0; i < samples; i++) ch[i] = v.getInt16(44 + i * 2, true) / 32768;
      return out;
    }
  }
  return {env: {AudioContext: PlayContext, audioSession: session}, log, session};
}

// Failure case: iOS Safari stays suspended after async fetch, rejects decodeAudioData on a valid WAV, leaves audioSession on 'playback' (breaking later mic capture), or starts audio after Stop.
// Gap: no test previously exercised cry-capture.js playback unlock, PCM fallback, audioSession reset, or stop-during-fetch/decode.
test('preparePlay unlocks AudioContext synchronously, sets playback session, falls back to direct PCM WAV decoding, and resets audioSession on stop/end', async () => {
  const {env, log} = fakePlayEnv({decodeFails: true});
  const player = preparePlay(env);
  // Synchronously inside the tap handler: audioSession is 'playback', AudioContext created, resumed, and silent 1-sample buffer started.
  assert.deepEqual(log.audioSessionTypes, ['playback']);
  assert.equal(log.created, 1);
  assert.equal(log.resumed, 1);
  assert.equal(log.silentStarted, 1);
  // Simulate async fetch, then play a valid 4 s 8 kHz WAV where decodeAudioData fails.
  const wav = clip(4, 8000);
  const handle = await player.play(wav);
  assert.equal(log.decodeCalls, 1);
  assert.equal(log.started.length, 1);
  assert.equal(log.started[0].sampleRate, 8000);
  assert.equal(log.started[0].length, 32000);
  assert.equal(handle.durationMs, 4000);
  // Natural end closes the context and restores audioSession to 'auto'.
  log.lastSource.onended();
  await handle.ended;
  assert.equal(log.closed, 1);
  assert.deepEqual(log.audioSessionTypes, ['playback', 'auto']);
});

test('preparePlay does not start audio if stopped before bytes arrive and rejects if AudioContext stays suspended', async () => {
  const stoppedEnv = fakePlayEnv();
  const p1 = preparePlay(stoppedEnv.env);
  p1.stop();
  const h1 = await p1.play(clip(3, 8000));
  assert.equal(h1, null);
  assert.equal(stoppedEnv.log.started.length, 0);
  assert.deepEqual(stoppedEnv.log.audioSessionTypes, ['playback', 'auto']);

  const blockedEnv = fakePlayEnv({staySuspended: true});
  const p2 = preparePlay(blockedEnv.env);
  await assert.rejects(() => p2.play(clip(3, 8000)), /blocked/i);
  assert.equal(blockedEnv.log.started.length, 0);

  const throwing = preparePlay({AudioContext: function Broken() { throw new Error('limit'); }, audioSession: null});
  assert.equal(throwing.ready, false);
  throwing.stop();
});
