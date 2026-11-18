/* Dim theme choice, read before the first paint so a 3 AM load never flashes white.
   Auto follows the install's time zone (dim from 8 PM to 7 AM); On and Off override it. The choice stays in this browser only. */
// The time zone of the install. The server sends it with the session; until then the device's own zone stands in.
globalThis.LittleDaysZone = (() => {
  let zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    get: () => zone,
    set: next => { try { new Intl.DateTimeFormat('en-US', {timeZone: next}); zone = next; } catch (_) { /* Keep the last good zone. */ } },
  };
})();

globalThis.LittleDaysTheme = (() => {
  const KEY = 'little-days-theme';
  // If the browser refuses storage (private mode, blocked cookies), the chosen mode stays in memory for this page.
  let memory = 'auto', storageBroken = false;
  const mode = () => {
    if (storageBroken) return memory;
    try { const v = localStorage.getItem(KEY); memory = v === 'on' || v === 'off' ? v : 'auto'; } catch (_) { storageBroken = true; }
    return memory;
  };
  const hour = () => +new Intl.DateTimeFormat('en-GB', {timeZone: LittleDaysZone.get(), hour: '2-digit', hourCycle: 'h23'}).format(new Date());
  const dimHour = (h = hour()) => h >= 20 || h < 7;
  const dimOn = () => { const m = mode(); return m === 'on' || (m === 'auto' && dimHour()); };
  const set = m => {
    memory = m === 'on' || m === 'off' ? m : 'auto';
    try { if (memory === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, memory); } catch (_) { storageBroken = true; }
  };
  const apply = () => {
    const dim = dimOn();
    document.documentElement.dataset.theme = dim ? 'dim' : 'light';
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', dim ? '#2a2623' : '#f0f0f2');
    return dim;
  };
  apply();
  return {mode, dimHour, dimOn, set, apply};
})();
