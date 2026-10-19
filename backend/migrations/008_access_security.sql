-- No payloads, query strings, IP addresses or authentication material.
CREATE TABLE access_events (
    id BIGSERIAL PRIMARY KEY,
    created_at BIGINT NOT NULL,
    device_id TEXT,
    reference TEXT NOT NULL,
    route TEXT NOT NULL,
    method TEXT NOT NULL,
    service TEXT NOT NULL,
    status INTEGER NOT NULL,
    code TEXT NOT NULL
);
CREATE INDEX access_events_created ON access_events(created_at);
CREATE TABLE device_access_blocks (
    device_id TEXT PRIMARY KEY REFERENCES anonymous_devices(device_id) ON DELETE CASCADE,
    version UUID NOT NULL,
    expires_at BIGINT,
    reason TEXT NOT NULL CHECK (length(reason) BETWEEN 10 AND 500),
    updated_at BIGINT NOT NULL
);
CREATE TABLE security_decisions (
    id BIGSERIAL PRIMARY KEY,
    device_id TEXT NOT NULL,
    actor TEXT NOT NULL,
    expires_at BIGINT,
    reason TEXT NOT NULL,
    created_at BIGINT NOT NULL
);
