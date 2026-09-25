package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.identity.Seller;
import com.arkindustries.amezo.identity.SellerRepository;
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
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * GET /variants?ids= - the cart drawer's batch lookup. The cart lives in the
 * browser, so this endpoint is handed whatever ids that storage holds: the
 * interesting cases are all about ids that no longer resolve, which must thin the
 * response rather than fail it.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class VariantOfferApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private SellerRepository sellerRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private VariantRepository variantRepository;

    @Autowired
    private OfferRepository offerRepository;

    @Test
    void returnsPriceStockAndProductTitleForEachRequestedVariant() throws Exception {
        Variant variant = variantWithOffer("Cast Iron Skillet", "Lodge", "12 inch", "49.95", 6);

        mockMvc.perform(get("/variants").param("ids", variant.getId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(variant.getId().toString()))
                .andExpect(jsonPath("$[0].productTitle").value("Cast Iron Skillet"))
                .andExpect(jsonPath("$[0].variantLabel").value("12 inch"))
                .andExpect(jsonPath("$[0].price").value(49.95))
                .andExpect(jsonPath("$[0].stockQty").value(6));
    }

    /** No session cookie: a cart exists before anyone signs in. */
    @Test
    void isPublic() throws Exception {
        Variant variant = variantWithOffer("Public Kettle", "Brand", "1.7L", "35.00", 2);

        mockMvc.perform(get("/variants").param("ids", variant.getId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void unknownAndUnparseableIdsAreOmittedRatherThanFailingTheRequest() throws Exception {
        Variant variant = variantWithOffer("Stale Cart Item", "Brand", "One size", "12.00", 1);

        mockMvc.perform(get("/variants").param(
                        "ids", variant.getId() + "," + UUID.randomUUID() + ",not-a-uuid,"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(variant.getId().toString()));
    }

    @Test
    void variantWithoutAnOfferIsOmittedSinceItCannotBePriced() throws Exception {
        Seller seller = sellerRepository.save(Seller.builder().email("nooffer@example.com").build());
        Product product = productRepository.save(Product.builder()
                .sellerId(seller.getId()).title("Unpriced").category("misc").build());
        Variant orphan = variantRepository.save(Variant.builder()
                .productId(product.getId()).label("only").sku("sku-" + UUID.randomUUID()).build());

        mockMvc.perform(get("/variants").param("ids", orphan.getId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void emptyIdsParameterReturnsAnEmptyList() throws Exception {
        mockMvc.perform(get("/variants").param("ids", ""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    private Variant variantWithOffer(
            String title, String brand, String label, String price, int stockQty) {
        Seller seller = sellerRepository.save(Seller.builder()
                .email("seller-" + UUID.randomUUID() + "@example.com").build());
        Product product = productRepository.save(Product.builder()
                .sellerId(seller.getId())
                .title(title)
                .brandName(brand)
                .category("kitchen")
                .build());
        Variant variant = variantRepository.save(Variant.builder()
                .productId(product.getId())
                .label(label)
                .sku("sku-" + UUID.randomUUID())
                .build());
        offerRepository.save(Offer.builder()
                .variantId(variant.getId())
                .price(new BigDecimal(price))
                .stockQty(stockQty)
                .build());
        return variant;
    }
}
