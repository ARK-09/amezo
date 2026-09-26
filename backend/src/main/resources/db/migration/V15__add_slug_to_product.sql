-- Product URLs stop carrying the primary key. /products/classic-cotton-t-shirt
-- instead of /products/49cec0bd-30be-45c7-ae8b-4952c733b484.
--
-- The slug is generated once, from the title, and then left alone: a seller
-- renaming a product does not move its URL, because every link already handed
-- out - a buyer's bookmark, a shared page, a search engine's index - points at
-- the old one. Slugs.slugify owns generation for new products; this backfill
-- only has to cover the rows that predate the column.
ALTER TABLE product ADD COLUMN slug VARCHAR(255);

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

-- Two products legitimately share a title ("Classic Cotton T-Shirt" from two
-- sellers), so the base slug is not unique on its own. row_number over the base
-- gives the second and later ones a -2, -3 suffix, ordered by id so the result is
-- deterministic and re-runnable.
--
-- A title with nothing sluggable in it at all falls back to 'product', exactly as
-- Slugs.FALLBACK does, and the same numbering keeps those unique too.
WITH slugged AS (
    SELECT id, pg_temp.legacy_slug(title) AS base FROM product
), numbered AS (
    SELECT id, base, row_number() OVER (PARTITION BY base ORDER BY id) AS n
    FROM slugged
)
UPDATE product p
SET slug = CASE WHEN n.n = 1 THEN n.base ELSE n.base || '-' || n.n END
FROM numbered n
WHERE n.id = p.id;

ALTER TABLE product ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX product_slug_key ON product(slug);
