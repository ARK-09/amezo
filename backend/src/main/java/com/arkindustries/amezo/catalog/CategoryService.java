package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.catalog.dto.CategoryResponse;
import com.arkindustries.amezo.common.exception.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class CategoryService {

    private final CategoryRepository categoryRepository;

    public CategoryService(CategoryRepository categoryRepository) {
        this.categoryRepository = categoryRepository;
    }

    /**
     * What GET /categories serves: the selectable list, in merchandising order.
     * Retired categories are left out - a seller must not be able to file a new
     * product under one - so a product still holding a retired category keeps
     * displaying it (the name comes from the product's own response) without the
     * category reappearing as a choice.
     */
    @Transactional(readOnly = true)
    public List<CategoryResponse> listSelectable() {
        return categoryRepository.findByActiveTrueOrderByPositionAsc().stream()
                .map(CategoryService::toResponse)
                .toList();
    }

    /**
     * The gate every product write goes through. A slug that doesn't exist, or
     * names a retired category, is refused here rather than being written - which
     * is the whole point of the table: a client that skips the selector and posts
     * its own string gets a 404, not a new category.
     *
     * 404, not 422: the slug names a resource the caller believes in, and
     * "category does not exist" is the honest answer whether it was never there
     * or has been retired. Saying which would let a caller enumerate retired
     * categories, and the caller's next move is the same either way - pick one
     * from GET /categories.
     */
    @Transactional(readOnly = true)
    public Category requireSelectable(String slug) {
        return categoryRepository.findBySlug(slug)
                .filter(Category::isActive)
                .orElseThrow(() -> new NotFoundException(
                        "Category '" + slug + "' does not exist or is no longer available"));
    }

    /**
     * Every category by id, for mapping a page of products in one query instead
     * of one per row. The whole table is a dozen rows, so fetching all of it beats
     * assembling an id set and asking for a subset.
     */
    @Transactional(readOnly = true)
    public Map<UUID, CategoryResponse> byId() {
        return categoryRepository.findAllByOrderByPositionAsc().stream()
                .collect(Collectors.toMap(
                        Category::getId,
                        CategoryService::toResponse,
                        (first, second) -> first,
                        LinkedHashMap::new));
    }

    /** One product's category, for the single-product read paths. */
    @Transactional(readOnly = true)
    public CategoryResponse byIdOrThrow(UUID categoryId) {
        return categoryRepository.findById(categoryId)
                .map(CategoryService::toResponse)
                .orElseThrow(() -> new NotFoundException("Category " + categoryId + " not found"));
    }

    private static CategoryResponse toResponse(Category category) {
        return new CategoryResponse(category.getSlug(), category.getName());
    }

    /** Lookup helper for callers that already hold a set of categories. */
    public static Function<Category, CategoryResponse> mapper() {
        return CategoryService::toResponse;
    }
}
