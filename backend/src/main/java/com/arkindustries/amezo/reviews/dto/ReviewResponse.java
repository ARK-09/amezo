package com.arkindustries.amezo.reviews.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * reviewerName is the buyer's own name from their identity record. The frontend
 * has rendered a reviewer on every review row since it was built; this field is
 * what it renders, and what the avatar beside it takes its initials from. Null
 * when the identity has no name (a guest checkout that only supplied an email),
 * which the UI shows as an anonymous reviewer rather than as a blank.
 */
public record ReviewResponse(
        UUID id,
        Integer rating,
        String body,
        Instant createdAt,
        String variantLabel,
        String reviewerName
) {
}
