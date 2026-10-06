import { describe, expect, it, vi } from 'vitest';
import { InvitationSession } from './invitationSession';

const invitation = () => ({ code: 'a'.repeat(32), list_id: 'list', expires_at: Date.now() + 60_000 });

describe('invitation session', () => {
  it('isolates lists and device identities and reuses a valid code', async () => {
    const session = new InvitationSession();
    const key = session.key('owner', 'list');
    const create = vi.fn(async () => invitation());
    const result = await session.create(key, create);
    expect(await session.create(key, create)).toBe(result);
    expect(create).toHaveBeenCalledTimes(1);
    expect(session.get(session.key('owner', 'other')).invitation).toBeNull();
    expect(session.get(session.key('another', 'list')).invitation).toBeNull();
    expect(new InvitationSession().get(key).invitation).toBeNull();
  });

  it('shares the pending request and permits a retry after failure', async () => {
    const session = new InvitationSession();
    const key = session.key('owner', 'list');
    const create = vi.fn(async () => { throw new Error('offline'); });
    const first = session.create(key, create);
    expect(session.create(key, create)).toBe(first);
    await expect(first).rejects.toThrow('offline');
    expect(create).toHaveBeenCalledTimes(1);
    expect(session.get(key).pending).toBe(false);
    const fresh = invitation();
    expect(await session.create(key, async () => fresh)).toBe(fresh);
  });

  it('replaces an expired invitation and does not cache a failed preparation', async () => {
    const session = new InvitationSession();
    const key = session.key('owner', 'list');
    await session.create(key, async () => ({ ...invitation(), expires_at: Date.now() - 1 }));
    await session.create(key, async () => null);
    expect(session.get(key)).toEqual({ invitation: null, pending: false });
    const fresh = invitation();
    expect(await session.create(key, async () => fresh)).toBe(fresh);
  });
});
