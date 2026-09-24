-- 1--1 with variant: the unique constraint on variant_id is what enforces
-- that, not a separate join table.
CREATE TABLE offer (
    id UUID PRIMARY KEY,
    variant_id UUID NOT NULL UNIQUE REFERENCES variant(id),
    price NUMERIC(10, 2) NOT NULL,
    stock_qty INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
