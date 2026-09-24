CREATE TABLE product (
    id UUID PRIMARY KEY,
    seller_id UUID NOT NULL REFERENCES seller(id),
    title VARCHAR(255) NOT NULL,
    brand_name VARCHAR(255),
    description TEXT,
    category VARCHAR(100) NOT NULL,
    -- Two-argument to_tsvector form required: Postgres rejects the
    -- one-argument form (which relies on the session's search_path) in a
    -- generated column because it isn't immutable.
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('english', title || ' ' || coalesce(brand_name, '') || ' ' || coalesce(description, ''))
    ) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_seller_id ON product(seller_id);
CREATE INDEX idx_product_search_vector ON product USING GIN (search_vector);
