package com.arkindustries.amezo.common.exception;

/**
 * 503: object storage isn't usable on this deployment - in practice no
 * credentials, since everything else about image upload is config with a default.
 * Everything besides image upload works without storage (see
 * backend/.env.example), so this is a deliberately narrow failure rather than a
 * startup check that would take the whole API down with it.
 */
public class StorageUnavailableException extends RuntimeException {

    public StorageUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
