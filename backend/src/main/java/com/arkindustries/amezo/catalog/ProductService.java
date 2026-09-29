package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.catalog.api.ProductExistenceQuery;
import com.arkindustries.amezo.catalog.api.ProductReferenceResolver;
import com.arkindustries.amezo.catalog.api.ProductVariantSummaryQuery;
import com.arkindustries.amezo.catalog.dto.CategoryResponse;
import com.arkindustries.amezo.catalog.dto.ProductDetailResponse;
import com.arkindustries.amezo.catalog.dto.ProductSummaryResponse;
import com.arkindustries.amezo.catalog.dto.VariantOfferResponse;
import com.arkindustries.amezo.catalog.dto.StoreRefResponse;
import com.arkindustries.amezo.common.exception.NotFoundException;
import com.arkindustries.amezo.identity.api.StoreRef;
import com.arkindustries.amezo.identity.api.StoreRefQuery;
import com.arkindustries.amezo.orders.api.ProductSalesQuery;
import com.arkindustries.amezo.reviews.api.ReviewSummaryQuery;
import com.arkindustries.amezo.reviews.api.ReviewSummaryView;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collection;
import java.util.Comparator;
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

    /**
     * How many ranked candidates to ask orders for, per tile wanted. Covers the best
     * sellers that have since been archived or delisted, without asking for a ranking
     * of the whole catalog.
     */
    private static final int OVER_FETCH = 4;

    /** A ceiling on that, so a large page size cannot turn a rail into a full scan. */
    private static final int MAX_RANKED_CANDIDATES = 200;

    private final ProductRepository productRepository;
    private final VariantRepository variantRepository;
    private final OfferRepository offerRepository;
    private final ImageRepository imageRepository;
    private final ReviewSummaryQuery reviewSummaryQuery;
    private final CategoryService categoryService;
    private final ImageUrlResolver imageUrls;
    private final StoreRefQuery storeRefQuery;
    private final ProductSalesQuery productSalesQuery;

    public ProductService(
            ProductRepository productRepository,
            VariantRepository variantRepository,
            OfferRepository offerRepository,
            ImageRepository imageRepository,
            ReviewSummaryQuery reviewSummaryQuery,
            CategoryService categoryService,
            ImageUrlResolver imageUrls,
            StoreRefQuery storeRefQuery,
            ProductSalesQuery productSalesQuery) {
        this.productRepository = productRepository;
        this.variantRepository = variantRepository;
        this.offerRepository = offerRepository;
        this.imageRepository = imageRepository;
        this.reviewSummaryQuery = reviewSummaryQuery;
        this.categoryService = categoryService;
        this.imageUrls = imageUrls;
        this.storeRefQuery = storeRefQuery;
        this.productSalesQuery = productSalesQuery;
    }

    /**
     * The catalogue, filtered. {@code sellerId} narrows it to one seller's listings,
     * which is what GET /api/v1/stores/{handle}/products is - the same pipeline rather
     * than a second one, so a storefront cannot advertise a product the search page
     * will not show. Null means the whole marketplace.
     */
    public Page<ProductSummaryResponse> search(
            String query,
            String categorySlug,
            UUID sellerId,
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
        return withCardDetail(productRepository.search(
                query, categorySlug, sellerId, priceMin, priceMax, inStockOnly, sort, unsorted));
    }

    /**
     * The best-selling products, as a merchandising rail.
     *
     * <h2>The ranking is not this feature's to compute</h2>
     *
     * "Best selling" is {@code SUM(order_line.quantity)} - a fact about ORDERS, and
     * catalog may not read that table (PackageBoundaryTest). So orders ranks and
     * publishes ids ({@link ProductSalesQuery}), and this loads them, drops what must
     * not be shown, and re-imposes the rank. Neither feature learns the other's schema.
     *
     * <h2>It over-fetches on purpose</h2>
     *
     * A product can sell well and then be archived, or run out of stock. Orders ranks
     * what SOLD and knows nothing about either, so asking for exactly {@code size} ids
     * returns a short rail whenever one of them is no longer listable. It asks for a
     * multiple and trims after filtering.
     *
     * <h2>An empty answer is an honest answer</h2>
     *
     * A marketplace with no orders has no best sellers, and this returns an empty page
     * rather than padding it with something else. The rail then removes itself instead
     * of printing "popular" over products nobody has bought - which is the whole point
     * of computing this rather than labelling a recency query.
     */
    @Transactional(readOnly = true)
    public Page<ProductSummaryResponse> bestSelling(String categorySlug, Instant since, int size) {
        if (size < 1) {
            return Page.empty();
        }
        int candidates = Math.min(size * OVER_FETCH, MAX_RANKED_CANDIDATES);

        List<UUID> ranked = categorySlug == null
                ? productSalesQuery.bestSellingProductIds(since, candidates)
                : productSalesQuery.bestSellingAmong(
                        productRepository.activeProductIdsInCategory(categorySlug), since, candidates);
        if (ranked.isEmpty()) {
            return Page.empty();
        }

        // Rank position by id, so the order orders gave us survives a database that
        // returns the rows in whatever order it likes.
        Map<UUID, Integer> rankById = new HashMap<>();
        for (int i = 0; i < ranked.size(); i++) {
            rankById.put(ranked.get(i), i);
        }

        List<Product> listable = productRepository.findActiveByIdIn(ranked).stream()
                .sorted(Comparator.comparingInt(product -> rankById.get(product.getId())))
                .limit(size)
                .toList();

        return withCardDetail(new PageImpl<>(listable, PageRequest.of(0, size), listable.size()));
    }

    /**
     * Products listed within a window, newest first - the "new arrivals" rail.
     *
     * A real window, not a bare ordering. Sorting by recency and calling the result
     * "new this week" is true only by accident: with no WHERE clause the newest
     * product in the catalog heads that rail however many months old it is. This
     * returns nothing for a quiet week, and the rail removes itself rather than
     * relabelling old stock as new.
     */
    @Transactional(readOnly = true)
    public Page<ProductSummaryResponse> newArrivals(Instant since, int size) {
        if (size < 1) {
            return Page.empty();
        }
        List<Product> recent = productRepository.newArrivals(since, size);
        return withCardDetail(new PageImpl<>(recent, PageRequest.of(0, size), recent.size()));
    }

    /**
     * Everything a product CARD needs, for a page of products however it was chosen.
     *
     * Extracted so that a ranking which cannot be expressed as an ORDER BY - the
     * best-selling rail, whose order comes from another feature entirely - renders
     * identical cards to the search page rather than growing a second, drifting copy
     * of the price, stock, thumbnail, rating and storefront lookups.
     *
     * A fixed number of batched queries for the whole page, never one per card.
     */
    private Page<ProductSummaryResponse> withCardDetail(Page<Product> products) {
        List<UUID> productIds = products.getContent().stream().map(Product::getId).toList();
        Map<UUID, CategoryResponse> categoriesById = categoryService.byId();
        if (productIds.isEmpty()) {
            return products.map(product -> ProductMapper.toSummary(
                    product, categoriesById.get(product.getCategoryId()),
                    null, null, false, null, null, null, 0L, null));
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
        // The fifth, and the one that makes "Sold by" a link rather than a guess: one
        // batched answer from identity for the page's sellers, not one per card.
        Map<UUID, StoreRefResponse> storesBySellerId = storeRefsFor(
                products.getContent().stream().map(Product::getSellerId).toList());

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
                    summary != null ? summary.averageRating() : null,
                    // A product nobody has reviewed has no row in the aggregate at
                    // all, which is zero reviews rather than an unknown number.
                    summary != null && summary.count() != null ? summary.count() : 0L,
                    storesBySellerId.get(product.getSellerId()));
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

    /**
     * The storefront behind each of these sellers, keyed by seller id.
     *
     * Through identity's query interface rather than a join: seller_store is another
     * feature's table and PackageBoundaryTest fails the build on reaching into it. The
     * batched form takes the whole page at once, because one call per card is how a
     * sixteen-card page becomes seventeen queries.
     *
     * A seller with no store row yet is still named - identity falls back to their
     * account, with a null handle, rather than inventing one that provisioning would
     * later disagree with (see StoreRefService). A seller id with no account at all
     * maps to nothing and the product's store is null, which the contract allows and
     * the screens cope with.
     */
    private Map<UUID, StoreRefResponse> storeRefsFor(List<UUID> sellerIds) {
        if (sellerIds.isEmpty()) {
            return Map.of();
        }
        return storeRefQuery.findBySellerIds(sellerIds).entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, entry -> toStoreRef(entry.getValue())));
    }

    private static StoreRefResponse toStoreRef(StoreRef ref) {
        return new StoreRefResponse(ref.id(), ref.name(), ref.handle());
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
                imageUrls,
                storeRefsFor(List.of(product.getSellerId())).get(product.getSellerId()));
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

    @Override
    public Map<UUID, String> variantSkusByIds(Collection<UUID> variantIds) {
        // Variants with no sku are filtered out, not mapped to null: Collectors.toMap
        // throws on a null value, and the contract's sku is optional.
        return variantRepository.findAllById(variantIds).stream()
                .filter(variant -> variant.getSku() != null)
                .collect(Collectors.toMap(Variant::getId, Variant::getSku));
    }
}
