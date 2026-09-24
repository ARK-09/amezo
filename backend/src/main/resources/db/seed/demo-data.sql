-- Demo account seed: one seller, 5 products (7 variants/offers), 5 buyers,
-- 5 orders (one of each status: 2 PLACED, 2 SHIPPED, 1 DELIVERED).
--
-- NOT a Flyway migration on purpose - it lives outside db/migration, so
-- Flyway never applies it (locations: classpath:db/migration only) and it
-- never touches the Testcontainers databases the test suite spins up.
-- Demo data you want to reset/edit later is a bad fit for Flyway's
-- checksum-locked, run-once-forever migrations anyway.
--
-- Run manually against the local Postgres from application.yml
-- (jdbc:postgresql://localhost:5432/marketplace) after the app has already
-- run once (migrations must exist first):
--   psql "postgresql://postgres:root@localhost:5432/marketplace" \
--     -f backend/src/main/resources/db/seed/demo-data.sql
--
-- Idempotent: safe to re-run, existing rows are left as-is.
-- Sign in to the seller portal with demo@example.com to see this data.

INSERT INTO seller (id, email, full_name) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'demo@example.com', 'Demo Seller')
ON CONFLICT (id) DO NOTHING;

INSERT INTO buyer_identity (id, email, full_name) VALUES
    ('bbbbbbbb-0000-0000-0000-000000000001', 'alex@example.com', 'Alex Kim'),
    ('bbbbbbbb-0000-0000-0000-000000000002', 'priya@example.com', 'Priya Nair'),
    ('bbbbbbbb-0000-0000-0000-000000000003', 'morgan@example.com', 'Morgan Lee'),
    ('bbbbbbbb-0000-0000-0000-000000000004', 'sam@example.com', 'Sam Patel'),
    ('bbbbbbbb-0000-0000-0000-000000000005', 'jamie@example.com', 'Jamie Ortiz')
ON CONFLICT (id) DO NOTHING;

INSERT INTO product (id, seller_id, title, brand_name, category) VALUES
    ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Wireless Noise-Cancelling Headphones', 'Aurora Audio', 'Electronics'),
    ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '14" Ultrabook Laptop, 16GB RAM', 'Vexel', 'Electronics'),
    ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ceramic Non-Stick Cookware Set (10-piece)', 'Hearth & Home', 'Kitchen'),
    ('cccccccc-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Mechanical Keyboard, Hot-Swappable', 'Vexel', 'Electronics'),
    ('cccccccc-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'Stainless Steel Water Bottle, 32oz', 'Hearth & Home', 'Outdoor')
ON CONFLICT (id) DO NOTHING;

INSERT INTO variant (id, product_id, label, sku) VALUES
    ('dddddddd-0001-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'Black', 'DEMO-HP-BLK'),
    ('dddddddd-0001-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', 'White', 'DEMO-HP-WHT'),
    ('dddddddd-0002-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002', 'Standard', 'DEMO-LT-STD'),
    ('dddddddd-0003-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', 'Standard', 'DEMO-CK-STD'),
    ('dddddddd-0004-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000004', 'Black', 'DEMO-KB-BLK'),
    ('dddddddd-0004-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000004', 'White', 'DEMO-KB-WHT'),
    ('dddddddd-0005-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000005', 'Standard', 'DEMO-WB-STD')
ON CONFLICT (id) DO NOTHING;

INSERT INTO offer (id, variant_id, price, stock_qty) VALUES
    ('eeeeeeee-0001-0000-0000-000000000001', 'dddddddd-0001-0000-0000-000000000001', 129.99, 8),
    ('eeeeeeee-0001-0000-0000-000000000002', 'dddddddd-0001-0000-0000-000000000002', 139.99, 3),
    ('eeeeeeee-0002-0000-0000-000000000001', 'dddddddd-0002-0000-0000-000000000001', 899.00, 12),
    ('eeeeeeee-0003-0000-0000-000000000001', 'dddddddd-0003-0000-0000-000000000001', 74.50, 12),
    ('eeeeeeee-0004-0000-0000-000000000001', 'dddddddd-0004-0000-0000-000000000001', 149.00, 8),
    ('eeeeeeee-0004-0000-0000-000000000002', 'dddddddd-0004-0000-0000-000000000002', 159.00, 3),
    ('eeeeeeee-0005-0000-0000-000000000001', 'dddddddd-0005-0000-0000-000000000001', 22.00, 12)
ON CONFLICT (id) DO NOTHING;

-- Orders: buyer_phone/shipping/billing are NOT NULL since V12, so every
-- order needs a full fabricated address even though the UI doesn't show it.
INSERT INTO orders (
    id, buyer_identity_id, seller_id, buyer_email_snapshot, buyer_phone, status,
    tracking_number, shipped_at, placed_at,
    shipping_full_name, shipping_line1, shipping_city, shipping_state, shipping_postal_code, shipping_country,
    billing_same_as_shipping,
    billing_full_name, billing_line1, billing_city, billing_state, billing_postal_code, billing_country
) VALUES
    ('ffffffff-0001-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'alex@example.com', '+1-555-0101', 'PLACED',
     NULL, NULL, '2026-09-23T14:12:00Z',
     'Alex Kim', '123 Demo St', 'Springfield', 'IL', '62701', 'US',
     true, 'Alex Kim', '123 Demo St', 'Springfield', 'IL', '62701', 'US'),
    ('ffffffff-0002-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'priya@example.com', '+1-555-0102', 'PLACED',
     NULL, NULL, '2026-09-22T09:45:00Z',
     'Priya Nair', '456 Demo Ave', 'Austin', 'TX', '73301', 'US',
     true, 'Priya Nair', '456 Demo Ave', 'Austin', 'TX', '73301', 'US'),
    ('ffffffff-0003-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'morgan@example.com', '+1-555-0103', 'SHIPPED',
     '1Z999AA10123456784', '2026-09-21T16:05:00Z', '2026-09-20T18:30:00Z',
     'Morgan Lee', '789 Demo Blvd', 'Denver', 'CO', '80014', 'US',
     true, 'Morgan Lee', '789 Demo Blvd', 'Denver', 'CO', '80014', 'US'),
    ('ffffffff-0004-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'sam@example.com', '+1-555-0104', 'SHIPPED',
     '9400111899223197428490', '2026-09-19T22:15:00Z', '2026-09-19T11:00:00Z',
     'Sam Patel', '321 Demo Cir', 'Seattle', 'WA', '98101', 'US',
     true, 'Sam Patel', '321 Demo Cir', 'Seattle', 'WA', '98101', 'US'),
    ('ffffffff-0005-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'jamie@example.com', '+1-555-0105', 'DELIVERED',
     '1Z999AA10198765436', '2026-09-15T20:00:00Z', '2026-09-15T08:20:00Z',
     'Jamie Ortiz', '654 Demo Way', 'Miami', 'FL', '33101', 'US',
     true, 'Jamie Ortiz', '654 Demo Way', 'Miami', 'FL', '33101', 'US')
ON CONFLICT (id) DO NOTHING;

INSERT INTO order_line (id, order_id, offer_id, product_id_snapshot, variant_id_snapshot, seller_id_snapshot, unit_price_snapshot, quantity) VALUES
    -- Order 1: Headphones (Black) x1 = 129.99
    ('ffffffff-0001-0000-0000-000000000001', 'ffffffff-0001-0000-0000-000000000000', 'eeeeeeee-0001-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0001-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 129.99, 1),
    -- Order 2: Keyboard (White) x1 = 159.00, Water Bottle x2 = 44.00 -> total 203.00
    ('ffffffff-0002-0000-0000-000000000001', 'ffffffff-0002-0000-0000-000000000000', 'eeeeeeee-0004-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000004', 'dddddddd-0004-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 159.00, 1),
    ('ffffffff-0002-0000-0000-000000000002', 'ffffffff-0002-0000-0000-000000000000', 'eeeeeeee-0005-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000005', 'dddddddd-0005-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 22.00, 2),
    -- Order 3: Laptop x1 = 899.00
    ('ffffffff-0003-0000-0000-000000000001', 'ffffffff-0003-0000-0000-000000000000', 'eeeeeeee-0002-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002', 'dddddddd-0002-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 899.00, 1),
    -- Order 4: Cookware x1 = 74.50, Water Bottle x1 = 22.00 -> total 96.50
    ('ffffffff-0004-0000-0000-000000000001', 'ffffffff-0004-0000-0000-000000000000', 'eeeeeeee-0003-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', 'dddddddd-0003-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 74.50, 1),
    ('ffffffff-0004-0000-0000-000000000002', 'ffffffff-0004-0000-0000-000000000000', 'eeeeeeee-0005-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000005', 'dddddddd-0005-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 22.00, 1),
    -- Order 5: Headphones (White) x1 = 139.99
    ('ffffffff-0005-0000-0000-000000000001', 'ffffffff-0005-0000-0000-000000000000', 'eeeeeeee-0001-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0001-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 139.99, 1)
ON CONFLICT (id) DO NOTHING;
