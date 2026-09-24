-- seller_id was added assuming one seller per order (a multi-seller cart
-- would split into N orders). Checkout, as actually built, creates ONE
-- order per checkout call regardless of how many sellers its lines
-- belong to - each order_line already carries its own authoritative
-- seller_id_snapshot, so this column can no longer be a reliable single
-- answer for a mixed-seller order. Relaxed to nullable rather than
-- dropped, since existing rows/tests still populate it for the
-- single-seller case.
ALTER TABLE orders ALTER COLUMN seller_id DROP NOT NULL;

-- Flat columns, not a Postgres composite type: Hibernate has no
-- first-class mapping to a native composite type (it would need a
-- custom UserType), while a plain @Embeddable Address gets the same
-- grouping in Java with zero custom SQL type machinery. Always exactly
-- two full sets of columns (shipping + billing), even when billing is
-- identical to shipping - same "duplicate rather than share a
-- reference" reasoning as every other snapshot in this schema.
ALTER TABLE orders
    ADD COLUMN buyer_phone VARCHAR(32) NOT NULL,

    ADD COLUMN shipping_full_name VARCHAR(255) NOT NULL,
    ADD COLUMN shipping_line1 VARCHAR(255) NOT NULL,
    ADD COLUMN shipping_line2 VARCHAR(255),
    ADD COLUMN shipping_city VARCHAR(255) NOT NULL,
    ADD COLUMN shipping_state VARCHAR(255) NOT NULL,
    ADD COLUMN shipping_postal_code VARCHAR(32) NOT NULL,
    ADD COLUMN shipping_country VARCHAR(2) NOT NULL,

    ADD COLUMN billing_same_as_shipping BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN billing_full_name VARCHAR(255) NOT NULL,
    ADD COLUMN billing_line1 VARCHAR(255) NOT NULL,
    ADD COLUMN billing_line2 VARCHAR(255),
    ADD COLUMN billing_city VARCHAR(255) NOT NULL,
    ADD COLUMN billing_state VARCHAR(255) NOT NULL,
    ADD COLUMN billing_postal_code VARCHAR(32) NOT NULL,
    ADD COLUMN billing_country VARCHAR(2) NOT NULL;
