package com.arkindustries.amezo.identity.dto;

import com.arkindustries.amezo.identity.StoreImageSlot;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/**
 * The body of POST /api/v1/sellers/me/store/images/confirm.
 *
 * The slot is named a second time even though the reserved row already knows it,
 * and the server refuses the pair when they disagree. That check is what keeps a
 * 1600x400 banner out of an 88px circle: without it a client that mixed up its
 * two in-flight uploads would put the cover in logoUrl and nothing would notice
 * until a shopper loaded the storefront.
 */
public record StoreImageConfirmRequest(
        @NotNull UUID id,
        @NotNull StoreImageSlot slot
) {
}
