CREATE TABLE image (
    id UUID PRIMARY KEY,
    product_id UUID REFERENCES product(id),
    variant_id UUID REFERENCES variant(id),
    s3_key VARCHAR(512) NOT NULL,
    position INTEGER NOT NULL,
    -- PENDING until the presigned-upload confirm step verifies the object
    -- actually landed in S3; only STORED images ever render.
    status VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'STORED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT image_belongs_to_something CHECK (product_id IS NOT NULL OR variant_id IS NOT NULL)
);

CREATE INDEX idx_image_product_id ON image(product_id);
CREATE INDEX idx_image_variant_id ON image(variant_id);
