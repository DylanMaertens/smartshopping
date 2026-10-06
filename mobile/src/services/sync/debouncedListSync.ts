/** Groups local edits per list, and serializes them with existing sync requests. */
export class DebouncedListSync {
  private deadlines = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private enabled = false;
  private running = false;

  constructor(private readonly options: {
    hasPending: (listId: string) => boolean;
    waitForIdle: () => Promise<unknown> | undefined;
    sync: (listId: string) => Promise<unknown>;
    delay?: number;
  }) {}

  schedule(listId: string) {
    this.deadlines.set(listId, Date.now() + (this.options.delay ?? 1000));
    this.arm();
  }

  hasScheduled(listId: string) { return this.deadlines.has(listId); }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.arm();
  }

  clear() {
    this.enabled = false;
    this.deadlines.clear();
    this.arm();
  }

  private arm() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.enabled || this.running || !this.deadlines.size) return;
    const next = Math.min(...this.deadlines.values());
    this.timer = setTimeout(() => void this.drain(), Math.max(0, next - Date.now()));
  }

  private async drain() {
    this.running = true;
    try {
      await this.options.waitForIdle();
      if (!this.enabled) return;
      // Re-read deadlines after waiting: edits may have postponed this batch.
      const next = [...this.deadlines.entries()].sort((a, b) => a[1] - b[1])[0];
      if (!next || next[1] > Date.now()) return;
      const [listId] = next;
      this.deadlines.delete(listId);
      if (this.options.hasPending(listId)) await this.options.sync(listId);
    } catch {
      // The screen reports failures. Keep durable pending changes without a retry loop.
    } finally {
      this.running = false;
      this.arm();
    }
  }
}
