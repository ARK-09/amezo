package com.arkindustries.amezo.reviews.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/**
 * The review references the ORDER LINE it is about, not the product: that is what
 * makes it a purchase. The server derives the product from the line's snapshot, so
 * a caller cannot review product A by citing a line for product B.
 *
 * body is optional - a star rating on its own is a legitimate review - and capped
 * so the column (text) isn't a place to paste a novel.
 */
public record CreateReviewRequest(
        @NotNull UUID orderLineId,
        @NotNull @Min(1) @Max(5) Integer rating,
        @Size(max = 4000) String body
) {
}
