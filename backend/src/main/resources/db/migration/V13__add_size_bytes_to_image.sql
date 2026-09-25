-- Byte size of the object the presigned URL was issued for, declared by the
-- client at presign time and made binding by signing Content-Length into the
-- URL (SellerProductService) - a PUT carrying any other length fails the
-- signature check, so this column can be trusted as what the bucket holds.
--
-- Exists to answer one question cheaply: how many bytes has this deployment
-- stored? Object storage is billed by the GB and the free tiers stop being free
-- past 10 GB, so the upload endpoint refuses new URLs once the total reaches the
-- cap rather than letting the bill run (app.s3.max-total-bytes).
--
-- Nullable: rows created before this migration were issued without a signed
-- length, and there is no honest size to backfill them with. They count as 0
-- toward the cap, which is the only thing that doesn't invent data.
ALTER TABLE image ADD COLUMN size_bytes BIGINT;

ALTER TABLE image ADD CONSTRAINT image_size_bytes_non_negative
    CHECK (size_bytes IS NULL OR size_bytes >= 0);

-- The cap query sums size_bytes filtered by status, and the pending-reservation
-- half of it also filters on created_at.
CREATE INDEX idx_image_status_created_at ON image(status, created_at);
