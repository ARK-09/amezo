package com.arkindustries.amezo.identity.dto;

/**
 * The answer to a magic-link request.
 *
 * @param token normally NULL - the link went to the address by email, and a token in
 *              this response for an arbitrary address would be an open door to every
 *              account. It is set only for the configured demo address, so that
 *              instance can be walked without an inbox; see identity/DemoAccount for
 *              why that is narrow enough to be safe. The token it carries is an
 *              ordinary magic-link token: single-use, the same expiry, and still
 *              redeemed by POST /auth/{buyer,seller}/verify.
 */
public record MagicLinkResponse(String token) {

    /** A link that was emailed, which is every request but the demo one. */
    public static final MagicLinkResponse EMAILED = new MagicLinkResponse(null);
}
