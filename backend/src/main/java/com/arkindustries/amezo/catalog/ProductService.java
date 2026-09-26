package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.catalog.api.ProductExistenceQuery;
import com.arkindustries.amezo.catalog.api.ProductReferenceResolver;
import com.arkindustries.amezo.catalog.api.ProductVariantSummaryQuery;
import com.arkindustries.amezo.catalog.dto.CategoryResponse;
import com.arkindustries.amezo.catalog.dto.ProductDetailResponse;
import com.arkindustries.amezo.catalog.dto.ProductSummaryResponse;
import com.arkindustries.amezo.catalog.dto.VariantOfferResponse;
import com.arkindustries.amezo.common.exception.NotFoundException;
import com.arkindustries.amezo.reviews.api.ReviewSummaryQuery;
import com.arkindustries.amezo.reviews.api.ReviewSummaryView;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class ProductService
        implements ProductExistenceQuery, ProductVariantSummaryQuery, ProductReferenceResolver {

    private final ProductRepository productRepository;
    private final VariantRepository variantRepository;
    private final OfferRepository offerRepository;
    private final ImageRepository imageRepository;
    private final ReviewSummaryQuery reviewSummaryQuery;
    private final CategoryService categoryService;
    private final ImageUrlResolver imageUrls;

    public ProductService(
            ProductRepository productRepository,
            VariantRepository variantRepository,
            OfferRepository offerRepository,
            ImageRepository imageRepository,
            ReviewSummaryQuery reviewSummaryQuery,
            CategoryService categoryService,
            ImageUrlResolver imageUrls) {
        this.productRepository = productRepository;
        this.variantRepository = variantRepository;
        this.offerRepository = offerRepository;
        this.imageRepository = imageRepository;
        this.reviewSummaryQuery = reviewSummaryQuery;
        this.categoryService = categoryService;
        this.imageUrls = imageUrls;
    }

    public Page<ProductSummaryResponse> search(
            String query,
            String categorySlug,
            BigDecimal priceMin,
            BigDecimal priceMax,
            boolean inStockOnly,
            String sort,
            Pageable pageable) {
        // Spring Data JPA rejects a Sort on a native @Query at runtime
        // (InvalidJpaQueryMethodException) and Pageable's default resolver binds a
        // client-supplied ?sort= automatically - so strip it and let the explicit
        // sort parameter drive ORDER BY inside the query, where the aggregate it
        // sorts on actually exists.
        Pageable unsorted = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
        Page<Product> products = productRepository.search(
                query, categorySlug, priceMin, priceMax, inStockOnly, sort, unsorted);

        List<UUID> productIds = products.getContent().stream().map(Product::getId).toList();
        Map<UUID, CategoryResponse> categoriesById = categoryService.byId();
        if (productIds.isEmpty()) {
            return products.map(product -> ProductMapper.toSummary(
                    product, categoriesById.get(product.getCategoryId()), null, null, false, null, null, null));
        }

        // Three batched lookups for the whole page, not per card: variants to reach
        // the offers, offers for price and stock, images for the thumbnail.
        List<Variant> variants = variantRepository.findByProductIdIn(productIds);
        Map<UUID, UUID> productIdByVariantId = variants.stream()
                .collect(Collectors.toMap(Variant::getId, Variant::getProductId));
        List<Offer> offers = variants.isEmpty()
                ? List.of()
                : offerRepository.findByVariantIdIn(productIdByVariantId.keySet());

        Map<UUID, BigDecimal> priceFromByProductId = new HashMap<>();
        Map<UUID, Boolean> inStockByProductId = new HashMap<>();
        // What a card's Add-to-cart button will put in the cart: the cheapest
        // offer that can actually be bought, falling back to the cheapest of any
        // so the field is still populated for a sold-out product (whose button is
        // disabled anyway). Picked here because this loop already has every offer
        // in hand - the alternative was the browser fetching the whole product on
        // click, which is the round trip this removes.
        Map<UUID, Offer> defaultOfferByProductId = new HashMap<>();
        for (Offer offer : offers) {
            UUID productId = productIdByVariantId.get(offer.getVariantId());
            priceFromByProductId.merge(productId, offer.getPrice(), BigDecimal::min);
            inStockByProductId.merge(productId, offer.getStockQty() > 0, Boolean::logicalOr);
            defaultOfferByProductId.merge(productId, offer, ProductService::preferredOffer);
        }
        Map<UUID, String> thumbnailsByProductId = thumbnailUrlsByProductId(productIds);
        // The fourth batched lookup, and the reason avgRating is finally real on a
        // card: one grouped aggregate for the page instead of one per product.
        Map<UUID, ReviewSummaryView> summariesByProductId = reviewSummaryQuery.getSummaries(productIds);

        return products.map(product -> {
            Offer defaultOffer = defaultOfferByProductId.get(product.getId());
            ReviewSummaryView summary = summariesByProductId.get(product.getId());
            return ProductMapper.toSummary(
                    product,
                    categoriesById.get(product.getCategoryId()),
                    priceFromByProductId.get(product.getId()),
                    thumbnailsByProductId.get(product.getId()),
                    inStockByProductId.getOrDefault(product.getId(), false),
                    defaultOffer,
                    defaultOffer != null ? defaultOffer.getVariantId() : null,
                    summary != null ? summary.averageRating() : null);
        });
    }

    /**
     * In-stock beats out-of-stock; between two of the same kind, cheaper wins.
     * Ties go to the incumbent, so a page's default variant doesn't depend on the
     * order rows came back in.
     */
    private static Offer preferredOffer(Offer current, Offer candidate) {
        boolean currentInStock = current.getStockQty() > 0;
        boolean candidateInStock = candidate.getStockQty() > 0;
        if (currentInStock != candidateInStock) {
            return currentInStock ? current : candidate;
        }
        return candidate.getPrice().compareTo(current.getPrice()) < 0 ? candidate : current;
    }

    /**
     * The cart's batch lookup. A variant whose offer or product has since been
     * deleted is left out of the response, exactly like an id that never existed:
     * the caller is a browser-stored cart, and a line it can no longer resolve
     * should disappear from the drawer rather than fail it.
     */
    public List<VariantOfferResponse> getVariantOffers(List<UUID> variantIds) {
        if (variantIds.isEmpty()) {
            return List.of();
        }

        List<Variant> variants = variantRepository.findByIdIn(variantIds);
        if (variants.isEmpty()) {
            return List.of();
        }

        Map<UUID, Offer> offersByVariantId = offerRepository
                .findByVariantIdIn(variants.stream().map(Variant::getId).toList()).stream()
                .collect(Collectors.toMap(Offer::getVariantId, Function.identity()));
        List<UUID> productIds = variants.stream().map(Variant::getProductId).distinct().toList();
        Map<UUID, Product> productsById = productRepository.findAllById(productIds).stream()
                .collect(Collectors.toMap(Product::getId, Function.identity()));
        Map<UUID, String> thumbnailsByProductId = thumbnailUrlsByProductId(productIds);

        return variants.stream()
                .map(variant -> {
                    Offer offer = offersByVariantId.get(variant.getId());
                    Product product = productsById.get(variant.getProductId());
                    if (offer == null || product == null) {
                        return null;
                    }
                    return new VariantOfferResponse(
                            variant.getId(),
                            product.getId(),
                            product.getSlug(),
                            product.getTitle(),
                            variant.getLabel(),
                            thumbnailsByProductId.get(product.getId()),
                            offer.getPrice(),
                            offer.getStockQty(),
                            product.getSellerId());
                })
                .filter(Objects::nonNull)
                .toList();
    }

    /** First stored image per product, as a public URL - the card/cart thumbnail. */
    private Map<UUID, String> thumbnailUrlsByProductId(List<UUID> productIds) {
        return imageRepository
                .findByProductIdInAndStatusOrderByPositionAsc(productIds, ImageStatus.STORED).stream()
                .collect(Collectors.toMap(
                        Image::getProductId,
                        image -> imageUrls.forKey(image.getS3Key()),
                        // Ordered by position, so the first one wins.
                        (first, second) -> first));
    }

    /**
     * By slug, or by id for links minted before slugs existed. The public product
     * page is addressed by slug; nothing about this response changes depending on
     * which one got you here.
     */
    public ProductDetailResponse getDetail(String reference) {
        Product product = findByReference(reference)
                .orElseThrow(() -> new NotFoundException("Product '" + reference + "' not found"));
        UUID id = product.getId();

        List<Image> images = imageRepository.findTop7ByProductIdAndStatusOrderByPositionAsc(id, ImageStatus.STORED);
        List<Variant> variants = variantRepository.findByProductId(id);

        List<UUID> variantIds = variants.stream().map(Variant::getId).toList();
        Map<UUID, Offer> offersByVariantId = variantIds.isEmpty()
                ? Map.of()
                : offerRepository.findByVariantIdIn(variantIds).stream()
                        .collect(Collectors.toMap(Offer::getVariantId, Function.identity()));

        // Cross-feature call through reviews' public interface, not a
        // repository import - per the architecture rules.
        ReviewSummaryView summary = reviewSummaryQuery.getSummary(id);

        return ProductMapper.toDetail(
                product,
                categoryService.byIdOrThrow(product.getCategoryId()),
                images,
                variants,
                offersByVariantId,
                summary,
                imageUrls);
    }

    /**
     * A segment that parses as a UUID is an id, anything else is a slug. Checking
     * the shape rather than trying both in turn keeps a slug lookup from ever
     * costing two queries, and slugs can't collide with UUIDs: slugify() only emits
     * [a-z0-9-], and a bare UUID's hyphenated hex form would have to be a product
     * literally titled with one.
     */
    private Optional<Product> findByReference(String reference) {
        return asUuid(reference)
                .map(productRepository::findById)
                .orElseGet(() -> productRepository.findBySlug(reference));
    }

    private static Optional<UUID> asUuid(String value) {
        try {
            return Optional.of(UUID.fromString(value));
        } catch (IllegalArgumentException notAUuid) {
            return Optional.empty();
        }
    }

    @Override
    public Optional<UUID> resolveId(String reference) {
        return findByReference(reference).map(Product::getId);
    }

    @Override
    public boolean exists(UUID productId) {
        return productRepository.existsById(productId);
    }

    @Override
    public Map<UUID, String> productTitlesByIds(Collection<UUID> productIds) {
        return productRepository.findAllById(productIds).stream()
                .collect(Collectors.toMap(Product::getId, Product::getTitle));
    }

    @Override
    public Map<UUID, String> variantLabelsByIds(Collection<UUID> variantIds) {
        return variantRepository.findAllById(variantIds).stream()
                .collect(Collectors.toMap(Variant::getId, Variant::getLabel));
    }
}
