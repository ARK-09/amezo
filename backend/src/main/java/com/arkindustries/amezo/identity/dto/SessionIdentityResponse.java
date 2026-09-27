package com.arkindustries.amezo.identity.dto;

import com.arkindustries.amezo.identity.IdentityType;

import java.time.Instant;
import java.util.UUID;

/**
 * The body of GET /sessions/current, matching the identity body documented in
 * docs/api-design.md. identityType goes over the wire as the enum name
 * (SELLER/BUYER), the same convention as order status and image status.
 *
 * <h2>identityType is the door, not the whole account</h2>
 *
 * It names the identity whose magic link minted this session, and it is still the
 * right thing for a screen to say "signed in as" about. What it is NOT is the list
 * of things the session may do: one address can hold a buyer row and a seller row,
 * and a session carries the roles of both (see AccountIdentities). A client that
 * decided "seller, therefore not a buyer" from this field alone hid My Orders from
 * people who had orders.
 *
 * So both ids travel too, each null when that half of the account does not exist.
 * They are what a client should branch on - buyerIdentityId to offer the buyer's
 * account and order history, sellerId to offer the portal - and they are also the
 * ids the API's own buyer- and seller-scoped routes act as, so a screen reading them
 * cannot disagree with the server about who it is talking to.
 */
public record SessionIdentityResponse(
        IdentityType identityType,
        UUID identityId,
        String email,
        String fullName,
        Instant expiresAt,
        UUID buyerIdentityId,
        UUID sellerId
) {
}
