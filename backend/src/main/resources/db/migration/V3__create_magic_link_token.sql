CREATE TABLE magic_link_token (
    id UUID PRIMARY KEY,
    identity_type VARCHAR(10) NOT NULL CHECK (identity_type IN ('BUYER', 'SELLER')),
    -- No identity_id: the identity may not exist yet (first-time seller
    -- magic-link request). Resolved by email + type at consumption time.
    email VARCHAR(255) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_magic_link_token_hash ON magic_link_token(token_hash);
