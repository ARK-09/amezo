package com.arkindustries.amezo.reviews;

import java.time.Instant;
import java.util.UUID;

// Package-private: purely a native-query projection shape for
// ReviewRepository, never a public response type.
interface ReviewWithVariantLabelProjection {

    UUID getId();

    Integer getRating();

    String getBody();

    Instant getCreatedAt();

    String getVariantLabel();

    String getReviewerName();
}
