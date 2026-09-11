/**
 * Logs how long a step took, only when it's slow enough to matter.
 *
 * A handful of these around the pieces most likely to bite (an external
 * auth call, an unindexed query) turns "the wizard feels slow" into a real
 * number in the Vercel logs instead of a guess.
 */
const SLOW_MS = 150;

export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    return await fn();
  } finally {
    const ms = Date.now() - startedAt;
    if (ms >= SLOW_MS) console.log(`[timing] ${label} ${ms}ms`);
  }
}
