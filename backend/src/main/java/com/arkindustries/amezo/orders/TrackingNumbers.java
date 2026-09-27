package com.arkindustries.amezo.orders;

import java.util.Locale;
import java.util.UUID;

/**
 * The shipment identifier the platform issues when a seller hands a parcel over.
 *
 * Minted here rather than accepted from the client, which is what the contract
 * says: "the tracking number is issued by the platform on handover, not typed by
 * the seller". A seller-supplied string would be an identifier nothing in this
 * system can resolve, printed to the buyer as though a carrier had confirmed it.
 *
 * Derived from a fresh UUID rather than a sequence: a sequence would need a
 * migration to produce a value no more useful than this one, and consecutive
 * tracking numbers would let anyone holding one guess the next order's.
 *
 * It is NOT a real carrier's format and does not resolve on any carrier's website -
 * there is no carrier integration here. It identifies the shipment inside Amezo,
 * which is the only thing anything in this codebase can honestly claim. That is
 * also why ShipmentInfo.trackingUrl stays null instead of pointing at a tracking
 * page that would 404.
 */
final class TrackingNumbers {

    private static final String PREFIX = "AMZ";

    private TrackingNumbers() {
    }

    static String issue() {
        return PREFIX + UUID.randomUUID().toString().replace("-", "")
                .substring(0, 12).toUpperCase(Locale.ROOT);
    }
}
