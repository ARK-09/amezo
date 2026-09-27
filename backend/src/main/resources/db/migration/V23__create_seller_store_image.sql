-- The storefront's cover and logo uploads - POST /api/v1/sellers/me/store/images
-- and .../images/confirm (frontend/openapi/fixture.yaml).
--
-- Both endpoints were in the contract with no backend at all. seller_store.cover_url
-- and logo_url were already writable, but nothing on the server produced a URL to
-- write into them: the Branding section could reserve a slot and PUT bytes only
-- against the MSW mock, and against the real API it 403'd on denyAll().
--
-- A table rather than writing straight to seller_store.cover_url on presign, for
-- the same reason catalog's image table exists: presigning hands out a capability
-- the bucket honours for the whole TTL, and the object it names does not exist
-- until the client's PUT lands. A row in PENDING is what lets confirm verify the
-- object is really there (HeadObject) before the URL goes live on the storefront -
-- without it a reserved-but-abandoned upload would leave the storefront rendering
-- a broken image for good.
--
-- Deliberately NOT a reuse of catalog's `image` table. image is scoped to a
-- product or a variant (both columns are catalog keys) and is read and written
-- only by catalog; identity cannot import catalog's entity or repository without
-- failing PackageBoundaryTest, and widening `image` with a seller_store_id would
-- make one table answer to two features.
CREATE TABLE seller_store_image (
    id UUID PRIMARY KEY,
    -- ON DELETE CASCADE because these rows are meaningless without the store.
    -- Nothing deletes a seller_store today, so this is about not leaving a
    -- future delete blocked by an FK rather than about a path that exists.
    seller_store_id UUID NOT NULL REFERENCES seller_store(id) ON DELETE CASCADE,
    -- Which of the two pictures this is. A CHECK on a VARCHAR rather than a
    -- Postgres ENUM, matching seller_store.status (V18), product.status (V17)
    -- and image.status (V8): the application maps these with
    -- @Enumerated(EnumType.STRING) and a real ENUM would need its own ALTER TYPE
    -- migration to gain a value.
    --
    -- The slot is stored, not inferred, because confirm names it again: a cover
    -- reserved and then confirmed as a logo would put a 1600x400 banner in an
    -- 88px circle, and the row is what that mismatch is checked against.
    slot VARCHAR(10) NOT NULL CHECK (slot IN ('COVER', 'LOGO')),
    s3_key TEXT NOT NULL,
    status VARCHAR(10) NOT NULL CHECK (status IN ('PENDING', 'STORED')),
    -- The size declared at presign time, replaced by the bucket's own number on
    -- confirm. Nullable only because a PENDING row is a claim until then.
    size_bytes BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every query in SellerStoreService goes (store, slot): find the PENDING row a
-- confirm names, and find the STORED row a replacement supersedes.
--
-- Not UNIQUE on (seller_store_id, slot): a store legitimately holds two rows for
-- one slot for the length of a replacement - the live STORED cover and the
-- PENDING one that has not been confirmed yet - and a seller who picks three
-- files in a row before any confirm lands would otherwise get a constraint
-- violation instead of a new upload URL.
CREATE INDEX idx_seller_store_image_store_slot ON seller_store_image (seller_store_id, slot);
