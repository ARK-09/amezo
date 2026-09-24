CREATE TABLE session (
    id UUID PRIMARY KEY,
    identity_type VARCHAR(10) NOT NULL CHECK (identity_type IN ('BUYER', 'SELLER')),
    identity_id UUID NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_session_token_hash ON session(token_hash);
