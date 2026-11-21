import type { DatabaseSync } from 'node:sqlite';

// Data access for the table `cries`. Each write is one SQL statement.
// A list or lookup names its columns and never reads `clip`; only `clipBytes` does.
export type ClipState = 'none' | 'kept' | 'deleted' | 'closed';
export type CryRow = {
  id: string; adult: string | null; occurredAt: string; soundOn: boolean; stoppedBy: string | null;
  skipped: boolean; clipState: ClipState; noisy: boolean; deletedAt: string | null;
};
export type CryListRow = CryRow & { clipMs: number | null };
type Answer = { value: string | null; at: string | null; by: string | null; was?: string };
type Patch = { answer?: Answer; noisy?: boolean; skipped?: boolean };

// The fields of the method fixes (plans/2026-11-20-crying-method-fixes.md). No list or reply reads them.
export type CryMarks = { distress: number | null; distressAt: string | null; rowTap: string | null; rowTapMs: number | null; noClip: string | null };
type Mark = { distress?: { value: number; at: string; notBefore: string }; rowTap?: { type: string; ms: number }; noClip?: string };

export const CLIP_LIMIT = 400;

// The columns that the method fixes add, one time, after a check of the column list. A build before them names
// its columns in each statement, so it runs on the changed table.
const ADDED: [string, string][] = [['distress', 'INTEGER'], ['distress_at', 'TEXT'], ['row_tap', 'TEXT'], ['row_tap_ms', 'INTEGER'], ['no_clip', 'TEXT']];
export function addCryColumns(db: DatabaseSync): void {
  const have = new Set((db.prepare('PRAGMA table_info(cries)').all() as { name: string }[]).map(column => column.name));
  for (const [name, type] of ADDED) if (!have.has(name)) db.exec(`ALTER TABLE cries ADD COLUMN ${name} ${type}`);
}

const COLUMNS = 'id, adult, occurred_at, sound_on, stopped_by, skipped, clip_state, noisy, deleted_at';
// A cry counts when it has a kept clip that is not noisy and an answer other than "Nothing worked".
const COUNTED = "deleted_at IS NULL AND clip_state = 'kept' AND noisy = 0 AND stopped_by IS NOT NULL AND stopped_by != 'nothing'";

function decode(row: Record<string, unknown>): CryRow {
  return {
    id: String(row.id), adult: row.adult == null ? null : String(row.adult), occurredAt: String(row.occurred_at),
    soundOn: row.sound_on === 1, stoppedBy: row.stopped_by == null ? null : String(row.stopped_by),
    skipped: row.skipped === 1, clipState: row.clip_state as ClipState, noisy: row.noisy === 1,
    deletedAt: row.deleted_at == null ? null : String(row.deleted_at),
  };
}

export function createCryStore(db: DatabaseSync) {
  return {
    get(id: string): CryRow | null {
      const row = db.prepare(`SELECT ${COLUMNS} FROM cries WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
      return row ? decode(row) : null;
    },
    // A second insert with the same id changes nothing.
    insert(input: { id: string; adult: string; occurredAt: string; soundOn: boolean; snapshotJson: string }): number {
      return Number(db.prepare(`INSERT INTO cries (id, adult, occurred_at, sound_on, snapshot_json) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING`).run(input.id, input.adult, input.occurredAt, input.soundOn ? 1 : 0, input.snapshotJson).changes);
    },
    // The clip is saved only when every clip condition holds in the same statement:
    // clip state none, the adult of the cry, sound_on 1, the sound choice still `on`, a tap under 15 minutes old, and room in the table.
    putClip(input: { id: string; adult: string; clip: Uint8Array; clipJson: string; notBefore: string; soundScope: string }): number {
      return Number(db.prepare(`UPDATE cries SET clip = ?, clip_json = ?, clip_state = 'kept', no_clip = NULL
        WHERE id = ? AND deleted_at IS NULL AND clip_state = 'none' AND adult = ? AND sound_on = 1 AND occurred_at >= ?
        AND EXISTS (SELECT 1 FROM settings WHERE scope = ? AND key = 'crySound' AND value_json = '"on"')
        AND (SELECT COUNT(*) FROM cries WHERE clip_state = 'kept') < ?`)
        .run(input.clip, input.clipJson, input.id, input.adult, input.notBefore, input.soundScope, CLIP_LIMIT).changes);
    },
    clipBytes(id: string): Buffer | null {
      const row = db.prepare("SELECT clip FROM cries WHERE id = ? AND deleted_at IS NULL AND clip_state = 'kept'").get(id) as { clip?: Uint8Array } | undefined;
      return row?.clip ? Buffer.from(row.clip) : null;
    },
    // With `was`, the answer changes only if it is still `was`; otherwise nothing changes.
    patch(id: string, patch: Patch): number {
      const sets: string[] = [], args: (string | number | null)[] = [];
      if (patch.answer) { sets.push('stopped_by = ?', 'labeled_at = ?', 'labeled_by = ?'); args.push(patch.answer.value, patch.answer.at, patch.answer.by); }
      if (patch.noisy !== undefined) { sets.push('noisy = ?'); args.push(patch.noisy ? 1 : 0); }
      if (patch.skipped !== undefined) { sets.push('skipped = ?'); args.push(patch.skipped ? 1 : 0); }
      const guard = patch.answer?.was === undefined ? '' : ' AND stopped_by IS ?';
      if (patch.answer?.was !== undefined) args.push(id, patch.answer.was); else args.push(id);
      return Number(db.prepare(`UPDATE cries SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL${guard}`).run(...args).changes);
    },
    // A cry with no clip yet becomes `deleted` too, so an upload that is still on its way is refused.
    clearClip(id: string): number {
      return Number(db.prepare("UPDATE cries SET clip = NULL, clip_json = NULL, clip_state = 'deleted' WHERE id = ? AND deleted_at IS NULL AND clip_state IN ('none', 'kept')").run(id).changes);
    },
    // A deleted cry keeps only id, occurred_at and deleted_at. The other columns are emptied (flags reset, clip_state `deleted`).
    deleteCry(id: string, at: string): number {
      return Number(db.prepare(`UPDATE cries SET adult = NULL, sound_on = 0, snapshot_json = NULL, stopped_by = NULL, labeled_at = NULL, labeled_by = NULL,
        skipped = 0, clip_state = 'deleted', clip = NULL, clip_json = NULL, noisy = 0,
        distress = NULL, distress_at = NULL, row_tap = NULL, row_tap_ms = NULL, no_clip = NULL, deleted_at = ? WHERE id = ? AND deleted_at IS NULL`).run(at, id).changes);
    },
    marks(id: string): CryMarks | null {
      const row = db.prepare('SELECT distress, distress_at, row_tap, row_tap_ms, no_clip FROM cries WHERE id = ? AND deleted_at IS NULL').get(id) as Record<string, unknown> | undefined;
      if (!row) return null;
      const text = (value: unknown) => value == null ? null : String(value), count = (value: unknown) => value == null ? null : Number(value);
      return { distress: count(row.distress), distressAt: text(row.distress_at), rowTap: text(row.row_tap), rowTapMs: count(row.row_tap_ms), noClip: text(row.no_clip) };
    },
    // One statement. Each field holds its own condition, so a late write changes nothing:
    // the rating only while the tap is under 15 minutes old, the first row tap only, the no-clip word only while there is no clip.
    mark(id: string, mark: Mark): number {
      const sets: string[] = [], args: (string | number)[] = [];
      if (mark.distress) {
        sets.push('distress = CASE WHEN occurred_at >= ? THEN ? ELSE distress END', 'distress_at = CASE WHEN occurred_at >= ? THEN ? ELSE distress_at END');
        args.push(mark.distress.notBefore, mark.distress.value, mark.distress.notBefore, mark.distress.at);
      }
      if (mark.rowTap) {
        sets.push('row_tap_ms = CASE WHEN row_tap IS NULL THEN ? ELSE row_tap_ms END', 'row_tap = COALESCE(row_tap, ?)');
        args.push(mark.rowTap.ms, mark.rowTap.type);
      }
      if (mark.noClip) { sets.push("no_clip = CASE WHEN clip_state = 'none' THEN ? ELSE no_clip END"); args.push(mark.noClip); }
      if (!sets.length) return 0;
      return Number(db.prepare(`UPDATE cries SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`).run(...args, id).changes);
    },
    // One statement: kept becomes deleted, none becomes closed, and every clip is emptied. Answers stay.
    clearAllClips(): number {
      return Number(db.prepare(`UPDATE cries SET clip = NULL, clip_json = NULL,
        clip_state = CASE clip_state WHEN 'kept' THEN 'deleted' ELSE 'closed' END
        WHERE deleted_at IS NULL AND clip_state IN ('none', 'kept')`).run().changes);
    },
    list(): CryListRow[] {
      return (db.prepare(`SELECT ${COLUMNS}, json_extract(clip_json, '$.durationMs') AS clip_ms FROM cries WHERE deleted_at IS NULL ORDER BY occurred_at DESC, id`).all() as Record<string, unknown>[])
        .map(row => ({ ...decode(row), clipMs: typeof row.clip_ms === 'number' ? row.clip_ms : null }));
    },
    count(): number { return Number((db.prepare(`SELECT COUNT(*) AS n FROM cries WHERE ${COUNTED}`).get() as { n: number }).n); },
    // Skip dismisses older Home questions too; those cries remain in Past cries.
    ask(from: string, to: string): { id: string; occurredAt: string } | null {
      const row = db.prepare(`SELECT id, occurred_at FROM cries WHERE deleted_at IS NULL AND stopped_by IS NULL AND skipped = 0
        AND occurred_at > COALESCE((SELECT MAX(occurred_at) FROM cries WHERE deleted_at IS NULL AND skipped = 1), '')
        AND occurred_at >= ? AND occurred_at <= ? ORDER BY occurred_at DESC, id LIMIT 1`).get(from, to) as Record<string, unknown> | undefined;
      return row ? { id: String(row.id), occurredAt: String(row.occurred_at) } : null;
    },
  };
}

export type CryStore = ReturnType<typeof createCryStore>;
