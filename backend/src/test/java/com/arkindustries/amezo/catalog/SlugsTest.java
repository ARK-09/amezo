package com.arkindustries.amezo.catalog;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Slug generation, in a plain unit test - no Spring, no Postgres. This is the code
 * that decides what every product URL looks like, and it runs without a Docker
 * daemon, which the integration suite needs.
 */
class SlugsTest {

    @Test
    void lowercasesAndHyphenatesWords() {
        assertThat(Slugs.slugify("Classic Cotton T-Shirt")).isEqualTo("classic-cotton-t-shirt");
    }

    /** The headline requirement: an id-shaped URL becomes a readable one. */
    @Test
    void producesTheExampleFromTheBrief() {
        assertThat(Slugs.slugify("Classic Cotton T-Shirt")).isEqualTo("classic-cotton-t-shirt");
    }

    @Test
    void foldsAccentsToTheirBaseLetters() {
        assertThat(Slugs.slugify("Café Crème")).isEqualTo("cafe-creme");
        assertThat(Slugs.slugify("Jalapeño Piñata")).isEqualTo("jalapeno-pinata");
        assertThat(Slugs.slugify("Æther Œuvre")).isEqualTo("aether-oeuvre");
    }

    /**
     * Punctuation, symbols and runs of whitespace all collapse to one hyphen, so no
     * slug ever needs percent-encoding - a slug that had to be escaped to appear in
     * a URL would defeat the point of having one.
     */
    @Test
    void collapsesPunctuationAndWhitespaceWithoutNeedingUrlEncoding() {
        String slug = Slugs.slugify("  Deluxe   Grinder — 50% off!! (2024)  ");
        assertThat(slug).isEqualTo("deluxe-grinder-50-off-2024");
        assertThat(slug).matches("[a-z0-9-]+");
        assertThat(java.net.URLEncoder.encode(slug, java.nio.charset.StandardCharsets.UTF_8)).isEqualTo(slug);
    }

    @Test
    void trimsLeadingAndTrailingHyphens() {
        assertThat(Slugs.slugify("¡Hola!")).isEqualTo("hola");
        assertThat(Slugs.slugify("---dashes---")).isEqualTo("dashes");
    }

    @Test
    void handlesAmpersandsAndSlashes() {
        assertThat(Slugs.slugify("Home & Garden / Outdoor")).isEqualTo("home-garden-outdoor");
    }

    /**
     * A title with nothing sluggable in it still has to produce a reachable URL.
     * Emoji, CJK and pure punctuation all land here.
     */
    @Test
    void fallsBackWhenThereIsNothingSluggable() {
        assertThat(Slugs.slugify("!!!")).isEqualTo("product");
        assertThat(Slugs.slugify("日本語")).isEqualTo("product");
        assertThat(Slugs.slugify("🎉🎉")).isEqualTo("product");
        assertThat(Slugs.slugify("")).isEqualTo("product");
        assertThat(Slugs.slugify(null)).isEqualTo("product");
    }

    @Test
    void capsLengthAndCutsBackToAWordBoundary() {
        String longTitle = "Premium Ultra Deluxe Professional Grade Stainless Steel Kitchen Utensil "
                + "Set With Ergonomic Handles And Lifetime Warranty Plus Free Shipping Worldwide "
                + "And A Very Long Tail Of Extra Marketing Words";

        String slug = Slugs.slugify(longTitle);

        assertThat(slug.length()).isLessThanOrEqualTo(Slugs.MAX_LENGTH);
        // Cut at a hyphen, so the slug never ends mid-word.
        assertThat(longTitle.toLowerCase().replace(' ', '-')).startsWith(slug);
        assertThat(slug).doesNotEndWith("-");
    }

    /** One very long word can't be cut at a boundary, and must still fit. */
    @Test
    void truncatesASingleOverlongWord() {
        String slug = Slugs.slugify("a".repeat(500));
        assertThat(slug).hasSize(Slugs.MAX_LENGTH);
    }

    @Test
    void firstUseOfATitleGetsTheBareSlug() {
        assertThat(Slugs.uniqueSlug("Classic Cotton T-Shirt", taken -> false))
                .isEqualTo("classic-cotton-t-shirt");
    }

    /**
     * Two sellers listing the same thing is ordinary, so the second one counts up
     * rather than failing or getting a random suffix - the URL stays readable and
     * the result is reproducible.
     */
    @Test
    void laterUsesCountUp() {
        Set<String> used = new HashSet<>(Set.of("classic-cotton-t-shirt"));
        assertThat(Slugs.uniqueSlug("Classic Cotton T-Shirt", used::contains))
                .isEqualTo("classic-cotton-t-shirt-2");

        used.add("classic-cotton-t-shirt-2");
        assertThat(Slugs.uniqueSlug("Classic Cotton T-Shirt", used::contains))
                .isEqualTo("classic-cotton-t-shirt-3");
    }

    /** The fallback is de-duplicated the same way, so two junk titles both resolve. */
    @Test
    void deduplicatesTheFallbackToo() {
        Set<String> used = new HashSet<>(Set.of("product"));
        assertThat(Slugs.uniqueSlug("!!!", used::contains)).isEqualTo("product-2");
    }

    /** Titles that differ only in case or punctuation collide, and must be numbered. */
    @Test
    void treatsCaseAndPunctuationVariantsAsTheSameSlug()  {
        Set<String> used = new HashSet<>();
        String first = Slugs.uniqueSlug("Red Shoes", used::contains);
        used.add(first);
        String second = Slugs.uniqueSlug("RED  SHOES!", used::contains);

        assertThat(first).isEqualTo("red-shoes");
        assertThat(second).isEqualTo("red-shoes-2");
    }
}
