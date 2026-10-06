export const REMOTE_REFRESH_MS = 15_000;
const MAX_RETRY_MS = 120_000;

/** One request at a time, measured from completion; disposal cannot rearm it. */
export function startRemoteRefresh(refresh: () => Promise<boolean | null>): () => void {
  let stopped = false;
  let delay = REMOTE_REFRESH_MS;
  let timer: ReturnType<typeof setTimeout>;
  const arm = () => { timer = setTimeout(() => void run(), delay); };
  const run = async () => {
    let result: boolean | null;
    try { result = await refresh(); } catch { result = false; }
    if (stopped) return;
    if (result === false) delay = Math.min(delay * 2, MAX_RETRY_MS);
    if (result === true) delay = REMOTE_REFRESH_MS;
    arm();
  };
  arm();
  return () => { stopped = true; clearTimeout(timer); };
}
