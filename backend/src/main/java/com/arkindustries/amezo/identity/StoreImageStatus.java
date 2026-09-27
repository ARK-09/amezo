package com.arkindustries.amezo.identity;

/**
 * PENDING - a slot was reserved and an upload URL issued; the object may or may
 * not be in the bucket yet.
 * STORED - confirm verified the object with a HeadObject and its URL is live on
 * the storefront.
 *
 * The same two states catalog's ImageStatus uses, for the same reason: the gap
 * between "a URL was signed" and "the bytes arrived" is where a storefront ends
 * up pointing at an object that was never written.
 */
public enum StoreImageStatus {
    PENDING,
    STORED
}
