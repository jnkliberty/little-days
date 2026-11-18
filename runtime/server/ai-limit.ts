import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './store.ts';

// Show or set the daily question limit for Ask AI: `node server/ai-limit.ts [QUESTIONS]`. The default is 20 and 0 means no limit.
// The gateway reads the setting on each question, so it needs no restart.
export function parseLimit(value: string): number {
  if (!/^\d{1,6}$/.test(value) || Number(value) > 100000) throw new Error('The limit is a whole number from 0 to 100000. 0 means no limit.');
  return Number(value);
}

function main() {
  const [value] = process.argv.slice(2);
  const store = openStore(resolve(process.env.LITTLE_DAYS_DB || 'data/little-days.sqlite'));
  try {
    if (value === undefined) { console.log(`Daily question limit: ${store.getSetting('app', 'aiDailyLimit') ?? 'not set (the default, 20)'}`); return; }
    const limit = parseLimit(value);
    store.putSetting('app', 'aiDailyLimit', limit);
    console.log(limit === 0 ? 'Daily question limit: none.' : `Daily question limit: ${limit} questions a day.`);
  } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
  finally { store.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
