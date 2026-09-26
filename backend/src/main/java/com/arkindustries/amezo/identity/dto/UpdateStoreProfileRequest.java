package com.arkindustries.amezo.identity.dto;

import com.arkindustries.amezo.identity.StoreHandles;
import com.arkindustries.amezo.identity.StoreStatus;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * The contract's UpdateStoreProfile. PATCH semantics, the same ones
 * UpdateProductRequest already uses in catalog:
 *
 *   - null  - the seller did not touch this field; it stays as it is.
 *   - blank - the seller cleared it; the optional fields go back to null.
 *   - value - the new value.
 *
 * "Absent" and "blank" therefore mean different things, which is the whole
 * reason the not-blank rules below are @Pattern(".*\\S.*") rather than
 * @NotBlank: @NotBlank would also reject the null that means "unchanged", so a
 * PATCH of the tagline alone would fail for not carrying a name.
 *
 * Blank clears rather than being rejected because the Store Settings form sends
 * every optional field on every save, empty string included - clearing a
 * tagline is a save of "" (see frontend/src/pages/seller/StoreSettings.tsx),
 * and rejecting it would make "remove my tagline" impossible.
 *
 * The two fields this shape cannot express: name and handle cannot be cleared
 * (they are required on StoreProfile and there is nothing to fall back to), and
 * foundedYear cannot be cleared either, because an Integer has no blank. That
 * last one is the cost of null-means-unchanged, the same cost
 * UpdateProductRequest documents for brandName; clearing it needs a wrapper
 * that distinguishes absent from explicit null, which nothing in the contract
 * or the portal asks for yet.
 */
public record UpdateStoreProfileRequest(
        @Pattern(regexp = ".*\\S.*", message = "must not be blank") String name,

        /**
         * StoreHandle, enforced server-side rather than taken on trust from the
         * client. @Size is stated as well as @Pattern - the pattern already
         * implies 2..39, but a refusal that says "size must be between 2 and
         * 39" is a message the seller can act on, where a bare regex is not.
         *
         * Null is untouched: both constraints pass a null value, which is what
         * makes "leave my URL alone" expressible.
         */
        @Pattern(regexp = StoreHandles.PATTERN,
                message = "must be lowercase letters, digits and inner dashes only")
        @Size(min = StoreHandles.MIN_LENGTH, max = StoreHandles.MAX_LENGTH)
        String handle,

        String tagline,
        String location,
        Integer foundedYear,

        /**
         * Validated rather than stored as typed: this is printed on the
         * storefront as the way to reach the seller, so a value that is not an
         * address is a dead end for a buyer. @Email passes both null (untouched)
         * and blank (cleared), so it does not interfere with the rules above.
         */
        @Email(message = "must be a valid email address") String supportEmail,

        String about,
        String coverUrl,
        String logoUrl,
        StoreStatus status,
        String vacationNote
) {
}
