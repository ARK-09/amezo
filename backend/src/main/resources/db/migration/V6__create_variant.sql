CREATE TABLE variant (
    id UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES product(id),
    label VARCHAR(255) NOT NULL,
    sku VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_variant_product_id ON variant(product_id);
