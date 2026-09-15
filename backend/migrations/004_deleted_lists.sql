CREATE TABLE IF NOT EXISTS deleted_lists (
    id TEXT PRIMARY KEY,
    owner_device_id TEXT NOT NULL,
    deleted_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deleted_lists_deleted_at ON deleted_lists(deleted_at);
