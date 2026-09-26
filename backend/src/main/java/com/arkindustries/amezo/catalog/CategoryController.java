package com.arkindustries.amezo.catalog;

import com.arkindustries.amezo.catalog.dto.CategoryResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The single source of categories for every client: the seller portal's selector,
 * the search filter, and the buyer-facing category navigation all read this.
 *
 * Public, because the buyer-facing navigation needs it before anyone signs in.
 *
 * No search parameter. The selectable list is a dozen rows that change about
 * never, so clients fetch it once, cache it, and filter in memory - a request per
 * keystroke would be slower and noisier than the filtering it replaced. If the
 * list ever grows past what is sensible to ship whole, that is the moment to add
 * a server-side query, not before.
 */
@RestController
@RequestMapping("/categories")
public class CategoryController {

    private final CategoryService categoryService;

    public CategoryController(CategoryService categoryService) {
        this.categoryService = categoryService;
    }

    @GetMapping
    public List<CategoryResponse> list() {
        return categoryService.listSelectable();
    }
}
