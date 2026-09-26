package com.arkindustries.amezo.catalog;

/**
 * Whether a listing is visible to shoppers. Mirrors the contract's
 * ProductStatus (frontend/openapi/fixture.yaml) and V17's CHECK constraint.
 *
 * ACTIVE and DRAFT are the two a seller picks between in the product form.
 * ARCHIVED exists because the contract documents DELETE /products/{productRef}
 * as a soft delete to ARCHIVED; this backend still hard-deletes, so nothing
 * writes ARCHIVED today. It is declared rather than omitted so the enum and the
 * column's CHECK agree - a value in the database that the enum cannot represent
 * fails to read at all, which is a worse failure than an unused constant.
 */
public enum ProductStatus {
    ACTIVE, DRAFT, ARCHIVED
}
