package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.identity.Seller;
import com.arkindustries.amezo.identity.SellerRepository;
import com.arkindustries.amezo.support.Fixtures;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Proves the FTS foundation end to end against a real Postgres, not H2:
 * the generated search_vector column, the GIN index, the native
 * plainto_tsquery match/no-match behavior, and the optional filters layered
 * on top of it (all of which are CAST-guarded SQL that only a real Postgres
 * will accept or reject honestly).
 */
@SpringBootTest
@Testcontainers
class ProductRepositorySearchTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private SellerRepository sellerRepository;

    @Autowired
    private VariantRepository variantRepository;

    @Autowired
    private OfferRepository offerRepository;

    /** Unfiltered search - every filter null/false, relevance order. */
    private Page<Product> searchAll(String query) {
        return productRepository.search(query, null, null, null, false, "relevance", PageRequest.of(0, 10));
    }

    private Product product(UUID sellerId, String title, String category) {
        return productRepository.save(Product.builder()
                .sellerId(sellerId)
                .title(title)
                .categoryId(Fixtures.categoryId(categoryRepository, category))
                .slug(Fixtures.uniqueSlug(title))
                .build());
    }

    /** One variant + offer, which is what the price and stock filters read. */
    private void offer(Product product, String price, int stockQty) {
        Variant variant = variantRepository.save(Variant.builder()
                .productId(product.getId())
                .label("default")
                .sku(product.getId() + "-sku")
                .build());
        offerRepository.save(Offer.builder()
                .variantId(variant.getId())
                .price(new BigDecimal(price))
                .stockQty(stockQty)
                .build());
    }

    @Test
    void searchMatchesTitleBrandAndDescriptionButNotUnrelatedProducts() {
        Seller seller = sellerRepository.save(Seller.builder()
                .email("seller@example.com")
                .fullName("Test Seller")
                .build());

        Product matching = productRepository.save(Product.builder()
                .sellerId(seller.getId())
                .title("Wireless Mouse")
                .brandName("Logitech")
                .description("Ergonomic wireless mouse with USB receiver")
                .categoryId(Fixtures.categoryId(categoryRepository, "electronics")).slug(Fixtures.uniqueSlug("fixture"))
                .build());

        productRepository.save(Product.builder()
                .sellerId(seller.getId())
                .title("Braided USB Cable")
                .brandName("Anker")
                .description("Fast charging cable")
                .categoryId(Fixtures.categoryId(categoryRepository, "electronics")).slug(Fixtures.uniqueSlug("fixture"))
                .build());

        Page<Product> results = searchAll("wireless");

        assertThat(results.getContent())
                .extracting(Product::getId)
                .containsExactly(matching.getId());
    }

    @Test
    void nullQueryReturnsEveryProduct() {
        Seller seller = sellerRepository.save(Seller.builder()
                .email("seller2@example.com")
                .fullName("Test Seller Two")
                .build());

        productRepository.save(Product.builder()
                .sellerId(seller.getId())
                .title("Standing Desk")
                .categoryId(Fixtures.categoryId(categoryRepository, "furniture")).slug(Fixtures.uniqueSlug("fixture"))
                .build());

        Page<Product> results = searchAll(null);

        assertThat(results.getTotalElements()).isGreaterThanOrEqualTo(1);
    }
    @Test
    void categoryFilterKeepsOnlyThatCategory() {
        Seller seller = sellerRepository.save(Seller.builder()
                .email("category@example.com").fullName("Category Seller").build());
        Product desk = product(seller.getId(), "Oak Desk", "furniture");
        product(seller.getId(), "Desk Lamp", "electronics");

        Page<Product> results = productRepository.search(
                null, "furniture", null, null, false, "relevance", PageRequest.of(0, 10));

        assertThat(results.getContent()).extracting(Product::getId).contains(desk.getId());
        // The filter takes a slug and joins category, so the assertion checks the
        // FK rather than a name column that no longer exists on product.
        UUID furniture = Fixtures.categoryId(categoryRepository, "furniture");
        assertThat(results.getContent()).allSatisfy(p -> assertThat(p.getCategoryId()).isEqualTo(furniture));
    }

    @Test
    void priceRangeFiltersOnTheCheapestOffer() {
        Seller seller = sellerRepository.save(Seller.builder()
                .email("price@example.com").fullName("Price Seller").build());
        Product cheap = product(seller.getId(), "Budget Chair", "furniture");
        offer(cheap, "25.00", 4);
        Product pricey = product(seller.getId(), "Designer Chair", "furniture");
        offer(pricey, "900.00", 2);

        Page<Product> inRange = productRepository.search(
                null, null, new BigDecimal("10"), new BigDecimal("100"), false, "relevance", PageRequest.of(0, 50));

        assertThat(inRange.getContent()).extracting(Product::getId)
                .contains(cheap.getId())
                .doesNotContain(pricey.getId());
    }

    @Test
    void offerlessProductSurvivesUnfilteredSearchButNotAPriceFilter() {
        Seller seller = sellerRepository.save(Seller.builder()
                .email("offerless@example.com").fullName("Offerless Seller").build());
        Product noOffer = product(seller.getId(), "Unlisted Shelf", "furniture");

        assertThat(searchAll(null).getContent()).extracting(Product::getId).contains(noOffer.getId());
        assertThat(productRepository.search(
                null, null, BigDecimal.ZERO, new BigDecimal("1000"), false, "relevance", PageRequest.of(0, 50))
                .getContent())
                .extracting(Product::getId)
                .doesNotContain(noOffer.getId());
    }

    @Test
    void inStockOnlyDropsSoldOutProducts() {
        Seller seller = sellerRepository.save(Seller.builder()
                .email("stock@example.com").fullName("Stock Seller").build());
        Product available = product(seller.getId(), "Stocked Kettle", "kitchen");
        offer(available, "30.00", 7);
        Product soldOut = product(seller.getId(), "Sold Out Kettle", "kitchen");
        offer(soldOut, "30.00", 0);

        Page<Product> results = productRepository.search(
                null, "kitchen", null, null, true, "relevance", PageRequest.of(0, 50));

        assertThat(results.getContent()).extracting(Product::getId)
                .contains(available.getId())
                .doesNotContain(soldOut.getId());
    }

    @Test
    void priceSortOrdersByCheapestOfferInBothDirections() {
        Seller seller = sellerRepository.save(Seller.builder()
                .email("sort@example.com").fullName("Sort Seller").build());
        Product mid = product(seller.getId(), "Mid Rug", "rugs");
        offer(mid, "50.00", 1);
        Product cheapest = product(seller.getId(), "Cheap Rug", "rugs");
        offer(cheapest, "10.00", 1);
        Product dearest = product(seller.getId(), "Plush Rug", "rugs");
        offer(dearest, "200.00", 1);

        assertThat(productRepository.search(
                null, "rugs", null, null, false, "price_asc", PageRequest.of(0, 10)).getContent())
                .extracting(Product::getId)
                .containsExactly(cheapest.getId(), mid.getId(), dearest.getId());

        assertThat(productRepository.search(
                null, "rugs", null, null, false, "price_desc", PageRequest.of(0, 10)).getContent())
                .extracting(Product::getId)
                .containsExactly(dearest.getId(), mid.getId(), cheapest.getId());
    }

    @Test
    void unrecognisedSortFallsBackToNewestFirstRatherThanFailing() {
        Seller seller = sellerRepository.save(Seller.builder()
                .email("badsort@example.com").fullName("Bad Sort Seller").build());
        product(seller.getId(), "Older Crate", "storage");
        Product newer = product(seller.getId(), "Newer Crate", "storage");

        Page<Product> results = productRepository.search(
                null, "storage", null, null, false, "not-a-sort-option", PageRequest.of(0, 10));

        assertThat(results.getContent()).isNotEmpty();
        assertThat(results.getContent().get(0).getId()).isEqualTo(newer.getId());
    }
}
