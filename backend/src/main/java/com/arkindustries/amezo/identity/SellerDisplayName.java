package com.arkindustries.amezo.identity;

/**
 * What to call a seller who has no seller_store row yet.
 *
 * <h2>Why this exists as its own class</h2>
 *
 * SellerStoreProvisioner has the identical rule inline, as a private method, and
 * it is the right rule: the seller's own full name if the account has one, else
 * the local part of the email they signed up with, and never an invented
 * placeholder like "My Store".
 *
 * StoreRefQuery needs the same answer WITHOUT provisioning, because it is reading
 * somebody else's store while rendering a buyer's record - see that interface's
 * note on why a read must not create a row. Rather than widen the provisioner's
 * private method during a pass in which other work is already in that file, the
 * rule is stated here and the provisioner is left alone.
 *
 * <strong>Flagged:</strong> two copies of one rule. Whoever next touches
 * SellerStoreProvisioner should delete its {@code defaultName} and call this.
 *
 * In practice this fallback almost never runs: every seller who has loaded the
 * dashboard or Store Settings has a row, because reading it provisions one.
 */
final class SellerDisplayName {

    private SellerDisplayName() {
    }

    static String of(Seller seller) {
        String fullName = seller.getFullName();
        if (fullName != null && !fullName.isBlank()) {
            return fullName.trim();
        }
        String email = seller.getEmail();
        int at = email.indexOf('@');
        String localPart = at > 0 ? email.substring(0, at) : email;
        return localPart.isBlank() ? email : localPart;
    }
}
