-- Clothing joins the system list. It was the one category with artwork and no
-- row behind it: the rail drew from `category`, so the image had nothing to
-- attach to and the category simply did not exist for sellers to file under.
--
-- Written to be safe on a database that already has a `clothing` row. V14
-- adopted every free-text category sellers had typed before it ran, so a
-- deployment whose catalog contained "Clothing" already carries that row - at
-- position 1000, behind the curated ones, which is exactly where it should stop
-- being. ON CONFLICT turns this from "insert, and fail on the second
-- deployment" into "make the row look like this either way":
--
--   * fresh database     -> inserted as a first-class category
--   * adopted legacy row -> kept, with its id and every product already filed
--                           under it untouched, and only its presentation
--                           normalised (canonical name, curated position,
--                           re-activated if it had been retired)
--
-- Nothing is reparented and nothing is deleted, so product.category_id stays
-- valid throughout - which is the whole reason this matches on slug rather than
-- inserting a second row and moving products across.
--
-- Position 25 seats it between Apparel (20) and Footwear (30), where a shopper
-- scanning the rail expects to find it.
INSERT INTO category (id, slug, name, active, position)
VALUES (gen_random_uuid(), 'clothing', 'Clothing', TRUE, 25)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    active = TRUE,
    position = EXCLUDED.position;
