package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.identity.IdentityType;
import com.arkindustries.amezo.identity.Seller;
import com.arkindustries.amezo.identity.SellerRepository;
import com.arkindustries.amezo.identity.SessionRepository;
import com.arkindustries.amezo.support.Fixtures;
import com.fasterxml.jackson.databind.JsonNode;
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

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Categories as system data: what the list serves, and - the part that matters -
 * that a product cannot be filed under anything else. The API is the place to
 * check this, because the whole point is that a client which skips the selector
 * still cannot invent a category.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class CategoryApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private SellerRepository sellerRepository;

    @Autowired
    private SessionRepository sessionRepository;

    /** The seeded system list is there, and it is public - no session needed. */
    @Test
    void servesTheSeededSystemListWithoutASession() throws Exception {
        MvcResult result = mockMvc.perform(get("/categories"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        List<String> slugs = body.findValuesAsText("slug");

        assertThat(slugs).contains("electronics", "apparel", "footwear", "kitchen", "outdoor");
        assertThat(body.get(0).get("name").asText()).isNotBlank();
    }

    /** Merchandising order, not alphabetical - Electronics leads deliberately. */
    @Test
    void isOrderedByPositionNotByName() throws Exception {
        MvcResult result = mockMvc.perform(get("/categories")).andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());

        assertThat(body.get(0).get("slug").asText()).isEqualTo("electronics");
        assertThat(body.get(1).get("slug").asText()).isEqualTo("apparel");
    }

    /** A retired category is not offered, so nothing new can be filed under it. */
    @Test
    void leavesRetiredCategoriesOutOfTheList() throws Exception {
        Category retired = categoryRepository.save(Category.builder()
                .slug("discontinued").name("Discontinued").active(false).position(500).build());

        MvcResult result = mockMvc.perform(get("/categories")).andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());

        assertThat(body.findValuesAsText("slug")).doesNotContain(retired.getSlug());
    }

    @Test
    void createsAProductUnderASystemCategory() throws Exception {
        Cookie session = signIn("cat-create@example.com");

        mockMvc.perform(post("/sellers/me/products").cookie(session)
                        .contentType("application/json")
                        .content("""
                            {
                              "title": "Trail Backpack",
                              "categorySlug": "outdoor",
                              "variants": [{"label":"40L","sku":"CAT-TB-40","price":79.99,"stockQty":4}]
                            }
                            """))
                .andExpect(status().isCreated());

        Product saved = productRepository.findBySlug("trail-backpack").orElseThrow();
        Category outdoor = categoryRepository.findBySlug("outdoor").orElseThrow();
        assertThat(saved.getCategoryId()).isEqualTo(outdoor.getId());
    }

    /**
     * The rule the whole table exists for. A client that posts its own string -
     * bypassing the selector entirely - gets a 404 naming the slug, and no product.
     */
    @Test
    void refusesACategoryThatIsNotInTheSystemList() throws Exception {
        Cookie session = signIn("cat-invent@example.com");
        long before = productRepository.count();

        mockMvc.perform(post("/sellers/me/products").cookie(session)
                        .contentType("application/json")
                        .content("""
                            {
                              "title": "Bootleg Product",
                              "categorySlug": "artisanal-nonsense",
                              "variants": [{"label":"One","sku":"CAT-BOOT-1","price":1.00,"stockQty":1}]
                            }
                            """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value(
                        org.hamcrest.Matchers.containsString("artisanal-nonsense")));

        assertThat(productRepository.count()).isEqualTo(before);
        assertThat(categoryRepository.findBySlug("artisanal-nonsense")).isEmpty();
    }

    /** A retired category is refused for the same reason, with the same status. */
    @Test
    void refusesARetiredCategory() throws Exception {
        categoryRepository.save(Category.builder()
                .slug("closed-out").name("Closed Out").active(false).position(501).build());
        Cookie session = signIn("cat-retired@example.com");

        mockMvc.perform(post("/sellers/me/products").cookie(session)
                        .contentType("application/json")
                        .content("""
                            {
                              "title": "Late Arrival",
                              "categorySlug": "closed-out",
                              "variants": [{"label":"One","sku":"CAT-LATE-1","price":1.00,"stockQty":1}]
                            }
                            """))
                .andExpect(status().isNotFound());
    }

    @Test
    void movesAProductToAnotherSystemCategory() throws Exception {
        Cookie session = signIn("cat-move@example.com");
        MvcResult created = mockMvc.perform(post("/sellers/me/products").cookie(session)
                        .contentType("application/json")
                        .content("""
                            {
                              "title": "Moving Product",
                              "categorySlug": "outdoor",
                              "variants": [{"label":"One","sku":"CAT-MOVE-1","price":5.00,"stockQty":1}]
                            }
                            """))
                .andExpect(status().isCreated())
                .andReturn();
        String productId = objectMapper.readTree(created.getResponse().getContentAsString()).get("id").asText();

        mockMvc.perform(patch("/products/{id}", productId).cookie(session)
                        .contentType("application/json")
                        .content("{\"categorySlug\":\"sports\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.category.slug").value("sports"))
                .andExpect(jsonPath("$.category.name").value("Sports"));
    }

    @Test
    void refusesAnInventedCategoryOnEditToo() throws Exception {
        Cookie session = signIn("cat-badedit@example.com");
        MvcResult created = mockMvc.perform(post("/sellers/me/products").cookie(session)
                        .contentType("application/json")
                        .content("""
                            {
                              "title": "Stays Put",
                              "categorySlug": "kitchen",
                              "variants": [{"label":"One","sku":"CAT-STAY-1","price":5.00,"stockQty":1}]
                            }
                            """))
                .andReturn();
        String productId = objectMapper.readTree(created.getResponse().getContentAsString()).get("id").asText();

        mockMvc.perform(patch("/products/{id}", productId).cookie(session)
                        .contentType("application/json")
                        .content("{\"categorySlug\":\"not-a-category\"}"))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/products/stays-put"))
                .andExpect(jsonPath("$.category.slug").value("kitchen"));
    }

    /** Both halves of the pair reach every read surface, ready to display. */
    @Test
    void everyProductReadCarriesTheSlugAndTheDisplayName() throws Exception {
        Cookie session = signIn("cat-reads@example.com");
        mockMvc.perform(post("/sellers/me/products").cookie(session)
                        .contentType("application/json")
                        .content("""
                            {
                              "title": "Read Surfaces",
                              "categorySlug": "books",
                              "variants": [{"label":"One","sku":"CAT-READ-1","price":9.00,"stockQty":2}]
                            }
                            """))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/products/read-surfaces"))
                .andExpect(jsonPath("$.category.slug").value("books"))
                .andExpect(jsonPath("$.category.name").value("Books"));

        mockMvc.perform(get("/products").param("category", "books"))
                .andExpect(jsonPath("$.content[0].category.slug").value("books"))
                .andExpect(jsonPath("$.content[0].category.name").value("Books"));

        mockMvc.perform(get("/sellers/me/products").cookie(session))
                .andExpect(jsonPath("$.content[0].category.slug").value("books"))
                .andExpect(jsonPath("$.content[0].category.name").value("Books"));
    }

    /**
     * A ?category= slug nobody has heard of is an empty result, not a 400: a stale
     * bookmarked filter should show "no products" rather than an error page.
     */
    @Test
    void filteringByAnUnknownSlugReturnsNothingRatherThanFailing() throws Exception {
        mockMvc.perform(get("/products").param("category", "gone-forever"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    /** A signed-in seller. The magic-link flow has its own tests in identity. */
    private Cookie signIn(String email) {
        Seller seller = sellerRepository.save(Seller.builder().email(email).build());
        return Fixtures.sessionCookie(sessionRepository, IdentityType.SELLER, seller.getId());
    }
}
