-- product_id_snapshot / variant_id_snapshot / seller_id_snapshot are
-- deliberately NOT foreign keys - they're historical copies taken at
-- purchase time and must never be coupled to whatever the catalog says
-- today. Only offer_id is a real FK, kept for traceability back to the
-- live offer if ever needed.
CREATE TABLE order_line (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id),
    offer_id UUID NOT NULL REFERENCES offer(id),
    product_id_snapshot UUID NOT NULL,
    variant_id_snapshot UUID NOT NULL,
    seller_id_snapshot UUID NOT NULL,
    unit_price_snapshot NUMERIC(10, 2) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_line_order_id ON order_line(order_id);
CREATE INDEX idx_order_line_seller_id_snapshot ON order_line(seller_id_snapshot);
