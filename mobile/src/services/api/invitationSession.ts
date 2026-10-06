import type { InvitationResponse } from './backend';

type Entry = { invitation: InvitationResponse | null; pending: boolean };
const empty: Entry = { invitation: null, pending: false };

/** In-memory only: one session belongs to one mounted home screen. */
export class InvitationSession {
  private entries = new Map<string, Entry>();
  private requests = new Map<string, Promise<InvitationResponse | null>>();
  private listeners = new Set<() => void>();

  key(deviceId: string, listId: string) { return JSON.stringify([deviceId, listId]); }
  get(key: string): Entry { return this.entries.get(key) ?? empty; }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  clear(key: string) {
    this.update(key, empty);
  }

  private update(key: string, entry: Entry) {
    this.entries.set(key, entry);
    this.listeners.forEach((listener) => listener());
  }

  create(key: string, action: () => Promise<InvitationResponse | null>) {
    const pending = this.requests.get(key);
    if (pending) return pending;
    const existing = this.get(key).invitation;
    if (existing && existing.expires_at > Date.now()) return Promise.resolve(existing);
    return this.perform(key, action);
  }

  revoke(key: string, action: () => Promise<unknown>) {
    // UI disables actions during a request, including after closing/reopening.
    const pending = this.requests.get(key);
    if (pending) return pending;
    return this.perform(key, async () => { await action(); return null; });
  }

  private perform(key: string, action: () => Promise<InvitationResponse | null>) {
    const previous = this.get(key).invitation;
    const request = Promise.resolve().then(action).then((invitation) => {
      this.update(key, { invitation, pending: true });
      return invitation;
    }).finally(() => {
      this.requests.delete(key);
      this.update(key, { ...this.get(key), pending: false });
    });
    this.requests.set(key, request);
    this.update(key, { invitation: previous, pending: true });
    return request;
  }
}
