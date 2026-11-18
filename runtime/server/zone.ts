// One time zone for each install. TZ is read one time, when this file loads; a wrong value stops the server.
export function zoneFromEnv(env: Record<string, string | undefined> = process.env): string {
  const value = env.TZ?.trim();
  if (!value) return Intl.DateTimeFormat().resolvedOptions().timeZone;
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); }
  catch { throw new Error(`TZ must name a time zone such as America/Chicago. Got: ${value}`); }
  return value;
}

let current = zoneFromEnv();
export const getZone = (): string => current;
// For tests and for a process that must change zone. The server itself never calls this.
export function setZone(zone: string): void { current = zoneFromEnv({ TZ: zone }); }
