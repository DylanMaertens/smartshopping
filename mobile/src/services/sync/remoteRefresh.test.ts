import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { REMOTE_REFRESH_MS, startRemoteRefresh } from './remoteRefresh';
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('refreshes without any local edit and stops after disposal', async () => {
  const refresh = vi.fn().mockResolvedValue(true);
  const stop = startRemoteRefresh(refresh);
  await vi.advanceTimersByTimeAsync(REMOTE_REFRESH_MS - 1);
  expect(refresh).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(refresh).toHaveBeenCalledTimes(1);
  stop();
  await vi.advanceTimersByTimeAsync(120_000);
  expect(refresh).toHaveBeenCalledTimes(1);
});
it('does not overlap slow requests or restart after disposal during a request', async () => {
  let finish!: (result: boolean) => void;
  const refresh = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
  const stop = startRemoteRefresh(refresh);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(refresh).toHaveBeenCalledTimes(1);
  stop(); finish(true);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(refresh).toHaveBeenCalledTimes(1);
});
it('backs off on errors, then resumes the normal interval after success', async () => {
  const refresh = vi.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(true);
  const stop = startRemoteRefresh(refresh);
  await vi.advanceTimersByTimeAsync(15_000);
  await vi.advanceTimersByTimeAsync(29_999);
  expect(refresh).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(refresh).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(15_000);
  expect(refresh).toHaveBeenCalledTimes(4);
  stop();
});
it('limits backoff to two minutes and skips busy ticks without an immediate retry', async () => {
  const refresh = vi.fn().mockResolvedValue(false);
  const stop = startRemoteRefresh(refresh);
  for (const delay of [15_000, 30_000, 60_000, 120_000, 120_000]) await vi.advanceTimersByTimeAsync(delay);
  expect(refresh).toHaveBeenCalledTimes(5);
  refresh.mockResolvedValue(null);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(refresh).toHaveBeenCalledTimes(6);
  await vi.advanceTimersByTimeAsync(119_999);
  expect(refresh).toHaveBeenCalledTimes(6);
  stop();
});
