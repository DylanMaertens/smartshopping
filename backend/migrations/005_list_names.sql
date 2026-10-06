ALTER TABLE shared_lists ADD COLUMN name TEXT;
ALTER TABLE shared_lists ADD COLUMN name_updated_at BIGINT NOT NULL DEFAULT 0;
ALTER TABLE shared_lists ADD CONSTRAINT valid_list_name
    CHECK (name IS NULL OR (length(btrim(name)) > 0 AND char_length(name) <= 200));
ALTER TABLE shared_lists ADD CONSTRAINT valid_list_name_timestamp CHECK (name_updated_at >= 0);
