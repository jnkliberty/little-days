import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createApp } from '../server/app.ts';

// Screen text names no adult and no child. The child's name comes from the setup form.
const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const words = app.slice(app.indexOf('const W = {'), app.indexOf('\nconst t = ')) + '\nconst t = (k, ...a) => { const v = W[k][S.lang === \'es\' ? 1 : 0]; return typeof v === \'function\' ? v(...a) : v; };';
const babyLine = app.split('\n').find(row => row.startsWith('const babyName=')) || '';
function screen(lang: 'en' | 'es', child: unknown = null) {
  const context = vm.createContext({ S: { lang, child } });
  vm.runInContext(`${words}\n${babyLine}\nglobalThis.t = t; globalThis.babyName = babyName;`, context);
  return context as any;
}

test('clean copy: the sign-in and setup screens carry no intro paragraph, and the messages keep only what happened and what to do', () => {
  for (const key of ['loginIntro', 'setupIntro']) {
    assert.equal(app.includes(`t('${key}')`), false, `no screen reads ${key}`);
    assert.equal(app.includes(`${key}:[`), false, `${key} was cut`);
  }
  assert.equal(screen('en').t('passcodeWrong'), 'That passcode is not right.');
  assert.equal(screen('es').t('passcodeWrong'), 'Ese código no es correcto.');
  assert.equal(screen('en').t('signInEnded'), 'Your sign-in ended. Enter the household passcode.');
  assert.equal(screen('es').t('signInEnded'), 'Su sesión terminó. Escriba el código de la casa.');
  assert.equal(screen('en').t('waitingProfile'), 'Waiting for an adult who can set up the baby profile.');
  assert.equal(screen('es').t('setupInvalid'), 'Escriba el nombre del bebé y una fecha de nacimiento de los últimos 3 años.');
});

test('the server and the screen give the same no-passcode message', () => {
  assert.equal(screen('en').t('passcodeNotSet'), 'This app has no passcode yet. Ask the person who set it up.');
  assert.equal((readFileSync(new URL('../server/app.ts', import.meta.url), 'utf8').match(/This app has no passcode yet\. Ask the person who set it up\./g) || []).length, 2);
});

test('the Photos heading uses the baby name that the household saved', () => {
  assert.equal(screen('en').t('photosT', 'Ada'), 'Photos of Ada');
  assert.equal(screen('es').t('photosT', 'Ada'), 'Fotos de Ada');
});

test('with no child saved the screens say "Baby", not a name', () => {
  assert.equal(screen('en').babyName(), 'Baby');
  assert.equal(screen('es').babyName(), 'Bebé');
  assert.equal(screen('en', { name: 'Ada' }).babyName(), 'Ada');
});

test('the lockout message points to an owner of the household, not to a person', async () => {
  const sessions: any = {
    issueLoginCsrf: () => 'csrf', people: () => ['a'], labels: () => ({}), get: () => null, passcodeSet: () => true, checkPasscode: async () => true,
    select: async () => { throw Object.assign(new Error('locked'), { locked: true }); },
  };
  const server = createApp({ sessions, origin: 'https://example.test', webDir: '.', domain: async () => {}, integration: async () => {} });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address: any = server.address();
  try {
    const reply = await fetch(`http://127.0.0.1:${address.port}/api/session`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://example.test', 'x-csrf-token': 'csrf' }, body: JSON.stringify({ username: 'a', passcode: 'any passcode' }) });
    assert.equal(reply.status, 429);
    assert.equal((await reply.json()).error, 'This account is locked after too many wrong passwords. Try again in 1 hour, or ask an owner of this household to unlock it.');
  } finally { server.close(); }
});

// D9: the care-hours screens show only when the link settings exist.
import { careLinkConfigured } from '../server/integration.ts';

test('the care link counts as present only with its token, subject, and account', () => {
  const full = { token: 'invented-service-token', subjectId: 'subject-1', userId: 17 };
  assert.equal(careLinkConfigured(full), true);
  for (const missing of ['token', 'subjectId', 'userId']) assert.equal(careLinkConfigured({ ...full, [missing]: undefined }), false, missing);
  assert.equal(careLinkConfigured({ ...full, subjectId: 'bad subject!' }), false);
  assert.equal(careLinkConfigured({ ...full, userId: 0 }), false);
  assert.equal(careLinkConfigured({}), false);
});

test('the session tells the browser whether the care link is configured', async () => {
  const sessions: any = { issueLoginCsrf: () => 'csrf', people: () => ['a'], labels: () => ({}), get: () => null, passcodeSet: () => true };
  for (const careLink of [true, false, undefined]) {
    const server = createApp({ sessions, origin: 'https://example.test', webDir: '.', domain: async () => {}, integration: async () => {}, ...(careLink === undefined ? {} : { careLink }) });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address: any = server.address();
    try { assert.equal((await (await fetch(`http://127.0.0.1:${address.port}/api/session`)).json()).careLink, careLink === true); }
    finally { server.close(); }
  }
});
