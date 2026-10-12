-- Durable decisions, separate from the bounded in-memory technical logs.
CREATE TABLE admin_decisions (
    id BIGSERIAL PRIMARY KEY,
    subject_kind TEXT NOT NULL CHECK (subject_kind IN ('proposals','reports','messages')),
    subject_id UUID NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    previous_status TEXT NOT NULL,
    next_status TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
    created_at BIGINT NOT NULL
);
CREATE INDEX admin_decisions_subject ON admin_decisions(subject_kind, subject_id, id DESC);
CREATE INDEX community_moderation_queue ON community_product_proposals(status, created_at DESC, id);
CREATE INDEX community_reports_queue ON community_proposal_reports(status, created_at DESC, id);

CREATE TABLE contact_messages (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
    topic TEXT NOT NULL CHECK (topic IN ('question','technical','suggestion','other')),
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 20 AND 3000),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','active','closed')),
    revision BIGINT NOT NULL DEFAULT 1,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);
CREATE INDEX contact_messages_queue ON contact_messages(status, created_at DESC, id);
CREATE INDEX contact_messages_quota ON contact_messages(created_at, email);
