import { createHash } from 'node:crypto';
import { chmodSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export type SessionInput = {
  sessionId: string;
  csrfToken: string;
  adult: string;
  babyBuddyUserId: number;
  expiresAt: number;
};

export type StoredSession = {
  adult: string;
  babyBuddyUserId: number;
  csrfHash: string;
  expiresAt: number;
};

export type OperationInput = {
  id: string;
  adult: string;
  resource: string;
  intent: unknown;
  requestBody: unknown;
  metadata: unknown;
};

export type Operation = OperationInput & {
  state: 'pending' | 'finishing' | 'saved' | 'failed' | 'cancelled';
  babyBuddyId: string | null;
  babyBuddyIds: string[];
  createdAt: number;
  updatedAt: number;
};

type MetadataInput = { resource: string; babyBuddyId: string; adult: string; metadata: unknown };
type AppEventInput = { id: string; adult: string; kind: string; occurredAt: string; details: unknown };
type AppEvent = AppEventInput;
export type CareAction = { revision: string; userId: number; operationId: string; action: 'confirm' | 'revoke' | 'opt_in'; confirmationId: string | null; value: unknown; createdAt: string };

export function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function canonical(value: unknown): string {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function parseJson(value: string): unknown {
  return JSON.parse(value);
}

export function openStore(path: string) {
  const db = new DatabaseSync(path);
  if (path !== ':memory:') chmodSync(path, 0o600);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS sessions (
      id_hash TEXT PRIMARY KEY,
      csrf_hash TEXT NOT NULL,
      adult TEXT NOT NULL,
      babybuddy_user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS operations (
      id TEXT PRIMARY KEY,
      adult TEXT NOT NULL,
      resource TEXT NOT NULL,
      intent_json TEXT NOT NULL,
      request_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('pending','finishing','saved','failed','cancelled')),
      babybuddy_id TEXT,
      babybuddy_ids_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS event_metadata (
      resource TEXT NOT NULL,
      babybuddy_id TEXT NOT NULL,
      adult TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      PRIMARY KEY (resource, babybuddy_id)
    );
    CREATE TABLE IF NOT EXISTS app_events (
      id TEXT PRIMARY KEY,
      adult TEXT NOT NULL,
      kind TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      details_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      scope TEXT NOT NULL,
      key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      PRIMARY KEY (scope, key)
    );
    CREATE TABLE IF NOT EXISTS care_actions (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      operation_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('confirm','revoke','opt_in')),
      confirmation_id TEXT,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, operation_id)
    );
    CREATE TABLE IF NOT EXISTS duty_history (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_id TEXT NOT NULL UNIQUE,
      who TEXT NOT NULL,
      note TEXT NOT NULL,
      adult TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS app_events_occurred_at_idx ON app_events(occurred_at);
  `);
  const operationColumns = db.prepare('PRAGMA table_info(operations)').all() as { name: string }[];
  if (!operationColumns.some(column => column.name === 'babybuddy_ids_json')) {
    db.exec("ALTER TABLE operations ADD COLUMN babybuddy_ids_json TEXT NOT NULL DEFAULT '[]'");
    db.exec("UPDATE operations SET babybuddy_ids_json = json_array(babybuddy_id) WHERE babybuddy_id IS NOT NULL");
  }

  function decodeOperation(row: Record<string, unknown> | undefined): Operation | null {
    if (!row) return null;
    return {
      id: String(row.id), adult: String(row.adult), resource: String(row.resource),
      intent: parseJson(String(row.intent_json)), requestBody: parseJson(String(row.request_json)),
      metadata: parseJson(String(row.metadata_json)), state: row.state as Operation['state'],
      babyBuddyId: row.babybuddy_id == null ? null : String(row.babybuddy_id),
      babyBuddyIds: parseJson(String(row.babybuddy_ids_json ?? (row.babybuddy_id ? JSON.stringify([row.babybuddy_id]) : '[]'))) as string[],
      createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
    };
  }

  return {
    createSession(input: SessionInput): void {
      db.prepare('INSERT INTO sessions (id_hash, csrf_hash, adult, babybuddy_user_id, expires_at) VALUES (?, ?, ?, ?, ?)')
        .run(hashSecret(input.sessionId), hashSecret(input.csrfToken), input.adult, input.babyBuddyUserId, input.expiresAt);
    },
    getSession(sessionId: string): StoredSession | null {
      const row = db.prepare('SELECT adult, babybuddy_user_id, csrf_hash, expires_at FROM sessions WHERE id_hash = ?')
        .get(hashSecret(sessionId)) as Record<string, unknown> | undefined;
      if (!row) return null;
      return { adult: String(row.adult), babyBuddyUserId: Number(row.babybuddy_user_id), csrfHash: String(row.csrf_hash), expiresAt: Number(row.expires_at) };
    },
    liveSessionHashesForUser(userId: number): string[] {
      return (db.prepare('SELECT id_hash FROM sessions WHERE babybuddy_user_id = ? AND expires_at > ?').all(userId, Date.now()) as { id_hash: string }[]).map(row => row.id_hash);
    },
    deleteSession(sessionId: string): void {
      db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(hashSecret(sessionId));
    },
    // A new passcode and the end of every sign-in happen together or not at all.
    replacePasscode(record: unknown): void {
      db.exec('BEGIN IMMEDIATE');
      try { this.putSetting('app', 'passcode', record); db.prepare('DELETE FROM sessions').run(); db.exec('COMMIT'); }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    renewSession(sessionId: string, expiresAt: number): void {
      db.prepare('UPDATE sessions SET expires_at = ? WHERE id_hash = ?').run(expiresAt, hashSecret(sessionId));
    },
    setSessionCsrf(sessionId: string, csrfToken: string): void {
      db.prepare('UPDATE sessions SET csrf_hash = ? WHERE id_hash = ?').run(hashSecret(csrfToken), hashSecret(sessionId));
    },
    beginOperation(input: OperationInput): { created: boolean; operation: Operation } {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)) throw new Error('operation id must be a UUID');
      db.exec('BEGIN IMMEDIATE');
      try {
        const existing = decodeOperation(db.prepare('SELECT * FROM operations WHERE id = ?').get(input.id) as Record<string, unknown> | undefined);
        if (existing) {
          const same = existing.adult === input.adult && existing.resource === input.resource &&
            canonical(existing.intent) === canonical(input.intent) &&
            canonical(existing.requestBody) === canonical(input.requestBody) &&
            canonical(existing.metadata) === canonical(input.metadata);
          if (!same) throw new Error('operation id reused with different input');
          db.exec('COMMIT');
          return { created: false, operation: existing };
        }
        const now = Date.now();
        db.prepare(`INSERT INTO operations
          (id, adult, resource, intent_json, request_json, metadata_json, state, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
          .run(input.id, input.adult, input.resource, canonical(input.intent), canonical(input.requestBody), canonical(input.metadata), now, now);
        db.exec('COMMIT');
        return { created: true, operation: { ...input, state: 'pending', babyBuddyId: null, babyBuddyIds: [], createdAt: now, updatedAt: now } };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    getOperation(id: string): Operation | null {
      return decodeOperation(db.prepare('SELECT * FROM operations WHERE id = ?').get(id) as Record<string, unknown> | undefined);
    },
    listOperations(adult: string, resource: string, states?: Operation['state'][]): Operation[] {
      const filter = states?.length ? ` AND state IN (${states.map(() => '?').join(',')})` : '';
      return (db.prepare(`SELECT * FROM operations WHERE adult = ? AND resource = ?${filter} ORDER BY created_at, id`).all(adult, resource, ...(states ?? [])) as Record<string, unknown>[])
        .map(row => decodeOperation(row) as Operation);
    },
    pendingOperations(adult?: string): Operation[] {
      return (db.prepare("SELECT * FROM operations WHERE (? IS NULL OR adult = ?) AND state IN ('pending','finishing') ORDER BY created_at, id").all(adult ?? null, adult ?? null) as Record<string, unknown>[])
        .map(row => decodeOperation(row) as Operation);
    },
    timerStop(timerId: string): Operation | null {
      return decodeOperation(db.prepare(`SELECT * FROM operations WHERE resource = 'timers'
        AND state NOT IN ('cancelled','failed') AND json_extract(metadata_json, '$.action') IN ('stop','discard')
        AND json_extract(metadata_json, '$.timerId') = ? ORDER BY created_at DESC LIMIT 1`).get(timerId) as Record<string, unknown> | undefined);
    },
    hasTimerStop(timerId: string): boolean { return !!this.timerStop(timerId); },
    saveTimerSide(input: OperationInput, timer: MetadataInput): Operation {
      db.exec('BEGIN IMMEDIATE');
      try {
        const existing = this.getOperation(input.id);
        if (!existing) {
          const now = Date.now();
          db.prepare(`INSERT INTO operations
            (id, adult, resource, intent_json, request_json, metadata_json, state, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'saved', ?, ?)`)
            .run(input.id, input.adult, input.resource, canonical(input.intent), canonical(input.requestBody), canonical(input.metadata), now, now);
          this.putEventMetadata(timer);
        }
        db.exec('COMMIT');
        return this.getOperation(input.id)!;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    correctPendingOperation(id: string, requestBody: unknown, metadata: unknown): void {
      const result = db.prepare("UPDATE operations SET request_json = ?, metadata_json = ?, updated_at = ? WHERE id = ? AND state = 'pending'").run(canonical(requestBody), canonical(metadata), Date.now(), id);
      if (result.changes !== 1) throw new Error('This operation cannot be corrected.');
    },
    updateUnresolvedOperationMetadata(id: string, metadata: unknown): void {
      const result = db.prepare("UPDATE operations SET metadata_json = ?, updated_at = ? WHERE id = ? AND state IN ('pending','finishing')").run(canonical(metadata), Date.now(), id);
      if (result.changes !== 1) throw new Error('This operation is no longer unresolved.');
    },
    finishOperation(id: string, state: Operation['state'], babyBuddyId?: string, babyBuddyIds?: string[]): void {
      const current = decodeOperation(db.prepare('SELECT * FROM operations WHERE id = ?').get(id) as Record<string, unknown> | undefined);
      if (!current) throw new Error('operation not found');
      const transitions: Record<Operation['state'], Operation['state'][]> = {
        pending: ['finishing', 'saved', 'failed', 'cancelled'],
        finishing: ['finishing', 'saved', 'failed'],
        failed: ['finishing'], saved: [], cancelled: [],
      };
      if (!transitions[current.state].includes(state)) throw new Error('invalid operation state transition');
      const ids = babyBuddyIds ?? (babyBuddyId ? [...current.babyBuddyIds, babyBuddyId] : current.babyBuddyIds);
      db.prepare('UPDATE operations SET state = ?, babybuddy_id = COALESCE(?, babybuddy_id), babybuddy_ids_json = ?, updated_at = ? WHERE id = ?')
        .run(state, babyBuddyId ?? current.babyBuddyId ?? ids[0] ?? null, JSON.stringify([...new Set(ids)]), Date.now(), id);
    },
    completeTimerOperation(id: string, pause?: unknown, clearPauseId?: string): void {
      db.exec('BEGIN IMMEDIATE');
      try {
        if (pause !== undefined) this.putSetting('app', 'sleepPaused', pause);
        if (clearPauseId && (this.getSetting('app', 'sleepPaused') as {id?: string} | null)?.id === clearPauseId) this.putSetting('app', 'sleepPaused', null);
        this.finishOperation(id, 'saved');
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    putEventMetadata(input: MetadataInput): void {
      db.prepare(`INSERT INTO event_metadata (resource, babybuddy_id, adult, metadata_json) VALUES (?, ?, ?, ?)
        ON CONFLICT(resource, babybuddy_id) DO UPDATE SET adult = excluded.adult, metadata_json = excluded.metadata_json`)
        .run(input.resource, input.babyBuddyId, input.adult, canonical(input.metadata));
    },
    getEventMetadata(resource: string, babyBuddyId: string): { adult: string; metadata: unknown } | null {
      const row = db.prepare('SELECT adult, metadata_json FROM event_metadata WHERE resource = ? AND babybuddy_id = ?')
        .get(resource, babyBuddyId) as Record<string, unknown> | undefined;
      return row ? { adult: String(row.adult), metadata: parseJson(String(row.metadata_json)) } : null;
    },
    deleteEventMetadata(resource: string, babyBuddyId: string): void {
      db.prepare('DELETE FROM event_metadata WHERE resource = ? AND babybuddy_id = ?').run(resource, babyBuddyId);
    },
    putAppEvent(input: AppEventInput): void {
      db.prepare(`INSERT INTO app_events (id, adult, kind, occurred_at, details_json) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET adult = excluded.adult, kind = excluded.kind, occurred_at = excluded.occurred_at, details_json = excluded.details_json`)
        .run(input.id, input.adult, input.kind, input.occurredAt, canonical(input.details));
    },
    listAppEvents(from: string, to: string): AppEvent[] {
      return (db.prepare('SELECT id, adult, kind, occurred_at, details_json FROM app_events WHERE occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at')
        .all(from, to) as Record<string, unknown>[]).map(row => ({ id: String(row.id), adult: String(row.adult), kind: String(row.kind), occurredAt: String(row.occurred_at), details: parseJson(String(row.details_json)) }));
    },
    getAppEvent(id: string): AppEvent | null {
      const row = db.prepare('SELECT id, adult, kind, occurred_at, details_json FROM app_events WHERE id = ?').get(id) as Record<string, unknown> | undefined;
      return row ? { id: String(row.id), adult: String(row.adult), kind: String(row.kind), occurredAt: String(row.occurred_at), details: parseJson(String(row.details_json)) } : null;
    },
    deleteAppEvent(id: string): void { db.prepare('DELETE FROM app_events WHERE id = ?').run(id); },
    appendCareAction(input: { userId: number; operationId: string; action: CareAction['action']; confirmationId: string | null; value: unknown; createdAt: string }): { created: boolean; action: CareAction } {
      db.exec('BEGIN IMMEDIATE');
      try {
        const old = db.prepare('SELECT * FROM care_actions WHERE user_id = ? AND operation_id = ?').get(input.userId, input.operationId) as Record<string, unknown> | undefined;
        if (old) {
          if (old.action !== input.action || old.confirmation_id !== input.confirmationId || String(old.value_json) !== canonical(input.value)) throw new Error('care operation id reused with different input');
          db.exec('COMMIT');
          return { created: false, action: { revision: String(old.sequence), userId: Number(old.user_id), operationId: String(old.operation_id), action: old.action as CareAction['action'], confirmationId: old.confirmation_id == null ? null : String(old.confirmation_id), value: parseJson(String(old.value_json)), createdAt: String(old.created_at) } };
        }
        const result = db.prepare('INSERT INTO care_actions (user_id, operation_id, action, confirmation_id, value_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(input.userId, input.operationId, input.action, input.confirmationId, canonical(input.value), input.createdAt);
        db.exec('COMMIT');
        return { created: true, action: { revision: String(result.lastInsertRowid), ...input } };
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    listCareActions(userId: number): CareAction[] {
      return (db.prepare('SELECT * FROM care_actions WHERE user_id = ? ORDER BY sequence').all(userId) as Record<string, unknown>[]).map(row => ({ revision: String(row.sequence), userId: Number(row.user_id), operationId: String(row.operation_id), action: row.action as CareAction['action'], confirmationId: row.confirmation_id == null ? null : String(row.confirmation_id), value: parseJson(String(row.value_json)), createdAt: String(row.created_at) }));
    },
    appendDutyHistory(input: { operationId: string; who: string; note: string; adult: string; occurredAt: string }): void {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(`INSERT INTO settings (scope, key, value_json) VALUES ('app', 'duty', ?) ON CONFLICT(scope,key) DO UPDATE SET value_json=excluded.value_json`).run(canonical(input.who));
        db.prepare(`INSERT INTO settings (scope, key, value_json) VALUES ('app', 'dutyNote', ?) ON CONFLICT(scope,key) DO UPDATE SET value_json=excluded.value_json`).run(canonical(input.note));
        db.prepare(`INSERT INTO settings (scope, key, value_json) VALUES ('app', 'dutyNoteBy', ?) ON CONFLICT(scope,key) DO UPDATE SET value_json=excluded.value_json`).run(canonical(input.adult));
        db.prepare(`INSERT INTO settings (scope, key, value_json) VALUES ('app', 'dutyNoteAt', ?) ON CONFLICT(scope,key) DO UPDATE SET value_json=excluded.value_json`).run(canonical(input.occurredAt));
        db.prepare('INSERT INTO duty_history (operation_id, who, note, adult, occurred_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(operation_id) DO NOTHING').run(input.operationId, input.who, input.note, input.adult, input.occurredAt);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    listDutyHistory(): { operationId: string; who: string; note: string; adult: string; occurredAt: string }[] {
      return (db.prepare('SELECT operation_id, who, note, adult, occurred_at FROM duty_history ORDER BY sequence').all() as Record<string, unknown>[]).map(row => ({ operationId: String(row.operation_id), who: String(row.who), note: String(row.note), adult: String(row.adult), occurredAt: String(row.occurred_at) }));
    },
    getSetting(scope: string, key: string): unknown | null {
      if (!/^(app|user:\d{1,20})$/.test(scope) || !/^[A-Za-z0-9_-]{1,80}$/.test(key)) throw new Error('Invalid setting key');
      const row = db.prepare('SELECT value_json FROM settings WHERE scope = ? AND key = ?').get(scope, key) as Record<string, unknown> | undefined;
      return row ? parseJson(String(row.value_json)) : null;
    },
    putSetting(scope: string, key: string, value: unknown): void {
      if (!/^(app|user:\d{1,20})$/.test(scope) || !/^[A-Za-z0-9_-]{1,80}$/.test(key)) throw new Error('Invalid setting key');
      db.prepare(`INSERT INTO settings (scope, key, value_json) VALUES (?, ?, ?)
        ON CONFLICT(scope, key) DO UPDATE SET value_json = excluded.value_json`).run(scope, key, canonical(value));
    },
    close(): void { db.close(); },
  };
}

export type Store = ReturnType<typeof openStore>;
