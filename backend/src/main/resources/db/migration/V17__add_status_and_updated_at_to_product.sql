-- product.status and product.updated_at.
--
-- status was in the API contract (frontend/openapi/fixture.yaml: ProductStatus,
-- CreateProductRequest.status, UpdateProductRequest.status) and in the product
-- form's payload long before it was anywhere in the database. Every create and
-- every update carrying a status was accepted and the field silently dropped,
-- so a product saved as a draft came back ACTIVE and shoppers saw it. There was
-- no column, no entity field and no DTO field to write it to; this adds the
-- first of those.
--
-- A CHECK constraint on a VARCHAR rather than a Postgres ENUM type, matching
-- image.status (V8) and orders.status (V9): the application already maps these
-- with @Enumerated(EnumType.STRING), and a real ENUM type would need its own
-- ALTER TYPE migration to gain a value, which is the thing most likely to want
-- changing.
--
-- ARCHIVED is in the CHECK because the contract's ProductStatus has three
-- values and DELETE /products/{productRef} is documented there as an ARCHIVED
-- soft delete. The backend's DELETE is still a hard delete - that difference is
-- reported, not quietly resolved here - so nothing writes ARCHIVED yet. The
-- constraint allows it so that turning the delete into a soft delete later is a
-- code change, not another migration.
--
-- DEFAULT 'ACTIVE' is also the backfill for existing rows: everything already
-- in the catalog is live and visible today, so ACTIVE is what it currently
-- means, not a guess.
ALTER TABLE product
    ADD COLUMN status VARCHAR(10) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'DRAFT', 'ARCHIVED'));

-- "Last updated" in the seller's product drawer. NOT NULL with a default so the
-- column is never empty, then backfilled to created_at: for a row that predates
-- this migration the only edit time we can honestly claim is the one it was
-- created at. Using now() would tell every seller that their whole catalogue
-- was edited the day this deployed.
--
-- Maintained by Hibernate's @UpdateTimestamp on Product, not a database
-- trigger, so the value is the same one the writing transaction returns and
-- there is one place to look for it.
ALTER TABLE product ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE product SET updated_at = created_at;

-- The seller product list filters by seller and, usually, by status
-- (SellerProductService.listRows). seller_id already has its own index from V5;
-- this composite serves the common "my products, one status" query without
-- making the single-column one redundant for the unfiltered list.
CREATE INDEX idx_product_seller_id_status ON product(seller_id, status);
