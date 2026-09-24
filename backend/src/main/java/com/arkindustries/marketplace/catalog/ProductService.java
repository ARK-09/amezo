package com.arkindustries.marketplace.catalog;

import com.arkindustries.marketplace.catalog.api.ProductExistenceQuery;
import com.arkindustries.marketplace.catalog.dto.ProductSummaryResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class ProductService implements ProductExistenceQuery {

    private final ProductRepository productRepository;

    public ProductService(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    public Page<ProductSummaryResponse> search(String query, Pageable pageable) {
        // Spring Data JPA rejects a Sort on a native @Query at runtime
        // (InvalidJpaQueryMethodException) - Pageable's default argument
        // resolver binds a client-supplied ?sort= automatically, so strip
        // it here rather than let a real request 500. Sort itself is
        // deferred business logic (see docs/api-design.md), not built yet.
        Pageable unsorted = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
        return productRepository.search(query, unsorted).map(ProductMapper::toSummary);
    }

    @Override
    public boolean exists(UUID productId) {
        return productRepository.existsById(productId);
    }
}
