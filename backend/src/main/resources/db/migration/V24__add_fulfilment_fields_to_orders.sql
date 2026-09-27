-- The fulfilment lifecycle the seller actually drives, and the two facts the
-- order drawer prints about it.
--
-- V9 admitted three statuses: PLACED, SHIPPED, DELIVERED. The contract's
-- OrderStatus has eight, and the Seller Orders screen groups them into six tabs
-- - "To pack" is PLACED, "Ready for pickup" is PACKED, "With Amezo" is the
-- carrier states. PACKED had no way to be stored at all, so the order queue
-- could not distinguish an order waiting to be packed from one boxed and
-- waiting for collection, and two of the six tabs were permanently empty.
--
-- What this adds, and what it deliberately does NOT:
--
--   PACKED    - added. SellerOrderTransition lets a seller write it.
--   CANCELLED - added. A seller may cancel an order while it is still PLACED;
--               SellerOrderService restores the reserved stock when they do.
--               No money moves, because checkout takes no payment.
--   REFUNDED  - NOT added, on purpose. It is DERIVED from the order's refund
--               request reaching REFUNDED (refunds.api.OrderRefundQuery
--               .refundedOrderIds) and is never stored. A column a client could
--               also write would be a second source of truth that nothing
--               reconciles the first time somebody settles a refund from the
--               refund queue instead of from the order.
--   IN_TRANSIT / OUT_FOR_DELIVERY - NOT added. Nothing in this system produces
--               them: there is no carrier integration and no webhook. The
--               contract keeps them because the tab that spans them exists, and
--               a status no code can write has no business in a CHECK
--               constraint pretending it might appear.
ALTER TABLE orders DROP CONSTRAINT orders_status_check;

ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('PLACED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'));

ALTER TABLE orders
    -- When the seller marked it packed. A real timestamp rather than something
    -- inferred from the status, so the drawer's timeline can print the date
    -- instead of a tick with no date beside it.
    ADD COLUMN packed_at TIMESTAMPTZ,

    -- How many parcels the order went out as. The seller types it when packing;
    -- SellerOrderRowDetail.parcels reads it back. Nullable because an order that
    -- has not been packed has no answer, and >= 1 because a packed order that is
    -- zero parcels is not packed.
    ADD COLUMN parcels INTEGER CHECK (parcels IS NULL OR parcels >= 1),

    ADD COLUMN cancelled_at TIMESTAMPTZ;
