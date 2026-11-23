import { mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './store.ts';
import { createBabyBuddyClient } from './babybuddy.ts';
import { createSessionService } from './session.ts';
import { createRecords } from './records.ts';
import { createTimers } from './timers.ts';
import { createPhotos } from './photos.ts';
import { createRouter } from './router.ts';
import { createApp } from './app.ts';
import { createHousehold } from './household.ts';
import { createCare } from './care.ts';
import { createAI } from './ai.ts';
import { createAlerts } from './alerts.ts';
import { careLinkConfigured, createCareIntegration } from './integration.ts';
import { readTrustedAccounts } from './session.ts';

const origin = process.env.LITTLE_DAYS_ORIGIN;
const baseUrl = process.env.BABYBUDDY_URL;
if (!origin || !baseUrl) throw new Error('LITTLE_DAYS_ORIGIN and BABYBUDDY_URL are required.');
if (new URL(origin).protocol !== 'https:') throw new Error('The app requires HTTPS.');
process.umask(0o077);
const path = resolve(process.env.LITTLE_DAYS_DB || 'data/little-days.sqlite');
mkdirSync(dirname(path), {recursive: true, mode: 0o700});
const store = openStore(path);
const credentialPath = process.env.LITTLE_DAYS_CREDENTIALS_FILE;
if (!credentialPath) throw new Error('LITTLE_DAYS_CREDENTIALS_FILE is required.');
const people = store.getSetting('app', 'people');
let accounts;
try { accounts = readTrustedAccounts(readFileSync(credentialPath, 'utf8'), people); }
catch { throw new Error('Invalid household credentials file.'); }
const babyBuddy = createBabyBuddyClient({baseUrl});
const sessions = createSessionService({store, babyBuddy, accounts: accounts as {username: string; password: string}[]});
const passcodeOff = process.env.LITTLE_DAYS_PASSCODE === 'off';
const records = createRecords({store, sessions});
const alerts = createAlerts({store, sessions, pushContact: process.env.LITTLE_DAYS_PUSH_CONTACT, passcodeOff});
const timers = createTimers({store, sessions, records, onTakeOverSaved: (session, opId) => alerts.onWrite(session, opId)});
const photos = createPhotos({store, sessions, baseUrl});
const household = createHousehold({store, sessions, records, alertDelivery: (userId, enabled) => alerts.deliveryFor(userId, enabled)});
// An install with an existing care consumer sets LITTLE_DAYS_CARE_SOURCE to the value that consumer already reads.
const care = createCare({store, sessions, source: process.env.LITTLE_DAYS_CARE_SOURCE});
const ai = createAI({store, records});
const router = createRouter({store, records, timers, photos, household, care, ai, alerts});
const mappedUserId = process.env.LITTLE_DAYS_INTEGRATION_USER_ID && /^\d{1,20}$/.test(process.env.LITTLE_DAYS_INTEGRATION_USER_ID) ? Number(process.env.LITTLE_DAYS_INTEGRATION_USER_ID) : undefined;
const integration = createCareIntegration({care, sessions, token: process.env.LITTLE_DAYS_CARE_TOKEN, subjectId: process.env.INTEGRATION_SUBJECT_ID, userId: mappedUserId});
const webDir = fileURLToPath(new URL('../web/', import.meta.url));
const careLink = careLinkConfigured({token: process.env.LITTLE_DAYS_CARE_TOKEN, subjectId: process.env.INTEGRATION_SUBJECT_ID, userId: mappedUserId});
// Set LITTLE_DAYS_TRUST_PROXY=true only behind a reverse proxy that adds X-Forwarded-For; the passcode count uses that address.
// Set LITTLE_DAYS_PASSCODE=off only when the network itself keeps strangers out (for example a private tailnet): anyone who reaches the app can then choose an adult.
const app = createApp({sessions, origin, webDir, domain: router.handle, integration, careLink, ai: ai.status().available, trustProxy: process.env.LITTLE_DAYS_TRUST_PROXY === 'true', passcodeOff});
if (passcodeOff) console.warn('The household passcode is off (LITTLE_DAYS_PASSCODE=off). Anyone who reaches this app can sign in.');
else if (!sessions.passcodeSet()) console.warn('No household passcode is set. Nobody can sign in. Run deploy/set_passcode.sh.');
const port = Number(process.env.PORT || 18084);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid app port.');
alerts.start();
app.listen(port, process.env.HOST || '127.0.0.1', () => console.log('Little Days gateway started.'));
app.requestTimeout = 30000;
app.headersTimeout = 15000;
let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    void alerts.stop().finally(() => app.close(() => { store.close(); process.exit(0); }));
  });
}
