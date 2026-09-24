package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.catalog.api.OfferCheckoutQuery;
import com.arkindustries.amezo.catalog.api.OfferSnapshot;
import com.arkindustries.amezo.catalog.api.OfferStockService;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Checkout's only door into catalog data - three batched fetches (offer,
 * variant, product) joined in Java rather than one native query, since
 * each fetch is a simple, independently reusable JpaRepository call
 * (findAllById is already built in) and the row counts here are always
 * "however many lines are in one cart," never large.
 */
@Service
public class OfferQueryService implements OfferCheckoutQuery, OfferStockService {

    private final OfferRepository offerRepository;
    private final VariantRepository variantRepository;
    private final ProductRepository productRepository;

    public OfferQueryService(
            OfferRepository offerRepository,
            VariantRepository variantRepository,
            ProductRepository productRepository) {
        this.offerRepository = offerRepository;
        this.variantRepository = variantRepository;
        this.productRepository = productRepository;
    }

    @Override
    public Map<UUID, OfferSnapshot> findByVariantIds(Collection<UUID> variantIds) {
        if (variantIds.isEmpty()) {
            return Map.of();
        }

        List<Offer> offers = offerRepository.findByVariantIdIn(variantIds);
        Map<UUID, Offer> offersByVariantId = offers.stream()
                .collect(Collectors.toMap(Offer::getVariantId, Function.identity()));

        List<Variant> variants = variantRepository.findAllById(offersByVariantId.keySet());
        Map<UUID, Variant> variantsById = variants.stream()
                .collect(Collectors.toMap(Variant::getId, Function.identity()));

        List<UUID> productIds = variants.stream().map(Variant::getProductId).distinct().toList();
        Map<UUID, Product> productsById = productRepository.findAllById(productIds).stream()
                .collect(Collectors.toMap(Product::getId, Function.identity()));

        return offersByVariantId.entrySet().stream()
                .map(entry -> {
                    UUID variantId = entry.getKey();
                    Offer offer = entry.getValue();
                    Variant variant = variantsById.get(variantId);
                    Product product = productsById.get(variant.getProductId());
                    return new OfferSnapshot(
                            offer.getId(),
                            variantId,
                            product.getId(),
                            product.getSellerId(),
                            product.getTitle(),
                            variant.getLabel(),
                            offer.getPrice(),
                            offer.getStockQty());
                })
                .collect(Collectors.toMap(OfferSnapshot::variantId, Function.identity()));
    }

    @Override
    public boolean decrementStock(UUID offerId, int quantity) {
        return offerRepository.decrementStock(offerId, quantity) > 0;
    }
}
