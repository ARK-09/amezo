package com.arkindustries.amezo.common.exception;

/** Maps to a plain 401 ProblemDetail - a magic-link token that's garbage, expired, or already consumed. */
public class InvalidTokenException extends RuntimeException {

    public InvalidTokenException(String message) {
        super(message);
    }
}
