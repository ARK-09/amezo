package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.identity.Seller;
import com.arkindustries.amezo.identity.SellerRepository;
import com.arkindustries.amezo.identity.SellerStore;
import com.arkindustries.amezo.identity.SellerStoreRepository;
import com.arkindustries.amezo.support.Fixtures;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The public storefront, and the store a product carries.
 *
 * Both were contract-and-mock only before: GET /api/v1/stores/{handle} and its
 * listings had no controller, so SecurityConfig's anyRequest().denyAll() answered 403,
 * and product responses carried no store at all - only brandName, which is free text
 * the seller types per product and cannot address a storefront.
 *
 * The relationship under test is transitive and has no join table:
 * product.seller_id -> seller <- seller_store.seller_id, with that column UNIQUE (V18).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class StorefrontApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private SellerRepository sellerRepository;

    @Autowired
    private SellerStoreRepository sellerStoreRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private VariantRepository variantRepository;

    @Autowired
    private OfferRepository offerRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    @Test
    void theStoreHeaderIsPublicAndCountsOnlyThisSellersLiveListings() throws Exception {
        Seller seller = seller();
        SellerStore store = store(seller, "Aurora Audio");
        Product stocked = product(seller, "Aurora One Headphones", "electronics");
        offer(stocked, "199.00", 4);
        Product soldOut = product(seller, "Aurora Travel Case", "electronics");
        offer(soldOut, "29.00", 0);
        Product inAnotherCategory = product(seller, "Aurora Desk Mat", "furniture");
        offer(inAnotherCategory, "39.00", 2);
        Product draft = product(seller, "Aurora Two Prototype", "electronics");
        draft.setStatus(ProductStatus.DRAFT);
        productRepository.save(draft);

        // No cookie: a shop window is anonymous by definition.
        mockMvc.perform(get("/api/v1/stores/{handle}", store.getHandle()))
                .andExpect(status().isOk())
                // The SELLER's id, which is what ProductSummary.store.id carries too -
                // that is how a storefront recognises its own listings by key.
                .andExpect(jsonPath("$.id").value(seller.getId().toString()))
                .andExpect(jsonPath("$.name").value("Aurora Audio"))
                .andExpect(jsonPath("$.handle").value(store.getHandle()))
                .andExpect(jsonPath("$.status").value("OPEN"))
                // Three live listings, two of them buyable. The draft is in neither.
                .andExpect(jsonPath("$.productCount").value(3))
                .andExpect(jsonPath("$.inStockCount").value(2))
                // The store's own facets, which a page of listings could not tell you
                // and the system category list would over-offer.
                .andExpect(jsonPath("$.categories.length()").value(2))
                // Nobody has reviewed anything, so there is no rating - not zero stars.
                .andExpect(jsonPath("$.averageRating").doesNotExist())
                .andExpect(jsonPath("$.ratingCount").value(0))
                .andExpect(jsonPath("$.joinedAt").exists())
                // Returned as a defined shape with every field null: seller_store has no
                // policy columns and Store Settings has no fields to author them with, so
                // a value here would be a promise the seller never made.
                .andExpect(jsonPath("$.policies").exists())
                .andExpect(jsonPath("$.policies.shipping").doesNotExist())
                .andExpect(jsonPath("$.policies.returns").doesNotExist())
                // Nothing records either of these, and null is not the same claim as 0.
                .andExpect(jsonPath("$.positiveRatingPct").doesNotExist())
                .andExpect(jsonPath("$.medianResponseMinutes").doesNotExist())
                // Null rather than false: there is no follow relation in this system, so
                // "you are not following" would be an answer about a thing that cannot
                // happen.
                .andExpect(jsonPath("$.following").doesNotExist());
    }

    @Test
    void aHandleThatNamesNoStoreIs404() throws Exception {
        mockMvc.perform(get("/api/v1/stores/{handle}", "no-such-store"))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/stores/{handle}/products", "no-such-store"))
                .andExpect(status().isNotFound());
    }

    @Test
    void theListingsArePagedServerSideAndScopedToThisStore() throws Exception {
        Seller seller = seller();
        Seller other = seller();
        SellerStore store = store(seller, "Paged Goods");
        store(other, "Other Goods");

        Product first = product(seller, "Kettle", "kitchen");
        offer(first, "25.00", 1);
        Product second = product(seller, "Toaster", "kitchen");
        offer(second, "35.00", 1);
        Product third = product(seller, "Lamp", "lighting");
        offer(third, "45.00", 1);
        Product theirs = product(other, "Kettle", "kitchen");
        offer(theirs, "15.00", 1);

        mockMvc.perform(get("/api/v1/stores/{handle}/products", store.getHandle())
                        .param("size", "2").param("page", "0"))
                .andExpect(status().isOk())
                // The contract's four fields, not Spring's Page - a client reading
                // `page` off that shape gets undefined.
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.content.length()").value(2));

        // Every card carries the store it is listed by, so the grid can link by handle.
        mockMvc.perform(get("/api/v1/stores/{handle}/products", store.getHandle()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].store.id").value(seller.getId().toString()))
                .andExpect(jsonPath("$.content[0].store.handle").value(store.getHandle()))
                .andExpect(jsonPath("$.content[0].store.name").value("Paged Goods"));

        // Within this store only: the other seller's Kettle is not in these results,
        // which is what used to go wrong when the page matched on brandName instead.
        mockMvc.perform(get("/api/v1/stores/{handle}/products", store.getHandle())
                        .param("q", "Kettle"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(first.getId().toString()));

        mockMvc.perform(get("/api/v1/stores/{handle}/products", store.getHandle())
                        .param("category", "lighting"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(third.getId().toString()));

        // The storefront's own sort vocabulary, translated once rather than by the
        // client - two vocabularies for one window is what broke the order facets.
        mockMvc.perform(get("/api/v1/stores/{handle}/products", store.getHandle())
                        .param("sort", "priceAsc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(first.getId().toString()));
        mockMvc.perform(get("/api/v1/stores/{handle}/products", store.getHandle())
                        .param("sort", "priceDesc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(third.getId().toString()));
    }

    @Test
    void aStoresDraftListingIsNotOnItsStorefront() throws Exception {
        Seller seller = seller();
        SellerStore store = store(seller, "Drafty Goods");
        Product live = product(seller, "Published Mug", "kitchen");
        offer(live, "9.00", 2);
        Product draft = product(seller, "Unpublished Mug", "kitchen");
        draft.setStatus(ProductStatus.DRAFT);
        productRepository.save(draft);

        mockMvc.perform(get("/api/v1/stores/{handle}/products", store.getHandle()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(live.getId().toString()));
    }

    @Test
    void aProductCarriesTheStoreThatListsItRatherThanOnlyItsBrandName() throws Exception {
        Seller seller = seller();
        SellerStore store = store(seller, "Aurora Audio");
        Product product = productRepository.save(Product.builder()
                .sellerId(seller.getId())
                // Deliberately different from the store name: brandName is the product's
                // brand, and "Sold by" is the shop. A seller listing someone else's brand
                // is exactly the case a display-name link got wrong.
                .brandName("Sony")
                .title("Noise-Cancelling Headphones")
                .categoryId(Fixtures.categoryId(categoryRepository, "electronics"))
                .slug(Fixtures.uniqueSlug("headphones"))
                .build());
        offer(product, "249.00", 3);

        mockMvc.perform(get("/products/{ref}", product.getSlug()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.brandName").value("Sony"))
                .andExpect(jsonPath("$.store.id").value(seller.getId().toString()))
                .andExpect(jsonPath("$.store.name").value("Aurora Audio"))
                .andExpect(jsonPath("$.store.handle").value(store.getHandle()));

        // And on a search card, so a grid links by handle too.
        mockMvc.perform(get("/products").param("q", "Noise-Cancelling"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].store.handle").value(store.getHandle()));
    }

    @Test
    void aSellerWithNoStoreRowIsStillNamedButCannotBeLinkedTo() throws Exception {
        // Stores are provisioned lazily - V18 does no backfill, and a shopper reading
        // somebody else's product must not create one as a side effect.
        Seller seller = seller();
        Product product = product(seller, "Unstored Widget", "electronics");
        offer(product, "10.00", 1);

        mockMvc.perform(get("/products/{ref}", product.getSlug()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.store.id").value(seller.getId().toString()))
                // Named from the account, because that is true...
                .andExpect(jsonPath("$.store.name").value(seller.getFullName()))
                // ...and with no handle, because a guessed one would not match the one
                // provisioning later assigns and the link would 404.
                .andExpect(jsonPath("$.store.handle").doesNotExist());
    }

    // --------------------------------------------------------------- fixtures

    private Seller seller() {
        return sellerRepository.save(Seller.builder()
                .email("storefront-" + UUID.randomUUID() + "@example.com")
                .fullName("Storefront Seller")
                .build());
    }

    /** Handles are unique and lowercase (V18's CHECK), so each one carries a suffix. */
    private SellerStore store(Seller seller, String name) {
        String handle = name.toLowerCase(Locale.ROOT).replace(' ', '-')
                + "-" + UUID.randomUUID().toString().substring(0, 8);
        return sellerStoreRepository.save(SellerStore.builder()
                .sellerId(seller.getId())
                .name(name)
                .handle(handle)
                .build());
    }

    private Product product(Seller seller, String title, String category) {
        return productRepository.save(Product.builder()
                .sellerId(seller.getId())
                .title(title)
                .categoryId(Fixtures.categoryId(categoryRepository, category))
                .slug(Fixtures.uniqueSlug(title))
                .build());
    }

    private void offer(Product product, String price, int stockQty) {
        Variant variant = variantRepository.save(Variant.builder()
                .productId(product.getId())
                .label("One size")
                .sku("SKU-" + UUID.randomUUID())
                .build());
        offerRepository.save(Offer.builder()
                .variantId(variant.getId())
                .price(new BigDecimal(price))
                .stockQty(stockQty)
                .build());
    }
}
