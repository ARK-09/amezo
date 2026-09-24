package com.arkindustries.amezo.reviews.dto;

import java.time.Instant;
import java.util.UUID;

public record ReviewResponse(
        UUID id,
        Integer rating,
        String body,
        Instant createdAt,
        String variantLabel
) {
}
