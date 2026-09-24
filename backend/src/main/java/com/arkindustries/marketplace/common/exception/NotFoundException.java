package com.arkindustries.marketplace.common.exception;

/** Maps to a plain 404 ProblemDetail. No itemized errors[] - there's nothing to itemize. */
public class NotFoundException extends RuntimeException {

    public NotFoundException(String message) {
        super(message);
    }
}
