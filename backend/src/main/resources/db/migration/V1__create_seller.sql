CREATE TABLE seller (
    id UUID PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    -- Nullable: a seller is created the moment a magic link is requested
    -- for a new email, but POST /magic-links only carries an email today.
    -- Full name has nowhere to come from yet at that point. See
    -- docs/api-design.md follow-up.
    full_name VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
