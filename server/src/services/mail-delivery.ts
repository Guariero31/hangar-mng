import { setTimeout as delay } from 'node:timers/promises';

function isTemporaryRefusal(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('responseCode' in error)) return false;
  return typeof error.responseCode === 'number' && error.responseCode >= 400 && error.responseCode < 500;
}

// shortcut: pending mail lives in memory; use a persistent outbox if delivery must survive restarts.
export function createMailDelivery(wait: (milliseconds: number) => Promise<unknown> = delay) {
  let tail: Promise<unknown> = Promise.resolve();
  return (deliver: () => Promise<unknown>): Promise<void> => {
    const pending = tail.then(async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          await deliver();
          return;
        } catch (error) {
          // Retry explicit refusals only: a lost connection after DATA may already have delivered mail.
          if (!isTemporaryRefusal(error) || attempt >= 2) throw error;
          await wait(30_000 * (attempt + 1));
        }
      }
    });
    tail = pending.catch(() => {}).then(() => wait(1_000));
    return pending;
  };
}
