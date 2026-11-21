import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError, body, json, jsonBody } from './http.ts';
import { requirePermission } from './records.ts';
import { careGuidance } from './care-guidance.ts';
import type { Session } from './app.ts';
import type { CryRow, CryListRow } from './cries-store.ts';
import type { Store } from './store.ts';

// The routes of the Crying button. Every cry route checks the right on `notes`.
//
// Contract with the phone (details the plan left open are marked "open detail"):
//   POST /api/cries            {id, occurredAt, snapshot, sound?}  ->  {id, clipState, sound}
//     snapshot = {ageDays, dayPart: 'day'|'night', complete, rank, log: {feed, sleep, diaper}}; every empty value is null.
//   PUT /api/cries/<id>/clip   body = the WAV file; header x-cry-capture = JSON {startMs, mode, ua, contextRate, echoCancellation, noiseSuppression, autoGainControl, channelCount, sampleRate, supported}
//     (open detail: startMs travels in this one header with the Wave 0 capture keys, because the plan names one header)
//   PATCH /api/cries/<id>      {stoppedBy?, noisy?, skipped?, was?, distress?, rowTap?: {type, ms}, noClip?}; Undo = {stoppedBy: '', was: <answer to remove>}
//     (the last three: plans/2026-11-20-crying-method-fixes.md; snapshot.order and the capture key `end` come from the same plan)
//   PUT /api/cries/sound       {sound: 'on'|'off'}      (own setting key `crySound`, not the preference object)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = '([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})';
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const ANSWERS = ['feed', 'diaper', 'sleep', 'burp', 'gas', 'held', 'nothing'];
const MINUTE = 60_000;
const MAX_CLIP_BYTES = 2 * 1024 * 1024;
const GOAL = 100;
const PASSAGES = ['care-comfort', 'care-urgent'];
// The method fixes (plans/2026-11-20-crying-method-fixes.md). What ended a kept clip, the rows a parent can tap,
// and the frozen list of reasons a cry with sound asked has no clip: those of cry-capture.js, then those of cry.js.
const CLIP_ENDS = ['full', 'left', 'row', 'ended'];
const ROWS = ['feed', 'sleep', 'diaper'];
const NO_CLIP = ['no-support', 'no-worklet', 'late-reply', 'first-sample-deadline', 'denied', 'no-microphone', 'error', 'stopped', 'too-short', 'hidden', 'cancelled', 'interrupted',
  'recording', 'network', 'refused'];
const ROW_TAP_MAX_MS = 86_400_000;
const OLD_FIELDS = ['stoppedBy', 'noisy', 'skipped', 'was'];
const MARK_FIELDS = ['distress', 'rowTap', 'noClip'];

type Ctx = { req: IncomingMessage; res: ServerResponse; url: URL; session: Session; id: string };
type Route = { method: string; path: RegExp; right: 'view' | 'add' | 'change'; run: (ctx: Ctx) => Promise<void> | void };
type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const bad = (message: string) => new HttpError(400, message);

function onlyKeys(value: Obj, allowed: string[], message: string) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw bad(message);
}

// A number or null inside a range; a missing value is null.
function number(value: unknown, min: number, max: number, integer = false): number | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw bad('A number in the cry snapshot is out of range.');
  return value;
}
function flag(value: unknown): boolean {
  if (typeof value !== 'boolean') throw bad('A yes or no value in the cry request is missing.');
  return value;
}
function word(value: unknown, max: number): string | null {
  if (value == null) return null;
  if (typeof value !== 'string' || !/^[a-z0-9 _-]+$/i.test(value) || value.length > max) throw bad('A word in the cry snapshot is not valid.');
  return value;
}

const MINUTES_MAX = 525_600;
// Each part of `log`: its key, and how to read each field. A missing field is null.
const PARTS: Record<string, Record<string, (value: unknown) => unknown>> = {
  feed: { sinceMin: v => number(v, 0, MINUTES_MAX), usualMin: v => number(v, 0, MINUTES_MAX), gaps: v => number(v ?? 0, 0, 10_000, true), lastKind: v => word(v, 40), lastAmountMl: v => number(v, 0, 5000), running: v => flag(v ?? false) },
  sleep: { awakeMin: v => number(v, 0, MINUTES_MAX), usualMin: v => number(v, 0, MINUTES_MAX), gaps: v => number(v ?? 0, 0, 10_000, true), running: v => flag(v ?? false) },
  diaper: { sinceMin: v => number(v, 0, MINUTES_MAX), usualMin: v => number(v, 0, MINUTES_MAX), gaps: v => number(v ?? 0, 0, 10_000, true), lastKind: v => word(v, 40) },
};

function logPart(name: string, value: unknown): Obj {
  const readers = PARTS[name];
  if (!isObj(value)) throw bad('The cry snapshot needs its feed, sleep and diaper parts.');
  onlyKeys(value, Object.keys(readers), 'The cry snapshot has a field that is not known.');
  return Object.fromEntries(Object.entries(readers).map(([key, read]) => [key, read(value[key])]));
}

// Open detail: with `complete` true, `rank` may be the full order or empty; with `complete` false it must be empty.
function rankOf(value: unknown, complete: boolean): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || (value.length !== 0 && (value.length !== 3 || new Set(value).size !== 3 || value.some(item => typeof item !== 'string' || !Object.hasOwn(PARTS, item))))) throw bad('The row order of the cry snapshot is not valid.');
  if (!complete && value.length) throw bad('A snapshot with days missing holds no row order.');
  return value as string[];
}

function snapshotOf(value: unknown, childId: number): Obj {
  if (!isObj(value)) throw bad('Send the snapshot of the tap.');
  onlyKeys(value, ['ageDays', 'dayPart', 'complete', 'log', 'rank', 'order'], 'The cry snapshot has a field that is not known.');
  if (value.dayPart !== 'day' && value.dayPart !== 'night') throw bad('The part of the day must be day or night.');
  // `order` is the row order that the parent saw. A page from before the method fixes sends none.
  if (value.order !== undefined && value.order !== 'home') throw bad('The row order of the cry screen is not known.');
  const complete = flag(value.complete), log = value.log;
  if (!isObj(log)) throw bad('The cry snapshot needs its feed, sleep and diaper parts.');
  onlyKeys(log, Object.keys(PARTS), 'The cry snapshot has a field that is not known.');
  return {
    childId, ageDays: number(value.ageDays, 0, 3650, true), dayPart: value.dayPart, complete,
    log: Object.fromEntries(Object.keys(PARTS).map(name => [name, logPart(name, log[name])])), rank: rankOf(value.rank, complete),
    ...(value.order === undefined ? {} : { order: value.order }),
  };
}

function idOf(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw bad('Use a valid cry ID.');
  return value.toLowerCase();
}

function parseCreate(input: Obj, childId: number) {
  onlyKeys(input, ['id', 'occurredAt', 'snapshot', 'sound'], 'The cry request has a field that is not known.');
  if (typeof input.occurredAt !== 'string' || !TIME.test(input.occurredAt) || !Number.isFinite(Date.parse(input.occurredAt))) throw bad('Send the time of the tap.');
  if (input.sound !== undefined && typeof input.sound !== 'boolean') throw bad('Send sound as true or false.');
  return { id: idOf(input.id), at: Date.parse(input.occurredAt), snapshot: snapshotOf(input.snapshot, childId), sound: input.sound === true };
}

const WAV_LABELS = (data: Buffer, at: number, text: string) => data.toString('latin1', at, at + text.length) === text;

// The one WAV form the app's own writer makes: a 44-byte header, PCM, 16 bit, one channel, 8 to 48 kHz,
// a data length that equals the bytes that follow and a whole number of samples, 3 s to 12 s.
export function wavInfo(data: Buffer): { sampleRate: number; durationMs: number; peak: number; clipped: number } {
  const fail = (message: string): never => { throw bad(message); };
  if (data.length < 44 || !WAV_LABELS(data, 0, 'RIFF') || !WAV_LABELS(data, 8, 'WAVE') || !WAV_LABELS(data, 12, 'fmt ') || !WAV_LABELS(data, 36, 'data')) fail('Send a WAV file.');
  const rate = data.readUInt32LE(24), dataLength = data.readUInt32LE(40);
  if (data.readUInt32LE(16) !== 16 || data.readUInt16LE(20) !== 1) fail('The sound must be PCM.');
  if (data.readUInt16LE(22) !== 1) fail('The sound must have one channel.');
  if (data.readUInt16LE(34) !== 16) fail('The sound must be 16 bit.');
  if (rate < 8000 || rate > 48000 || data.readUInt32LE(28) !== rate * 2 || data.readUInt16LE(32) !== 2) fail('The sound rate must be 8 to 48 kHz.');
  if (data.readUInt32LE(4) !== data.length - 8 || dataLength !== data.length - 44 || dataLength % 2 !== 0) fail('The sound length does not match its header.');
  const samples = dataLength / 2;
  if (samples < 3 * rate || samples > 12 * rate) fail('The sound must be 3 to 12 seconds long.');
  return { sampleRate: rate, durationMs: Math.round(samples * 1000 / rate), ...levelOf(data, samples) };
}

// The two quality numbers of a clip: the peak = the largest absolute sample / 32768, and the clipped share = the share
// of samples at the limit (32767 or -32768). No screen shows them.
function levelOf(data: Buffer, samples: number): { peak: number; clipped: number } {
  let top = 0, atLimit = 0;
  for (let at = 44; at < 44 + samples * 2; at += 2) {
    const sample = data.readInt16LE(at), size = Math.abs(sample);
    if (size > top) top = size;
    if (sample === 32767 || sample === -32768) atLimit++;
  }
  return { peak: top / 32768, clipped: atLimit / samples };
}

const CAPTURE_FLAGS = ['echoCancellation', 'noiseSuppression', 'autoGainControl'];
const SUPPORTED = [...CAPTURE_FLAGS, 'channelCount', 'sampleRate'];
function supportedOf(value: unknown, message: string): Obj {
  if (!isObj(value) || Object.keys(value).length !== SUPPORTED.length) throw bad(message);
  onlyKeys(value, SUPPORTED, message);
  if (SUPPORTED.some(key => typeof value[key] !== 'boolean')) throw bad(message);
  return Object.fromEntries(SUPPORTED.map(key => [key, value[key]]));
}

// The header x-cry-capture: up to 1 KB of JSON, these keys only (the Wave 0 capture object plus startMs). A value the phone
// does not report is null. startMs is the time from the tap to the first sample (0 to 15000).
export function captureOf(header: unknown): Obj {
  const message = 'The capture settings are not valid.';
  if (typeof header !== 'string' || header.length > 1024) throw bad(message);
  let value: unknown;
  try { value = JSON.parse(header); } catch { throw bad(message); }
  if (!isObj(value)) throw bad(message);
  onlyKeys(value, ['startMs', 'mode', 'ua', 'contextRate', ...SUPPORTED, 'supported', 'end'], message);
  const startMs = number(value.startMs, 0, 15_000, true);
  if (startMs === null || (value.mode !== 'homescreen' && value.mode !== 'browser') || typeof value.ua !== 'string' || !/^[\x20-\x7e]{0,160}$/.test(value.ua)) throw bad(message);
  // What ended the clip. A page from before the method fixes sends none.
  if (value.end !== undefined && !(typeof value.end === 'string' && CLIP_ENDS.includes(value.end))) throw bad(message);
  const out: Obj = { mode: value.mode, ua: value.ua, contextRate: number(value.contextRate, 1, 400_000), supported: supportedOf(value.supported, message) };
  for (const key of CAPTURE_FLAGS) { const item = value[key]; if (item != null && typeof item !== 'boolean') throw bad(message); out[key] = item ?? null; }
  out.channelCount = number(value.channelCount, 1, 32, true);
  out.sampleRate = number(value.sampleRate, 1, 400_000);
  return { startMs, end: (value.end as string | undefined) ?? null, capture: out };
}

function publicCry(row: CryListRow | CryRow) {
  return { id: row.id, occurredAt: row.occurredAt, adult: row.adult, stoppedBy: row.stoppedBy, clipState: row.clipState, ...('clipMs' in row ? { clipMs: row.clipMs } : {}), noisy: row.noisy };
}

export function createCries({ store, now = Date.now }: { store: Store; now?: () => number }) {
  const cries = store.cries;
  const right = (session: Session, action: 'view' | 'add' | 'change') => requirePermission(store, session, 'notes', action);
  function scopeOf(session: Session): string {
    const saved = store.getSession(session.sessionId);
    if (!saved) throw new HttpError(401, 'Sign in again.');
    return `user:${saved.babyBuddyUserId}`;
  }
  const choiceOf = (session: Session): 'on' | 'off' | null => {
    const value = store.getSetting(scopeOf(session), 'crySound');
    return value === 'on' || value === 'off' ? value : null;
  };
  function found(id: string): CryRow {
    const row = cries.get(id);
    if (!row) throw new HttpError(404, 'Cry not found.');
    if (row.deletedAt) throw new HttpError(410, 'This cry was deleted.');
    return row;
  }
  // `sound` comes from the state at this moment: the choice of the adult, the clip state and who asks.
  const soundFor = (row: CryRow, session: Session) => row.soundOn && row.clipState === 'none' && row.adult === session.adult && choiceOf(session) === 'on';
  const createReply = (row: CryRow, session: Session) => ({ id: row.id, clipState: row.clipState, sound: soundFor(row, session) });

  async function create({ req, res, session }: Ctx) {
    const input = await jsonBody(req);
    const child = store.getSetting('app', 'child') as { id?: unknown } | null;
    // Open detail: with no child set up there is nothing to attach a cry to, so the answer is 409.
    if (!Number.isSafeInteger(child?.id)) throw new HttpError(409, 'Set up the child before saving a cry.');
    const parsed = parseCreate(input, Number(child!.id));
    const existing = cries.get(parsed.id);
    if (existing?.deletedAt) throw new HttpError(410, 'This cry was deleted.');
    if (existing) return json(res, 200, createReply(existing, session));
    const current = now();
    if (parsed.at < current - 15 * MINUTE) throw bad('This tap is more than 15 minutes old.');
    if (parsed.at > current + 2 * MINUTE) throw bad('This tap is in the future.');
    cries.insert({ id: parsed.id, adult: session.adult, occurredAt: new Date(parsed.at).toISOString(), soundOn: parsed.sound && choiceOf(session) === 'on', snapshotJson: JSON.stringify(parsed.snapshot) });
    json(res, 200, createReply(cries.get(parsed.id)!, session));
  }

  // The reason a clip was refused, in the order a parent can act on it.
  function whyRefused(row: CryRow | null, session: Session): HttpError {
    if (!row) return new HttpError(404, 'Cry not found.');
    if (row.deletedAt) return new HttpError(410, 'This cry was deleted.');
    if (row.clipState === 'kept') return new HttpError(409, 'This cry has a clip.');
    if (row.adult !== session.adult) return new HttpError(403, 'Only the adult who tapped can add the clip.');
    if (row.clipState !== 'none') return new HttpError(403, 'This cry takes no clip.');
    if (!row.soundOn || choiceOf(session) !== 'on') return new HttpError(403, 'Sound is off for this cry.');
    if (row.occurredAt < new Date(now() - 15 * MINUTE).toISOString()) return new HttpError(403, 'This cry is too old for a clip.');
    return new HttpError(403, 'The clip store is full. Delete sound clips in Settings.');
  }

  async function putClip({ req, res, session, id }: Ctx) {
    const wav = await body(req, MAX_CLIP_BYTES);
    const info = wavInfo(wav), capture = captureOf(req.headers['x-cry-capture']);
    const clipJson = JSON.stringify({ bytes: wav.length, durationMs: info.durationMs, startMs: capture.startMs, sampleRate: info.sampleRate, end: capture.end, peak: info.peak, clipped: info.clipped, capture: capture.capture });
    const saved = cries.putClip({ id, adult: session.adult, clip: wav, clipJson, notBefore: new Date(now() - 15 * MINUTE).toISOString(), soundScope: scopeOf(session) });
    if (!saved) throw whyRefused(cries.get(id), session);
    json(res, 200, { id, clipState: 'kept' });
  }

  // The route needs the add right. The answer, the noisy mark and Skip need the change right, checked here before the lookup.
  // The rating, the row tap and the no-clip word belong to the adult of the cry.
  async function patch({ req, res, session, id }: Ctx) {
    const input = await jsonBody(req);
    onlyKeys(input, [...OLD_FIELDS, ...MARK_FIELDS], 'The cry change has a field that is not known.');
    const old = OLD_FIELDS.some(key => input[key] !== undefined);
    if (old) right(session, 'change');
    if (['noisy', 'skipped'].some(key => input[key] !== undefined && typeof input[key] !== 'boolean')) throw bad('Send noisy and skipped as true or false.');
    const answer = answerOf(input, session), mark = markOf(input);
    if (!answer && input.noisy === undefined && input.skipped === undefined && !mark) throw bad('Send an answer, a noisy mark or a Skip mark.');
    const row = found(id);
    const marked = mark ? saveMark(row, mark, session) : false;
    const patched = old ? cries.patch(id, { answer, noisy: input.noisy as boolean | undefined, skipped: input.skipped as boolean | undefined }) === 1 : false;
    json(res, 200, { ...publicCry(found(id)), changed: marked || patched });
  }

  type MarkInput = { distress?: number; rowTap?: { type: string; ms: number }; noClip?: string };
  function markOf(input: Obj): MarkInput | null {
    if (MARK_FIELDS.every(key => input[key] === undefined)) return null;
    const out: MarkInput = {};
    if (input.distress !== undefined) {
      if (input.distress !== 1 && input.distress !== 2 && input.distress !== 3) throw bad('Rate the cry 1, 2 or 3.');
      out.distress = input.distress;
    }
    if (input.rowTap !== undefined) out.rowTap = rowTapOf(input.rowTap);
    if (input.noClip !== undefined) {
      if (typeof input.noClip !== 'string' || !NO_CLIP.includes(input.noClip)) throw bad('The reason for no clip is not known.');
      out.noClip = input.noClip;
    }
    return out;
  }
  function rowTapOf(value: unknown): { type: string; ms: number } {
    const message = 'The row tap is not valid.';
    if (!isObj(value)) throw bad(message);
    onlyKeys(value, ['type', 'ms'], message);
    const ms = value.ms;
    if (typeof value.type !== 'string' || !ROWS.includes(value.type) || typeof ms !== 'number' || !Number.isInteger(ms) || ms < 0 || ms > ROW_TAP_MAX_MS) throw bad(message);
    return { type: value.type, ms };
  }
  // Refusals first, then one write. A second row tap is no refusal: it changes nothing.
  function saveMark(row: CryRow, mark: MarkInput, session: Session): boolean {
    if (row.adult !== session.adult) throw new HttpError(403, 'Only the adult who tapped can change this.');
    const notBefore = new Date(now() - 15 * MINUTE).toISOString();
    if (mark.distress !== undefined && row.occurredAt < notBefore) throw new HttpError(403, 'The rating closes 15 minutes after the tap.');
    if (mark.noClip !== undefined && row.clipState !== 'none') throw new HttpError(409, 'This cry takes no reason for a missing clip.');
    const before = JSON.stringify(cries.marks(row.id));
    cries.mark(row.id, {
      ...(mark.distress === undefined ? {} : { distress: { value: mark.distress, at: new Date(now()).toISOString(), notBefore } }),
      ...(mark.rowTap ? { rowTap: mark.rowTap } : {}), ...(mark.noClip ? { noClip: mark.noClip } : {}),
    });
    return JSON.stringify(cries.marks(row.id)) !== before;
  }

  // An answer is one of the seven words. An empty answer needs `was`, the answer that it removes.
  function answerOf(input: Obj, session: Session) {
    const value = input.stoppedBy;
    if (value === undefined) { if (input.was !== undefined) throw bad('Send was only with an empty answer.'); return undefined; }
    if (value === '') {
      if (typeof input.was !== 'string' || !ANSWERS.includes(input.was)) throw bad('Send the answer that Undo removes.');
      return { value: null, at: null, by: null, was: input.was };
    }
    if (typeof value !== 'string' || !ANSWERS.includes(value) || input.was !== undefined) throw bad('Choose one of the seven answers.');
    return { value, at: new Date(now()).toISOString(), by: session.adult };
  }

  function list({ res, url, session }: Ctx) {
    const choice = choiceOf(session);
    if (url.searchParams.get('home') === '1') {
      const current = now();
      return json(res, 200, { ask: cries.ask(new Date(current - 12 * 60 * MINUTE).toISOString(), new Date(current - 10 * MINUTE).toISOString()), sound: choice });
    }
    json(res, 200, { cries: cries.list().map(publicCry), count: cries.count(), goal: GOAL, sound: choice });
  }

  function sendClip({ res, id }: Ctx) {
    found(id);
    const clip = cries.clipBytes(id);
    if (!clip) throw new HttpError(404, 'This cry has no clip.');
    res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': String(clip.length), 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, nofollow' });
    res.end(clip);
  }

  function deleteClip({ res, id }: Ctx) {
    const row = found(id);
    const changed = cries.clearClip(id);
    json(res, 200, { id, clipState: changed ? 'deleted' : row.clipState });
  }

  function deleteCry({ res, id }: Ctx) {
    found(id);
    cries.deleteCry(id, new Date(now()).toISOString());
    json(res, 200, { id, deleted: true });
  }

  function deleteAllClips({ res }: Ctx) { json(res, 200, { changed: cries.clearAllClips() }); }

  async function saveSound({ req, res, session }: Ctx) {
    const input = await jsonBody(req);
    onlyKeys(input, ['sound'], 'Choose on or off.');
    if (input.sound !== 'on' && input.sound !== 'off') throw bad('Choose on or off.');
    store.putSetting(scopeOf(session), 'crySound', input.sound);
    json(res, 200, { sound: input.sound });
  }

  const routes: Route[] = [
    { method: 'POST', path: /^\/api\/cries$/, right: 'add', run: create },
    { method: 'GET', path: /^\/api\/cries$/, right: 'view', run: list },
    { method: 'PUT', path: /^\/api\/cries\/sound$/, right: 'add', run: saveSound },
    { method: 'DELETE', path: /^\/api\/cries\/clips$/, right: 'change', run: deleteAllClips },
    { method: 'PUT', path: new RegExp(`^/api/cries/${ID}/clip$`, 'i'), right: 'add', run: putClip },
    { method: 'GET', path: new RegExp(`^/api/cries/${ID}/clip$`, 'i'), right: 'view', run: sendClip },
    { method: 'DELETE', path: new RegExp(`^/api/cries/${ID}/clip$`, 'i'), right: 'change', run: deleteClip },
    { method: 'PATCH', path: new RegExp(`^/api/cries/${ID}$`, 'i'), right: 'add', run: patch },
    { method: 'DELETE', path: new RegExp(`^/api/cries/${ID}$`, 'i'), right: 'change', run: deleteCry },
  ];

  // The two passages that the Crying screen links, in both languages. A session is all that this route needs.
  function passages(res: ServerResponse) {
    const pick = (spanish: boolean) => careGuidance(spanish).filter(item => PASSAGES.includes(item.id));
    json(res, 200, { en: pick(false), es: pick(true) });
  }

  async function handle(req: IncomingMessage, res: ServerResponse, url: URL, session: Session): Promise<void> {
    const method = req.method || '';
    if (url.pathname === '/api/care-passages' && method === 'GET') return passages(res);
    for (const route of routes) {
      const match = method === route.method ? route.path.exec(url.pathname) : null;
      if (!match) continue;
      right(session, route.right);
      return route.run({ req, res, url, session, id: (match[1] || '').toLowerCase() });
    }
    throw new HttpError(404, 'This action is not available.');
  }

  return { handle };
}
