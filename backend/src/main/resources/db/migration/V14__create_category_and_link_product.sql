-- Categories become system-managed data instead of a free-text column. A seller
-- picks from this table; nothing accepts a typed-in name any more (see
-- CategoryService.requireActive, which every product write goes through).
--
-- slug is the stable machine value: it travels in URLs and in the ?category=
-- filter, and it does not change when the display name is edited. name is what
-- every screen shows. active retires a category without deleting it, so the
-- products already filed under it keep their history and their FK.
CREATE TABLE category (
    id UUID PRIMARY KEY,
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    -- Merchandising order for the category rail and the selector. Not the
    -- alphabetical order, because "Electronics" outranking "Apparel" is a
    -- business decision, not a lexical one.
    position INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The system list. Matches the icons CategoryRail already ships, so every
-- seeded category renders with its own icon rather than the generic parcel.
INSERT INTO category (id, slug, name, position) VALUES
    (gen_random_uuid(), 'electronics', 'Electronics', 10),
    (gen_random_uuid(), 'apparel',     'Apparel',     20),
    (gen_random_uuid(), 'footwear',    'Footwear',    30),
    (gen_random_uuid(), 'kitchen',     'Kitchen',     40),
    (gen_random_uuid(), 'outdoor',     'Outdoor',     50),
    (gen_random_uuid(), 'sports',      'Sports',      60),
    (gen_random_uuid(), 'books',       'Books',       70),
    (gen_random_uuid(), 'toys',        'Toys',        80),
    (gen_random_uuid(), 'baby',        'Baby',        90),
    (gen_random_uuid(), 'beauty',      'Beauty',     100),
    (gen_random_uuid(), 'home',        'Home',       110),
    (gen_random_uuid(), 'automotive',  'Automotive', 120);

ALTER TABLE product ADD COLUMN category_id UUID REFERENCES category(id);

-- Whatever sellers typed before this migration is real catalog data, so it is
-- adopted rather than discarded: any existing category name that isn't in the
-- system list above becomes an active category of its own. Position 1000 keeps
-- these behind the curated ones in the rail.
--
-- A one-time slug helper, created and dropped inside this migration so it leaves
-- nothing behind in the schema. Java's Slugs.slugify owns slug generation from here
-- on and folds Unicode properly (NFKD); this only has to handle the data that
-- predates the column.
--
-- translate() maps character to character, so the common Latin-1 accents fold to
-- their base letter ("Café" -> "cafe") instead of collapsing to a hyphen. It cannot
-- express the multi-letter expansions a full folder would (no s-sharp -> ss), which
-- is the honest limit of doing this in SQL rather than a reason to drop letters.
-- OR REPLACE, not a bare CREATE: Flyway runs every pending migration on ONE
-- connection, so a pg_temp function created by an earlier migration in the same
-- deploy is still there when this one runs. A bare CREATE works when each file is
-- applied in its own session (psql) and fails on a real migration run - exactly the
-- kind of difference that only shows up in deployment.
CREATE OR REPLACE FUNCTION pg_temp.legacy_slug(raw text) RETURNS text AS $$
    SELECT COALESCE(
        NULLIF(
            left(
                trim(both '-' from regexp_replace(
                    translate(
                        lower(raw),
                        'àáâãäåāăąèéêëēĕėęěìíîïĩīĭįòóôõöøōŏőùúûüũūŭůýÿñńçćčšśžźżđłğ',
                        'aaaaaaaaaeeeeeeeeeiiiiiiiiooooooooouuuuuuuuyynncccsszzzdlg'
                    ),
                    '[^a-z0-9]+', '-', 'g'
                )),
                200
            ),
            ''
        ),
        'product'
    );
$$ LANGUAGE sql IMMUTABLE;

INSERT INTO category (id, slug, name, active, position)
SELECT gen_random_uuid(), pg_temp.legacy_slug(legacy.category), legacy.category, TRUE, 1000
FROM (SELECT DISTINCT category FROM product) legacy
WHERE NOT EXISTS (
    SELECT 1 FROM category c WHERE c.slug = pg_temp.legacy_slug(legacy.category)
);

-- Matched on slug alone, never on name: the INSERT above guarantees a row with
-- exactly this slug exists, and matching "name OR slug" could pair one product
-- with two different rows. Different casings of the same name ("Apparel" and
-- "apparel") slug identically, so they converge on one category instead of
-- producing two.
UPDATE product p
SET category_id = c.id
FROM category c
WHERE c.slug = pg_temp.legacy_slug(p.category);

ALTER TABLE product ALTER COLUMN category_id SET NOT NULL;
ALTER TABLE product DROP COLUMN category;

CREATE INDEX idx_product_category_id ON product(category_id);
