package com.arkindustries.amezo.identity;

/**
 * Which of the storefront's two pictures an upload is for. Mirrors the `slot`
 * enum on POST /api/v1/sellers/me/store/images in
 * frontend/openapi/fixture.yaml, and the CHECK constraint in V23.
 *
 * Two named slots rather than an ordered list like catalog's product images: a
 * store has exactly one cover and exactly one logo, they are different shapes (a
 * 1600x400 band against an 88px circle), and they land in different columns.
 * "Position 0" would carry none of that.
 */
public enum StoreImageSlot {
    COVER,
    LOGO
}
