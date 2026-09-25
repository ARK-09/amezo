package com.arkindustries.amezo.common.exception;

/**
 * 413: one upload is larger than app.s3.max-upload-bytes allows. Distinct from
 * StorageCapReachedException, which is about the deployment's total - this one is
 * about a single file, and the caller fixes it by sending a smaller one.
 */
public class PayloadTooLargeException extends RuntimeException {

    public PayloadTooLargeException(String message) {
        super(message);
    }
}
