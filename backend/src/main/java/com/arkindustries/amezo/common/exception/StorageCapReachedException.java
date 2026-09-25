package com.arkindustries.amezo.common.exception;

/**
 * 507 Insufficient Storage: the deployment has used its whole object-storage
 * budget (app.s3.max-total-bytes), so no new upload URL is issued regardless of
 * how small the file is. Nothing the caller sends fixes this - someone has to
 * delete objects or raise the cap - which is why it isn't a 413.
 */
public class StorageCapReachedException extends RuntimeException {

    public StorageCapReachedException(String message) {
        super(message);
    }
}
