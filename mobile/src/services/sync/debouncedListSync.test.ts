import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DebouncedListSync } from './debouncedListSync';
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
function setup() {
  const sync = vi.fn(async (_id: string) => {});
  const hasPending = vi.fn(() => true);
  const waitForIdle = vi.fn<() => Promise<unknown> | undefined>(() => undefined);
  const queue = new DebouncedListSync({ sync, hasPending, waitForIdle });
  queue.setEnabled(true);
  return { queue, sync, hasPending, waitForIdle };
}
it('waits one second after the last edit and sends one batch', async () => {
  const { queue, sync } = setup();
  queue.schedule('a');
  await vi.advanceTimersByTimeAsync(500);
  queue.schedule('a');
  await vi.advanceTimersByTimeAsync(999);
  expect(sync).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(sync).toHaveBeenCalledExactlyOnceWith('a');
  await vi.advanceTimersByTimeAsync(30000);
  expect(sync).toHaveBeenCalledTimes(1);
});
it('preserves edits made during a slow automatic request', async () => {
  const { queue, sync } = setup();
  let finish!: () => void;
  sync.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  queue.schedule('a');
  await vi.advanceTimersByTimeAsync(1000);
  queue.schedule('a');
  await vi.advanceTimersByTimeAsync(1000);
  expect(sync).toHaveBeenCalledTimes(1);
  finish();
  await vi.advanceTimersByTimeAsync(1);
  expect(sync).toHaveBeenCalledTimes(2);
});
it('waits for manual requests and respects newer edits while waiting', async () => {
  const { queue, sync, waitForIdle } = setup();
  let finish!: () => void;
  waitForIdle.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
  queue.schedule('a');
  await vi.advanceTimersByTimeAsync(1000);
  queue.schedule('a');
  finish();
  await vi.advanceTimersByTimeAsync(999);
  expect(sync).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(sync).toHaveBeenCalledExactlyOnceWith('a');
});
it('skips acknowledged or removed lists and preserves other lists', async () => {
  const { queue, sync, hasPending } = setup();
  queue.schedule('deleted'); queue.schedule('other');
  hasPending.mockImplementation((...args: unknown[]) => args[0] === 'other');
  await vi.advanceTimersByTimeAsync(1001);
  expect(sync).toHaveBeenCalledExactlyOnceWith('other');
});
it('pauses offline or in background and resumes without losing the queue', async () => {
  const { queue, sync } = setup();
  queue.schedule('a'); queue.setEnabled(false);
  await vi.advanceTimersByTimeAsync(10000);
  expect(sync).not.toHaveBeenCalled();
  queue.schedule('a'); queue.setEnabled(true);
  await vi.advanceTimersByTimeAsync(999);
  expect(sync).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(sync).toHaveBeenCalledTimes(1);
});
it('does not retry failures in a loop, but accepts a new change', async () => {
  const { queue, sync } = setup();
  sync.mockRejectedValueOnce(new Error('offline'));
  queue.schedule('a');
  await vi.advanceTimersByTimeAsync(60000);
  expect(sync).toHaveBeenCalledTimes(1);
  queue.schedule('a');
  await vi.advanceTimersByTimeAsync(1000);
  expect(sync).toHaveBeenCalledTimes(2);
});
it('clears queued work on unmount even while waiting for a manual request', async () => {
  const { queue, sync, waitForIdle } = setup();
  let finish!: () => void;
  waitForIdle.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
  queue.schedule('a');
  await vi.advanceTimersByTimeAsync(1000);
  queue.clear(); finish();
  await vi.advanceTimersByTimeAsync(1000);
  expect(sync).not.toHaveBeenCalled();
});
