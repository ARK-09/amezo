package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.catalog.api.ProductCatalogSummary;
import com.arkindustries.amezo.catalog.api.ProductCatalogSummaryQuery;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Catalog's side of ProductCatalogSummaryQuery: turns a batch of product ids
 * into the title, reference, category and thumbnail another feature needs to
 * print them.
 *
 * A class of its own rather than three more methods on ProductService, which
 * already implements the other three api interfaces. The join set here
 * (products + categories + images + the public image URL) is nothing the
 * product write path shares, and keeping it separate means a report's read
 * model cannot drift into the code that creates and edits products.
 *
 * Three queries for any number of ids, never one per product: the whole point
 * of a batched lookup is that a fifty-row report costs the same as a one-row
 * one.
 */
@Service
public class ProductCatalogSummaryService implements ProductCatalogSummaryQuery {

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final ImageRepository imageRepository;
    private final ImageUrlResolver imageUrls;

    public ProductCatalogSummaryService(
            ProductRepository productRepository,
            CategoryRepository categoryRepository,
            ImageRepository imageRepository,
            ImageUrlResolver imageUrls) {
        this.productRepository = productRepository;
        this.categoryRepository = categoryRepository;
        this.imageRepository = imageRepository;
        this.imageUrls = imageUrls;
    }

    @Override
    public Map<UUID, ProductCatalogSummary> summariesByIds(Collection<UUID> productIds) {
        // findAllById with an empty collection still goes to the database on
        // some providers, and the two lookups below would then each run for
        // nothing. Callers legitimately pass an empty set (a seller with no
        // sales in the window).
        if (productIds == null || productIds.isEmpty()) {
            return Map.of();
        }

        Set<UUID> distinct = Set.copyOf(productIds);
        List<Product> products = productRepository.findAllById(distinct);
        if (products.isEmpty()) {
            return Map.of();
        }

        Map<UUID, Category> categoriesById = categoryRepository
                .findAllById(products.stream().map(Product::getCategoryId).collect(Collectors.toSet()))
                .stream()
                .collect(Collectors.toMap(Category::getId, category -> category));

        // Ordered by position, so the first key seen for a product is its first
        // image - the same "position 1 is the thumbnail" rule the seller product
        // list follows. Only STORED: a PENDING row is a presigned URL that may
        // never be uploaded against, and linking one yields a 404 image.
        List<UUID> productIdList = products.stream().map(Product::getId).toList();
        Map<UUID, String> thumbnailKeys = imageRepository
                .findByProductIdInAndStatusOrderByPositionAsc(productIdList, ImageStatus.STORED).stream()
                .collect(Collectors.toMap(Image::getProductId, Image::getS3Key, (first, second) -> first));

        return products.stream().collect(Collectors.toMap(Product::getId, product -> {
            Category category = categoriesById.get(product.getCategoryId());
            String thumbnailKey = thumbnailKeys.get(product.getId());
            return new ProductCatalogSummary(
                    product.getId(),
                    product.getTitle(),
                    product.getSlug(),
                    category == null ? null : category.getSlug(),
                    category == null ? null : category.getName(),
                    thumbnailKey == null ? null : imageUrls.forKey(thumbnailKey));
        }));
    }
}
