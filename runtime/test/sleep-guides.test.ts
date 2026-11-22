import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const load = (path: string, ctx: Record<string, unknown>) =>
  vm.runInNewContext(readFileSync(new URL(path, import.meta.url), 'utf8'), ctx);

function loadGuides() {
  const ctx: Record<string, unknown> = {globalThis: null};
  ctx.globalThis = ctx;
  load('../web/trends.js', ctx);
  load('../web/cry.js', ctx);
  load('../web/forecast.js', ctx);
  load('../web/care-guidance.js', ctx);
  load('../web/sleep-guides.js', ctx);
  return ctx as {
    LittleDaysSleepGuides: any;
    LittleDaysCareGuidance: any;
  };
}

const TRUSTED_HOSTS = ['cdc.gov', 'healthychildren.org', 'nih.gov', 'nhs.uk', 'medlineplus.gov'];
const isTrustedUrl = (raw: string) => {
  const host = new URL(raw).hostname.toLowerCase();
  return TRUSTED_HOSTS.some(d => host === d || host.endsWith('.' + d));
};

// Group G4-1: Verbatim STOP 0 copy, trusted quotes/links, two languages, no copied safe sleep.
test('G4-1: every strategy and weekly step matches approved STOP 0 text verbatim with trusted links and both languages', () => {
  const {LittleDaysSleepGuides: SG} = loadGuides();
  const research = readFileSync(new URL('../../research/2026-11-21-age-norms.md', import.meta.url), 'utf8');
  const section = research.split('## Sleep plan text')[1].split('## Pages that failed to open')[0];
  const rows = section.split('\n').filter(l => l.startsWith('| ') && !l.startsWith('| #') && !l.startsWith('|---'));
  assert.equal(rows.length, 36, 'STOP 0 table has 20 strategies + 16 weekly steps');
  assert.equal(SG.BANDS.length, 4);

  const byBand = Object.fromEntries(SG.BANDS.map((b: any) => [b.id, b]));
  for (const band of SG.BANDS) {
    assert.equal(band.label.length, 2);
    assert.equal(band.strategies.length, 5);
    assert.equal(band.weeks.length, 4);
    for (const s of band.strategies) {
      assert.equal(s.text.length, 2);
      assert.ok(s.text[0].trim() && s.text[1].trim(), `${s.code} needs both languages`);
      assert.ok(typeof s.quote === 'string' && s.quote.trim().length > 10, `${s.code} needs a quote`);
      assert.ok(isTrustedUrl(s.url), `${s.code} url must be a trusted domain: ${s.url}`);
      assert.equal(s.read, '2026-11-21', `${s.code} read date`);
      assert.equal(s.id === 'care-safe-sleep', false, 'safe sleep is not copied into band strategies');
      if (band.fromDays < 183) assert.equal(Boolean(s.settling), false, `${s.code} under 6 months cannot be a settling method`);
    }
  }

  let currentBand = '';
  let weekIdx = 0;
  for (const line of section.split('\n')) {
    const bandMatch = /^### Band ([A-D]):/.exec(line);
    if (bandMatch) { currentBand = bandMatch[1]; weekIdx = 0; continue; }
    if (!line.startsWith('| ') || line.startsWith('| #') || line.startsWith('|---')) continue;
    const [code, enRaw, esRaw, , url, rd] = line.replace(/^\|\s*|\s*\|$/g, '').split('|').map(p => p.trim());
    const en = enRaw.replace(/^\*\*\[settling, D4\]\*\*\s*/, '');
    const es = esRaw.replace(/^\*\*\[settling, D4\]\*\*\s*/, '');
    const band = byBand[currentBand];
    if (code.startsWith('W')) {
      assert.equal(band.weeks[weekIdx][0], en, `${currentBand} ${code} EN verbatim`);
      assert.equal(band.weeks[weekIdx][1], es, `${currentBand} ${code} ES verbatim`);
      weekIdx++;
    } else {
      const strat = band.strategies.find((s: any) => s.code === code);
      assert.ok(strat, `${code} exists in band ${currentBand}`);
      assert.equal(strat.text[0], en, `${code} EN verbatim`);
      assert.equal(strat.text[1], es, `${code} ES verbatim`);
      assert.equal(strat.url, url, `${code} URL verbatim`);
      assert.equal(strat.read, rd, `${code} read date verbatim`);
      assert.equal(Boolean(strat.settling), enRaw.includes('[settling, D4]'), `${code} settling flag`);
    }
  }
});

// Group G4-2: Safe sleep loaded from care-guidance.js; age gate at read time; no birth date hides settling methods.
test('G4-2: age gate unlocks settling methods only at >= 183 days and never with missing birth date; safe sleep comes from care-guidance.js', () => {
  const {LittleDaysSleepGuides: SG, LittleDaysCareGuidance: CG} = loadGuides();

  for (const badAge of [null, undefined, NaN, -5]) {
    const res = SG.planForAge(badAge, false);
    assert.equal(res.band, null);
    assert.deepEqual(Array.from(res.strategies), []);
    assert.deepEqual(Array.from(res.weeks), []);
    assert.equal(res.settlingUnlocked, false);
    assert.equal(res.safeSleep.id, 'care-safe-sleep');
    assert.equal(res.safeSleep.body, CG.byId('care-safe-sleep', false).body);
  }

  for (const age of [0, 17, 121, 122, 182]) {
    const res = SG.planForAge(age, false);
    assert.equal(res.settlingUnlocked, false, `age ${age} stays locked`);
    assert.equal(res.band.id, age <= 121 ? 'A' : 'B');
    assert.equal(res.strategies.some((s: any) => s.settling), false, `age ${age} exposes no settling method`);
    assert.equal(res.safeSleep.body, CG.byId('care-safe-sleep', false).body);
  }

  const at6Mo = SG.planForAge(183, false);
  assert.equal(at6Mo.band.id, 'C');
  assert.equal(at6Mo.settlingUnlocked, true);
  assert.deepEqual(Array.from(at6Mo.strategies.filter((s: any) => s.settling).map((s: any) => s.code)), ['C1', 'C2']);

  const at9MoEs = SG.planForAge(274, true);
  assert.equal(at9MoEs.band.id, 'D');
  assert.equal(at9MoEs.settlingUnlocked, true);
  assert.deepEqual(Array.from(at9MoEs.strategies.filter((s: any) => s.settling).map((s: any) => s.code)), ['D1', 'D2']);
  assert.equal(at9MoEs.safeSleep.body, CG.byId('care-safe-sleep', true).body);

  const over12 = SG.planForAge(400, false);
  assert.equal(over12.band.id, 'D');
  assert.equal(over12.over12Months, true);
});

// Group G4-3: Schedule calculation from last 7 days + short-nap shift.
test('G4-3: schedule requires 8 daytime awake gaps and computes shifted nap and bedtime schedule after a short Nap 1', () => {
  const {LittleDaysSleepGuides: SG} = loadGuides();

  const few = SG.scheduleFromEntries({entries: [], todayISO: '2026-11-23', nowMin: 570});
  assert.equal(few.ready, false);
  assert.equal(few.minGaps, 8);

  const entries: any[] = [];
  for (let d = -7; d <= -1; d++) {
    const base = d * 1440;
    // Wake at 7:00 AM (420) from prior night sleep ending at base + 420
    entries.push({id: `n${d}`, type: 'sleep', nap: false, t: base - 240, dur: 660});
    // 3 daytime naps: 8:15-9:30 (75m), 10:45-12:00 (75m), 1:15-2:30 (75m) -> awake windows 75m each
    entries.push({id: `s1-${d}`, type: 'sleep', nap: true, t: base + 495, dur: 75});
    entries.push({id: `s2-${d}`, type: 'sleep', nap: true, t: base + 645, dur: 75});
    entries.push({id: `s3-${d}`, type: 'sleep', nap: true, t: base + 795, dur: 75});
  }
  entries.push({id: 'n0', type: 'sleep', nap: false, t: -240, dur: 660});

  const sched = SG.scheduleFromEntries({entries, todayISO: '2026-11-23', nowMin: 570});
  assert.equal(sched.ready, true);
  assert.equal(sched.avgNaps, 3);
  assert.equal(sched.awakeMedianMin, 75);
  assert.equal(sched.typicalNapMin, 75);
  assert.equal(sched.shortNapMin, 30);
  assert.equal(sched.shiftMin, 45);
  assert.ok(sched.rows.length >= 4, 'includes wake, naps, and bedtime');
  const nap2 = sched.rows.find((r: any) => r.kind === 'nap' && r.index === 2);
  const bed = sched.rows.find((r: any) => r.kind === 'bed');
  assert.ok(nap2 && bed);
  assert.equal(nap2.usualMin - nap2.shiftedMin, 45, 'Nap 2 shifts 45 min earlier');
  assert.equal(bed.usualMin - bed.shiftedMin, 45, 'Bedtime shifts 45 min earlier');
});
