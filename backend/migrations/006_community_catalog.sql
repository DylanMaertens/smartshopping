CREATE TABLE community_product_proposals (
    id UUID PRIMARY KEY,
    barcode TEXT NOT NULL CHECK (barcode ~ '^[0-9]{8,14}$'),
    field_name TEXT NOT NULL CHECK (field_name IN ('name', 'category')),
    value TEXT NOT NULL CHECK (length(btrim(value)) > 0 AND char_length(value) <= 200),
    normalized_value TEXT NOT NULL,
    contributor_device_id TEXT NOT NULL REFERENCES anonymous_devices(device_id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'rejected', 'revoked')),
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

CREATE TABLE community_daily_writes (
    device_id TEXT PRIMARY KEY REFERENCES anonymous_devices(device_id),
    day BIGINT NOT NULL,
    writes INTEGER NOT NULL CHECK (writes > 0)
);

CREATE UNIQUE INDEX community_active_proposal_value
    ON community_product_proposals(barcode, field_name, normalized_value)
    WHERE status IN ('pending', 'validated');
CREATE INDEX community_proposals_lookup
    ON community_product_proposals(barcode, field_name, status, updated_at DESC);

CREATE TABLE community_proposal_confirmations (
    proposal_id UUID NOT NULL REFERENCES community_product_proposals(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL REFERENCES anonymous_devices(device_id),
    agrees BOOLEAN NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (proposal_id, device_id)
);

CREATE TABLE community_proposal_reports (
    id UUID PRIMARY KEY,
    proposal_id UUID NOT NULL REFERENCES community_product_proposals(id) ON DELETE CASCADE,
    reporter_device_id TEXT NOT NULL REFERENCES anonymous_devices(device_id),
    reason TEXT NOT NULL CHECK (reason IN ('wrong_product', 'wrong_name', 'wrong_category', 'abuse', 'spam')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'upheld', 'dismissed')),
    created_at BIGINT NOT NULL,
    reviewed_at BIGINT,
    reviewed_by TEXT,
    CHECK (status = 'pending' OR (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND length(btrim(reviewed_by)) > 0)),
    UNIQUE (proposal_id, reporter_device_id, reason)
);

CREATE TABLE community_contributor_restrictions (
    id UUID PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES anonymous_devices(device_id),
    report_id UUID NOT NULL REFERENCES community_proposal_reports(id),
    starts_at BIGINT NOT NULL,
    ends_at BIGINT,
    reason TEXT NOT NULL,
    created_by TEXT NOT NULL,
    lifted_at BIGINT,
    lifted_by TEXT,
    CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX community_active_restrictions
    ON community_contributor_restrictions(device_id, starts_at, ends_at)
    WHERE lifted_at IS NULL;

-- Even an administrative write must reference an examined, upheld report
-- against this contributor. Raw report counts never create a restriction.
CREATE FUNCTION community_check_restriction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM community_proposal_reports r
        JOIN community_product_proposals p ON p.id=r.proposal_id
        WHERE r.id=NEW.report_id AND r.status='upheld'
          AND p.contributor_device_id=NEW.device_id
    ) THEN
        RAISE EXCEPTION 'Restriction requires an upheld report against this contributor';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER community_restriction_evidence BEFORE INSERT OR UPDATE OF device_id, report_id
    ON community_contributor_restrictions FOR EACH ROW EXECUTE FUNCTION community_check_restriction();

CREATE VIEW community_active_votes AS
SELECT c.proposal_id, c.device_id, c.agrees, p.barcode, p.field_name
FROM community_proposal_confirmations c
JOIN community_product_proposals p ON p.id=c.proposal_id
WHERE p.status IN ('pending','validated') AND NOT EXISTS (
    SELECT 1 FROM community_contributor_restrictions r
    WHERE r.device_id=c.device_id AND r.lifted_at IS NULL
      AND r.starts_at <= (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT
      AND (r.ends_at IS NULL OR r.ends_at > (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT)
);
