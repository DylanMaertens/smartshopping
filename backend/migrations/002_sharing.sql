CREATE TABLE IF NOT EXISTS list_members (
    list_id TEXT NOT NULL REFERENCES shared_lists(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'editor',
    joined_at BIGINT NOT NULL,
    PRIMARY KEY (list_id, device_id)
);

CREATE TABLE IF NOT EXISTS list_invitations (
    code TEXT PRIMARY KEY,
    list_id TEXT NOT NULL REFERENCES shared_lists(id) ON DELETE CASCADE,
    created_by TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    revoked_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_list_invitations_list_id ON list_invitations(list_id);
CREATE INDEX IF NOT EXISTS idx_list_invitations_expires_at ON list_invitations(expires_at);
