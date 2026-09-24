CREATE TABLE review (
    id UUID PRIMARY KEY,
    order_line_id UUID NOT NULL REFERENCES order_line(id),
    buyer_identity_id UUID NOT NULL REFERENCES buyer_identity(id),
    product_id UUID NOT NULL REFERENCES product(id),
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    body TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (buyer_identity_id, product_id)
);

CREATE INDEX idx_review_product_id ON review(product_id);
