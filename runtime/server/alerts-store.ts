import type { DatabaseSync } from 'node:sqlite';
import type { AlertDelivery, AlertDue, AlertType, PushSubscriptionRecord } from './store.ts';

function parseJson(value: string): unknown {
  return JSON.parse(value);
}

export function initAlertTables(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      session_id_hash TEXT NOT NULL REFERENCES sessions(id_hash) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS push_subscriptions_session_idx ON push_subscriptions(session_id_hash);
    CREATE TABLE IF NOT EXISTS alerts_due (
      event_id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('reminder','medicine','nap','feed')),
      due_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      recipient INTEGER,
      name_key TEXT
    );
    CREATE INDEX IF NOT EXISTS alerts_due_window_idx ON alerts_due(due_at, expires_at);
    CREATE TABLE IF NOT EXISTS alert_deliveries (
      event_id TEXT NOT NULL REFERENCES alerts_due(event_id) ON DELETE CASCADE,
      schedule_id TEXT NOT NULL,
      babybuddy_user_id INTEGER NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('retry','sent')),
      attempts INTEGER NOT NULL DEFAULT 0,
      next_retry_at INTEGER NOT NULL DEFAULT 0,
      endpoint TEXT,
      session_id_hash TEXT,
      binding_updated_at INTEGER,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (event_id, schedule_id, babybuddy_user_id)
    );
  `);
}

function decodeAlertDue(row: Record<string, unknown> | undefined): AlertDue | null {
  if (!row) return null;
  return {
    eventId: String(row.event_id),
    scheduleId: String(row.schedule_id),
    type: row.type as AlertType,
    dueAt: Number(row.due_at),
    expiresAt: Number(row.expires_at),
    recipient: row.recipient == null ? null : Number(row.recipient),
    nameKey: row.name_key == null ? null : String(row.name_key),
  };
}

function decodeSubscription(row: Record<string, unknown>): PushSubscriptionRecord {
  return {
    endpoint: String(row.endpoint),
    p256dh: String(row.p256dh),
    auth: String(row.auth),
    sessionIdHash: String(row.session_id_hash),
    adult: String(row.adult),
    babyBuddyUserId: Number(row.babybuddy_user_id),
    sessionExpiresAt: Number(row.session_expires_at),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function decodeDelivery(row: Record<string, unknown> | undefined): AlertDelivery | null {
  if (!row) return null;
  return {
    eventId: String(row.event_id),
    scheduleId: String(row.schedule_id),
    babyBuddyUserId: Number(row.babybuddy_user_id),
    state: row.state as 'retry' | 'sent',
    attempts: Number(row.attempts),
    nextRetryAt: Number(row.next_retry_at),
    endpoint: row.endpoint == null ? null : String(row.endpoint),
    sessionIdHash: row.session_id_hash == null ? null : String(row.session_id_hash),
    bindingUpdatedAt: row.binding_updated_at == null ? null : Number(row.binding_updated_at),
    updatedAt: Number(row.updated_at),
  };
}

export function createAlertStore(db: DatabaseSync) {
  return {
    deleteExpiredSessions(nowMs: number): number {
      return Number(db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowMs).changes);
    },
    listLiveSessionsForUser(userId: number, nowMs = Date.now()): { idHash: string; adult: string; expiresAt: number }[] {
      const rows = db.prepare('SELECT id_hash, adult, expires_at FROM sessions WHERE babybuddy_user_id = ? AND expires_at > ? ORDER BY expires_at DESC')
        .all(userId, nowMs) as Record<string, unknown>[];
      return rows.map(row => ({ idHash: String(row.id_hash), adult: String(row.adult), expiresAt: Number(row.expires_at) }));
    },
    listSettingsByKey(key: string): { scope: string; value: unknown }[] {
      const rows = db.prepare('SELECT scope, value_json FROM settings WHERE key = ?').all(key) as Record<string, unknown>[];
      return rows.map(row => ({ scope: String(row.scope), value: parseJson(String(row.value_json)) }));
    },
    listEventMetadata(resource: string): { babyBuddyId: string; adult: string; metadata: unknown }[] {
      const rows = db.prepare('SELECT babybuddy_id, adult, metadata_json FROM event_metadata WHERE resource = ?').all(resource) as Record<string, unknown>[];
      return rows.map(row => ({ babyBuddyId: String(row.babybuddy_id), adult: String(row.adult), metadata: parseJson(String(row.metadata_json)) }));
    },
    upsertPushSubscription(input: { endpoint: string; p256dh: string; auth: string; sessionIdHash: string; nowMs: number }): { conflict: boolean } {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(input.nowMs);
        const existing = db.prepare('SELECT session_id_hash FROM push_subscriptions WHERE endpoint = ?')
          .get(input.endpoint) as { session_id_hash: string } | undefined;
        if (existing && existing.session_id_hash !== input.sessionIdHash) {
          db.exec('COMMIT');
          return { conflict: true };
        }
        db.prepare(`INSERT INTO push_subscriptions (endpoint, p256dh, auth, session_id_hash, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, updated_at = excluded.updated_at`)
          .run(input.endpoint, input.p256dh, input.auth, input.sessionIdHash, input.nowMs, input.nowMs);
        db.exec('COMMIT');
        return { conflict: false };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    deletePushSubscriptionForSession(endpoint: string, sessionIdHash: string): number {
      return Number(db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND session_id_hash = ?').run(endpoint, sessionIdHash).changes);
    },
    deleteExactPushSubscription(endpoint: string, sessionIdHash: string, updatedAt: number): number {
      return Number(db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND session_id_hash = ? AND updated_at = ?')
        .run(endpoint, sessionIdHash, updatedAt).changes);
    },
    listActivePushSubscriptions(nowMs: number, userId?: number): PushSubscriptionRecord[] {
      const sql = userId == null
        ? `SELECT p.endpoint, p.p256dh, p.auth, p.session_id_hash, p.created_at, p.updated_at, s.adult, s.babybuddy_user_id, s.expires_at AS session_expires_at
           FROM push_subscriptions p JOIN sessions s ON s.id_hash = p.session_id_hash
           WHERE s.expires_at > ? ORDER BY p.updated_at DESC, p.endpoint ASC`
        : `SELECT p.endpoint, p.p256dh, p.auth, p.session_id_hash, p.created_at, p.updated_at, s.adult, s.babybuddy_user_id, s.expires_at AS session_expires_at
           FROM push_subscriptions p JOIN sessions s ON s.id_hash = p.session_id_hash
           WHERE s.expires_at > ? AND s.babybuddy_user_id = ? ORDER BY p.updated_at DESC, p.endpoint ASC`;
      const rows = (userId == null ? db.prepare(sql).all(nowMs) : db.prepare(sql).all(nowMs, userId)) as Record<string, unknown>[];
      return rows.map(decodeSubscription);
    },
    getAlertDue(eventId: string): AlertDue | null {
      return decodeAlertDue(db.prepare('SELECT * FROM alerts_due WHERE event_id = ?').get(eventId) as Record<string, unknown> | undefined);
    },
    listAlertsDue(type?: AlertType): AlertDue[] {
      const rows = (type
        ? db.prepare('SELECT * FROM alerts_due WHERE type = ? ORDER BY due_at ASC, event_id ASC').all(type)
        : db.prepare('SELECT * FROM alerts_due ORDER BY due_at ASC, event_id ASC').all()) as Record<string, unknown>[];
      return rows.map(row => decodeAlertDue(row)!);
    },
    upsertAlertDue(input: AlertDue): void {
      db.prepare(`INSERT INTO alerts_due (event_id, schedule_id, type, due_at, expires_at, recipient, name_key)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id) DO UPDATE SET
          schedule_id = excluded.schedule_id,
          type = excluded.type,
          due_at = excluded.due_at,
          expires_at = excluded.expires_at,
          recipient = excluded.recipient,
          name_key = excluded.name_key`)
        .run(input.eventId, input.scheduleId, input.type, input.dueAt, input.expiresAt, input.recipient, input.nameKey);
    },
    deleteAlertDue(eventId: string): void {
      db.prepare('DELETE FROM alerts_due WHERE event_id = ?').run(eventId);
    },
    deleteAlertsDueByType(type: AlertType): void {
      db.prepare('DELETE FROM alerts_due WHERE type = ?').run(type);
    },
    pruneExpiredAlertsDue(nowMs: number): void {
      db.prepare('DELETE FROM alerts_due WHERE expires_at <= ?').run(nowMs);
    },
    getAlertDelivery(eventId: string, scheduleId: string, userId: number): AlertDelivery | null {
      const row = db.prepare('SELECT * FROM alert_deliveries WHERE event_id = ? AND schedule_id = ? AND babybuddy_user_id = ?')
        .get(eventId, scheduleId, userId) as Record<string, unknown> | undefined;
      return decodeDelivery(row);
    },
    upsertAlertDelivery(input: AlertDelivery): boolean {
      db.exec('BEGIN IMMEDIATE');
      try {
        const match = db.prepare('SELECT 1 FROM alerts_due WHERE event_id = ? AND schedule_id = ?').get(input.eventId, input.scheduleId);
        if (!match) {
          db.exec('COMMIT');
          return false;
        }
        db.prepare(`INSERT INTO alert_deliveries
          (event_id, schedule_id, babybuddy_user_id, state, attempts, next_retry_at, endpoint, session_id_hash, binding_updated_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(event_id, schedule_id, babybuddy_user_id) DO UPDATE SET
            state = excluded.state,
            attempts = excluded.attempts,
            next_retry_at = excluded.next_retry_at,
            endpoint = excluded.endpoint,
            session_id_hash = excluded.session_id_hash,
            binding_updated_at = excluded.binding_updated_at,
            updated_at = excluded.updated_at`)
          .run(
            input.eventId, input.scheduleId, input.babyBuddyUserId, input.state, input.attempts,
            input.nextRetryAt, input.endpoint, input.sessionIdHash, input.bindingUpdatedAt, input.updatedAt,
          );
        db.exec('COMMIT');
        return true;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
