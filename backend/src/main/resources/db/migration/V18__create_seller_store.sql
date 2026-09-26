-- The seller's store profile - everything GET/PATCH /api/v1/sellers/me/store
-- carries (frontend/openapi/fixture.yaml: StoreProfile, UpdateStoreProfile).
--
-- The contract, the Store Settings page and the dashboard's <h1> all existed
-- before any of this did: there was no store-profile table of any kind, so
-- both endpoints 403'd on anyRequest().denyAll() and the dashboard fell back to
-- the literal word "Dashboard" for every seller.
--
-- A table of its own rather than more columns on seller, even though the
-- relationship is 1:1. seller is the login record - the row a magic link
-- creates from an email address alone - and it is read on every authenticated
-- request. A storefront is a different thing with a different lifecycle: it is
-- public, it is edited by hand, and it owns a URL. Splitting them also means
-- the store can be provisioned lazily (see SellerStoreProvisioner) without
-- touching the auth path's row.
CREATE TABLE seller_store (
    id UUID PRIMARY KEY,
    -- UNIQUE, not just a foreign key: one seller, one storefront. This is also
    -- what makes provisioning-on-first-read safe to race - two concurrent first
    -- reads both try to insert, and the loser is refused here instead of
    -- creating a second store for the same seller.
    seller_id UUID NOT NULL UNIQUE REFERENCES seller(id),
    name TEXT NOT NULL,
    -- The storefront's URL segment (amezo.com/stores/{handle}). The length and
    -- the CHECK mirror StoreHandle in the contract exactly - pattern,
    -- minLength 2, maxLength 39. Stated here as well as in the request DTO
    -- because the column is what a manual UPDATE, a bad backfill or a second
    -- writer would have to get past; the DTO only guards the HTTP door.
    --
    -- The pattern admits lowercase only, so the plain UNIQUE below is already
    -- case-insensitive in practice and no lower(handle) index is needed.
    handle VARCHAR(39) NOT NULL UNIQUE
        CHECK (handle ~ '^[a-z0-9][a-z0-9-]{0,37}[a-z0-9]$'),
    tagline TEXT,
    location TEXT,
    -- No range CHECK. The contract says "integer" and nothing more, and a bound
    -- it does not state would reach the client as a 500 on a constraint name
    -- rather than as a refusal anyone documented.
    founded_year INTEGER,
    support_email TEXT,
    about TEXT,
    cover_url TEXT,
    logo_url TEXT,
    -- A CHECK on a VARCHAR rather than a Postgres ENUM, matching product.status
    -- (V17), image.status (V8) and orders.status (V9): the application maps
    -- these with @Enumerated(EnumType.STRING), and a real ENUM type would need
    -- its own ALTER TYPE migration to gain a value.
    --
    -- OPEN is the default because a store that exists is selling; VACATION and
    -- CLOSED are both things the seller chooses.
    status VARCHAR(10) NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'VACATION', 'CLOSED')),
    vacation_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Maintained by Hibernate's @UpdateTimestamp on SellerStore, not a database
    -- trigger, so the value a write returns is the value that was stored - the
    -- same choice, and the same reasoning, as product.updated_at in V17.
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No backfill. Existing sellers get their store the first time anything reads
-- it (SellerStoreService.requireStore), which keeps the derivation in one place
-- - Java, where the seller's name and email already are - instead of splitting
-- it between a SQL backfill that would have to reimplement handle slugging and
-- the code that does it for every seller created after this deploy.
