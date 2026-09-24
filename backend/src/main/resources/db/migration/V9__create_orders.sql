-- Table is "orders", not the singular "order" from the ADR: ORDER is a
-- reserved SQL keyword, and quoting it everywhere (migrations, native
-- queries) isn't worth it over the standard plural-table/singular-entity
-- convention already used everywhere else here.
--
-- One seller per order (seller_id): per the checkout design, a
-- multi-seller cart becomes N orders, one per seller, never one order
-- with mixed-ownership lines.
CREATE TABLE orders (
    id UUID PRIMARY KEY,
    buyer_identity_id UUID NOT NULL REFERENCES buyer_identity(id),
    seller_id UUID NOT NULL REFERENCES seller(id),
    buyer_email_snapshot VARCHAR(255) NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'PLACED' CHECK (status IN ('PLACED', 'SHIPPED', 'DELIVERED')),
    tracking_number VARCHAR(100),
    shipped_at TIMESTAMPTZ,
    placed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_buyer_identity_id ON orders(buyer_identity_id);
CREATE INDEX idx_orders_seller_id ON orders(seller_id);
