import '../web/care-guidance.js';

export function careGuidance(spanish: boolean) {
  return (globalThis as any).LittleDaysCareGuidance.careGuidance(spanish);
}
