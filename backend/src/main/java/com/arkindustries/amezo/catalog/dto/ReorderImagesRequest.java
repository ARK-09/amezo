package com.arkindustries.amezo.catalog.dto;

import jakarta.validation.constraints.NotEmpty;

import java.util.List;
import java.util.UUID;

/**
 * The whole ordering at once, per the contract: the first id is the cover, and
 * position is derived from the list index rather than sent per image.
 *
 * Not a per-image position PATCH, because a swap cannot be expressed that way
 * without a transient duplicate position - two images both claiming to be the
 * cover for as long as it takes the second request to arrive, or forever if it
 * never does.
 */
public record ReorderImagesRequest(
        @NotEmpty List<UUID> imageIds
) {
}
