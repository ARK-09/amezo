package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.identity.IdentityType;
import com.arkindustries.amezo.identity.Seller;
import com.arkindustries.amezo.identity.SellerRepository;
import com.arkindustries.amezo.identity.SessionRepository;
import com.arkindustries.amezo.support.Fixtures;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Slugs end to end through the API: generated on create, unique across sellers,
 * stable across renames, and resolvable alongside the legacy id form.
 *
 * SlugsTest covers the string rules on their own; this covers the parts that need a
 * database - the uniqueness check against real rows, and what the endpoints do.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ProductSlugApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private SellerRepository sellerRepository;

    @Autowired
    private SessionRepository sessionRepository;

    @Test
    void generatesAReadableSlugFromTheTitle() throws Exception {
        create(signIn("slug-basic@example.com"), "Classic Cotton T-Shirt", "SLUG-BASIC-1");

        mockMvc.perform(get("/products/classic-cotton-t-shirt"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.slug").value("classic-cotton-t-shirt"))
                .andExpect(jsonPath("$.title").value("Classic Cotton T-Shirt"));
    }

    /** The slug is on every read surface, because every link is built from it. */
    @Test
    void exposesTheSlugOnSearchAndOnTheSellerList() throws Exception {
        Cookie session = signIn("slug-surfaces@example.com");
        create(session, "Slug On Every Surface", "SLUG-SURF-1");

        mockMvc.perform(get("/products").param("q", "Slug On Every Surface"))
                .andExpect(jsonPath("$.content[0].slug").value("slug-on-every-surface"));
        mockMvc.perform(get("/sellers/me/products").cookie(session))
                .andExpect(jsonPath("$.content[0].slug").value("slug-on-every-surface"));
    }

    /**
     * Two sellers listing the same product is ordinary. The second one must still
     * get a URL, and it must be a different one.
     */
    @Test
    void numbersDuplicateTitlesAcrossDifferentSellers() throws Exception {
        create(signIn("slug-dup-a@example.com"), "Shared Product Title", "SLUG-DUP-A");
        create(signIn("slug-dup-b@example.com"), "Shared Product Title", "SLUG-DUP-B");
        create(signIn("slug-dup-c@example.com"), "Shared Product Title", "SLUG-DUP-C");

        assertThat(productRepository.findBySlug("shared-product-title")).isPresent();
        assertThat(productRepository.findBySlug("shared-product-title-2")).isPresent();
        assertThat(productRepository.findBySlug("shared-product-title-3")).isPresent();
    }

    @Test
    void foldsAccentsAndPunctuationIntoAUrlSafeSlug() throws Exception {
        create(signIn("slug-accents@example.com"), "Café Crème Grinder — Deluxe!", "SLUG-ACC-1");

        mockMvc.perform(get("/products/cafe-creme-grinder-deluxe"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Café Crème Grinder — Deluxe!"));
    }

    /** A title with nothing sluggable still has to be reachable. */
    @Test
    void fallsBackForATitleWithNoUsableCharacters() throws Exception {
        create(signIn("slug-junk@example.com"), "!!!", "SLUG-JUNK-1");

        String slug = productRepository.findAll().stream()
                .filter(p -> p.getTitle().equals("!!!"))
                .findFirst().orElseThrow().getSlug();

        assertThat(slug).startsWith("product");
        mockMvc.perform(get("/products/{slug}", slug)).andExpect(status().isOk());
    }

    /**
     * The stability rule, and the reason it exists: links already handed out have to
     * keep working, so renaming a product leaves its URL alone.
     */
    @Test
    void keepsTheSlugWhenTheTitleChanges() throws Exception {
        Cookie session = signIn("slug-rename@example.com");
        String id = create(session, "Original Name Here", "SLUG-REN-1");

        mockMvc.perform(patch("/products/{id}", id).cookie(session)
                        .contentType("application/json")
                        .content("{\"title\":\"Completely Different Name\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Completely Different Name"))
                .andExpect(jsonPath("$.slug").value("original-name-here"));

        // The old URL still resolves - which is the whole point.
        mockMvc.perform(get("/products/original-name-here"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Completely Different Name"));
        // And the new title's slug was never minted.
        mockMvc.perform(get("/products/completely-different-name"))
                .andExpect(status().isNotFound());
    }

    /**
     * Links minted before slugs existed are still out there. An id resolves to the
     * same product rather than 404ing, so an old bookmark is a redirect on the
     * frontend instead of a dead end.
     */
    @Test
    void stillResolvesALegacyIdUrl() throws Exception {
        String id = create(signIn("slug-legacy@example.com"), "Legacy Link Product", "SLUG-LEG-1");

        mockMvc.perform(get("/products/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.slug").value("legacy-link-product"));
    }

    @Test
    void returnsNotFoundForASlugThatDoesNotExist() throws Exception {
        mockMvc.perform(get("/products/no-such-product-anywhere"))
                .andExpect(status().isNotFound());
    }

    /** A well-formed id for a product that isn't there is still a 404, not a 500. */
    @Test
    void returnsNotFoundForAnUnknownId() throws Exception {
        mockMvc.perform(get("/products/{id}", "99999999-9999-9999-9999-999999999999"))
                .andExpect(status().isNotFound());
    }

    /** Reviews are nested under the product, so they resolve by slug too. */
    @Test
    void resolvesNestedReviewsBySlug() throws Exception {
        create(signIn("slug-reviews@example.com"), "Reviewed By Slug", "SLUG-REV-1");

        mockMvc.perform(get("/products/reviewed-by-slug/reviews"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    private Cookie signIn(String email) {
        Seller seller = sellerRepository.save(Seller.builder().email(email).build());
        return Fixtures.sessionCookie(sessionRepository, IdentityType.SELLER, seller.getId());
    }

    private String create(Cookie session, String title, String sku) throws Exception {
        MvcResult result = mockMvc.perform(post("/sellers/me/products").cookie(session)
                        .contentType("application/json")
                        .content("""
                            {
                              "title": %s,
                              "categorySlug": "outdoor",
                              "variants": [{"label":"One","sku":"%s","price":10.00,"stockQty":2}]
                            }
                            """.formatted(objectMapper.writeValueAsString(title), sku)))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }
}
