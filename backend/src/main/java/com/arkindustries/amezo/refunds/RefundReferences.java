package com.arkindustries.amezo.refunds;

import java.util.UUID;

/**
 * The short keys the designs print: {@code ref_4d90b12c} for a refund request and
 * {@code ord_7b02e315} for the order it was raised against.
 *
 * <h2>Why the order reference is derived and the refund reference is stored</h2>
 *
 * A refund's reference is a column on refund_request, minted once and unique - it
 * gets quoted in emails and support tickets, so it has to survive any later change
 * to how one is generated.
 *
 * {@code orders} has no reference column. Adding one would mean a migration and a
 * backfill on a table two other agents are working in this same pass, for a string
 * the frontend only prints (docs/backend-handoff.md: "Anything stable and short
 * works; the frontend only prints it"). So it is derived from the order's id
 * instead - stable, because a UUID never changes, and identical for the same order
 * on every read. Flagged for whoever adds the column: this is the shape to
 * backfill.
 *
 * Both take the first eight hex digits of the UUID, which is what the designs show.
 * Eight hex digits is 4 billion values and these are display keys looked up by a
 * primary key, not identifiers anything resolves by - a collision costs two
 * requests printing the same short code, not a wrong record.
 */
final class RefundReferences {

    private RefundReferences() {
    }

    static String refundReference(UUID refundRequestId) {
        return "ref_" + shortHex(refundRequestId);
    }

    static String orderReference(UUID orderId) {
        return "ord_" + shortHex(orderId);
    }

    private static String shortHex(UUID id) {
        return id.toString().replace("-", "").substring(0, 8);
    }
}
