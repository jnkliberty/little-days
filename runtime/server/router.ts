import { HttpError, json, jsonBody } from './http.ts';
import { logRefusal, photoForm } from './photos.ts';
import type { DomainHandler, Session } from './app.ts';
import type { Store } from './store.ts';
import type { createRecords } from './records.ts';
import type { createTimers } from './timers.ts';
import type { createPhotos } from './photos.ts';
import type { createHousehold } from './household.ts';
import type { createCare } from './care.ts';
import type { createAI } from './ai.ts';

type Services = {store: Store; records: ReturnType<typeof createRecords>; timers: ReturnType<typeof createTimers>; photos: ReturnType<typeof createPhotos>; household: ReturnType<typeof createHousehold>; care: ReturnType<typeof createCare>; ai?: ReturnType<typeof createAI>};

export function createRouter({store, records, timers, photos, household, care, ai}: Services) {
  async function state(session: Session, url?: URL) {
    const from = url?.searchParams.get('from'), to = url?.searchParams.get('to');
    const base = await household.state(session, from && to ? {from, to} : undefined);
    const active = base.child ? await timers.active(session) : {};
    const pendingOperations = store.pendingOperations(session.adult).map(op => {
      const metadata = op.metadata as Record<string, unknown> | null;
      const event = op.requestBody as Record<string, unknown> | null;
      return {operationId: op.id, status: op.state, ...(metadata?.action === 'auto-stop' ? {action: 'auto-stop', eventSaved: !!op.babyBuddyId} : {}), ...(op.resource === 'timers' && op.state === 'pending' && typeof metadata?.deadline === 'number' ? {undoUntil: new Date(metadata.deadline).toISOString()} : {}), ...(metadata?.correctionRequired && typeof event?.start === 'string' ? {correctionRequired: true, timerId: metadata.timerId, start: event.start, maxEnd: new Date(Date.parse(event.start) + 86400000).toISOString()} : {})};
    });
    return {...base, ...active, pendingOperations};
  }
  async function result(session: Session, value: Record<string, unknown>, operationId?: unknown) {
    const envelope = {...value, operationId: value.operationId || value.pendingOperation || operationId};
    if (!['saved', 'cancelled'].includes(String(value.status))) return envelope;
    // A failed refresh must not turn a confirmed write into a fresh write on retry.
    try { return {...envelope, state: await state(session)}; }
    catch { return envelope; }
  }
  async function operation(session: Session, id: string) {
    const op = store.getOperation(id);
    const sharedChild = op?.resource === 'children';
    if (!op || (op.adult !== session.adult && !sharedChild)) throw new HttpError(404, 'Save not found.');
    if (op.resource === 'photo' || op.resource === 'portrait') return result(session, await photos.operation(session, id));
    const value = op.resource === 'timers' ? await timers.operation(session, id) : await records.operation(session, id);
    return result(session, value, sharedChild ? id : undefined);
  }
  const handle: DomainHandler = async (req, res, url, session) => {
    const path = url.pathname, method = req.method;
    if (path === '/api/development' && method === 'POST') {
      const input = await jsonBody(req);
      if (Object.keys(input).length) throw new HttpError(400,'No development input is needed.');
      if (!ai) throw new HttpError(503,'Development facts are unavailable.');
      return json(res,200,await ai.dailyDevelopment(session));
    }
    if (path === '/api/ai/status' && method === 'GET') return json(res, 200, ai?.status() || {available: false, provider: null, dailyDevelopment: false});
    if (path === '/api/ai/chat' && method === 'POST') {
      const input = await jsonBody(req);
      if (!ai) throw new HttpError(503, input.lang === 'es' ? 'Preguntar a IA no está disponible.' : 'Ask AI is unavailable.');
      return json(res, 200, await ai.chat(session, input));
    }
    if (path === '/api/state' && method === 'GET') return json(res, 200, await state(session, url));
    if (path === '/api/foods' && method === 'GET') return json(res, 200, await records.foods(session));
    if (path === '/api/growth' && method === 'GET') return json(res, 200, await records.growth(session));
    if (path === '/api/care' && method === 'GET') return json(res, 200, care.list(session));
    if (path === '/api/care/confirmations' && method === 'POST') return json(res, 200, care.confirm(session, await jsonBody(req)));
    const confirmation = /^\/api\/care\/confirmations\/([^/]+)\/revoke$/.exec(path);
    if (confirmation && method === 'POST') return json(res, 200, care.revoke(session, decodeURIComponent(confirmation[1]), await jsonBody(req)));
    if (path === '/api/care/export-opt-in' && method === 'PUT') return json(res, 200, care.setOptIn(session, await jsonBody(req)));
    if (path === '/api/export' && method === 'GET') {
      const csv = await household.exportCsv(session, {from: url.searchParams.get('from') || '', to: url.searchParams.get('to') || ''});
      res.writeHead(200, {'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store', 'content-disposition': 'attachment; filename="little-days.csv"', 'x-content-type-options': 'nosniff'});
      res.end(csv);
      return;
    }
    if (path === '/api/child/portrait' && method === 'GET') return photos.send(session, res);
    const photo = /^\/api\/photos\/([^/]+)$/.exec(path);
    if (photo && method === 'GET') return photos.send(session, res, decodeURIComponent(photo[1]));
    if ((path === '/api/photos' && method === 'POST') || (path === '/api/child/portrait' && method === 'PUT')) {
      try {
        const data = await photoForm(req);
        return json(res, 200, await result(session, await photos.upload(session, data, method === 'PUT'), data.operationId));
      } catch (error) { logRefusal(error); throw error; }
    }
    const op = /^\/api\/operations\/([0-9a-f-]+)(\/(?:undo|correct|confirm-sleep))?$/i.exec(path);
    if (op && method === 'GET' && !op[2]) return json(res, 200, await operation(session, op[1]));
    if (op && method === 'POST' && op[2] === '/confirm-sleep') return json(res, 200, await result(session, await timers.confirmInterruption(session, op[1]), op[1]));
    if (op && method === 'POST' && op[2] === '/undo') return json(res, 200, await result(session, await timers.undo(session, op[1]), op[1]));
    if (op && method === 'POST' && op[2] === '/correct') return json(res, 200, await result(session, await timers.correct(session, op[1], await jsonBody(req)), op[1]));
    const data = await jsonBody(req);
    const saved = await mutation(session, path, String(method), data);
    return json(res, 200, await result(session, saved, data.operationId));
  };
  async function mutation(session: Session, path: string, method: string, data: Record<string, any>): Promise<Record<string, unknown>> {
    if (path === '/api/children' && method === 'POST') return records.createChild(session, data);
    if (path === '/api/events' && method === 'POST') return timers.createEvent(session, data as any);
    if (path === '/api/timers' && method === 'POST') return timers.start(session, data as any);
    if (path === '/api/preferences' && method === 'PATCH') return household.savePreference(session, data);
    if (path === '/api/duty' && method === 'POST') return household.saveDuty(session, data);
    if (path === '/api/reminders' && method === 'POST') return household.saveReminder(session, data);
    const reminder = /^\/api\/reminders\/([^/]+)$/.exec(path);
    if (reminder && method === 'PATCH') return household.saveReminder(session, data, decodeURIComponent(reminder[1]));
    const event = /^\/api\/events\/([^/]+)$/.exec(path);
    const split = /^\/api\/events\/([^/]+)\/split$/.exec(path);
    if (split && method === 'POST') return records.splitEvent(session, decodeURIComponent(split[1]), data as any);
    if (event && method === 'PATCH') return records.updateEvent(session, decodeURIComponent(event[1]), data as any);
    if (event && method === 'DELETE') return records.deleteEvent(session, decodeURIComponent(event[1]), data as any);
    if (path === '/api/timers/sleep/resume' && method === 'POST') return timers.resume(session, data as any);
    if (path === '/api/timers/sleep/end' && method === 'POST') return timers.endPaused(session, data as any);
    const timer = /^\/api\/timers\/(\d+)\/(stop|switch|start-time|side|pause|discard)$/.exec(path);
    if (timer && method === 'POST' && timer[2] === 'pause') return timers.pause(session, timer[1], data as any);
    if (timer && method === 'POST' && timer[2] === 'discard') return timers.discard(session, timer[1], data as any);
    if (timer && method === 'POST' && timer[2] === 'side') return timers.changeSide(session, timer[1], data as any);
    if (timer && method === 'POST' && timer[2] === 'start-time') return timers.changeStart(session, timer[1], data as any);
    if (timer && method === 'POST') return timer[2] === 'stop' ? timers.stop(session, timer[1], data as any) : timers.switchSide(session, timer[1], data as any);
    throw new HttpError(404, 'This action is not available.');
  }
  return {handle, state};
}
