import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRecords } from '../server/records.ts';
import { openStore } from '../server/store.ts';

const dir = mkdtempSync(join(tmpdir(), 'little-days-browser-permissions-'));
const store = openStore(join(dir, 'sidecar.sqlite'));
const caregiver = { sessionId: 'G'.repeat(43), csrfToken: 'D'.repeat(43), adult: 'Wren' };
const models = ['child', 'feeding', 'pumping', 'diaperchange', 'sleep', 'medication', 'note', 'temperature', 'weight', 'height', 'headcircumference', 'tummytime', 'timer'];
const grants = models.flatMap(model => ['view', 'add', 'change', ...(model === 'timer' ? ['delete'] : [])].map(action => `core.${action}_${model}`));
try {
  const adult = { sessionId: 'A'.repeat(43), csrfToken: 'B'.repeat(43), adult: 'Rowan' };
  store.createSession({ ...adult, babyBuddyUserId: 17, expiresAt: Date.now() + 60_000 });
  store.putSetting('user:17', 'permissions', grants);
  store.putSetting('user:17', 'timerDeletePermission', true);
  store.createSession({ ...caregiver, babyBuddyUserId: 18, expiresAt: Date.now() + 60_000 });
  store.putSetting('user:18', 'permissions', grants.filter(permission => permission !== 'core.delete_timer'));
  store.putSetting('user:18', 'timerDeletePermission', false);
  const records = createRecords({ store, sessions: { request: async () => [] } });
  const adultState = await records.state(adult);
  const caregiverState = await records.state(caregiver);
  process.stdout.write(JSON.stringify({ adult: adultState.permissions, caregiver: caregiverState.permissions }));
} finally {
  store.close();
  rmSync(dir, { recursive: true, force: true });
}
