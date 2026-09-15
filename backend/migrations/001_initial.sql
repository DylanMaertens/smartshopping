CREATE TABLE IF NOT EXISTS anonymous_devices (
    device_id TEXT PRIMARY KEY,
    first_seen_at BIGINT NOT NULL,
    last_seen_at BIGINT NOT NULL,
    sync_count BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS shared_lists (
    id TEXT PRIMARY KEY,
    owner_device_id TEXT REFERENCES anonymous_devices(device_id),
    updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS shared_items (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL REFERENCES shared_lists(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    barcode TEXT,
    category TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    checked BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at BIGINT NOT NULL,
    deleted_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_shared_items_list_id ON shared_items(list_id);
CREATE INDEX IF NOT EXISTS idx_shared_items_updated_at ON shared_items(updated_at);
