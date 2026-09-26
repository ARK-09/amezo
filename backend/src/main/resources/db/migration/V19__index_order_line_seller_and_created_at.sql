-- Every seller-dashboard query reads order_line the same way: one seller, one
-- half-open window of created_at. V10 indexed seller_id_snapshot on its own,
-- which gets the seller's rows but then leaves Postgres filtering all of their
-- history row by row to find the thirty days asked for - and a seller's history
-- only ever grows, while the window stays the same size.
--
-- Column order matters and is not arbitrary: seller_id_snapshot is always an
-- equality test and created_at always a range, so the equality column has to
-- come first for the range to be an index scan rather than a filter.
--
-- idx_order_line_seller_id_snapshot (V10) is left in place. This index has it as
-- a prefix and could replace it, but dropping an index is a change to how every
-- existing query plans, which is not what this migration is for.
CREATE INDEX idx_order_line_seller_created_at
    ON order_line (seller_id_snapshot, created_at);
