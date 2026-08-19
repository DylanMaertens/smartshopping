ALTER TABLE anonymous_devices ADD COLUMN IF NOT EXISTS auth_secret TEXT;

CREATE INDEX IF NOT EXISTS idx_anonymous_devices_auth
    ON anonymous_devices(device_id)
    WHERE auth_secret IS NOT NULL;
