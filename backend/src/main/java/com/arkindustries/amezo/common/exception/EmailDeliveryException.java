package com.arkindustries.amezo.common.exception;

/**
 * 502: the email provider refused or failed the send. Surfaced rather than
 * swallowed because the alternative is a seller staring at "check your email"
 * for a link that was never sent - and because POST /auth/seller/magic-link
 * sends for every address it's given (it never checks whether an account
 * exists), so failing loudly here reveals nothing about who has an account.
 */
public class EmailDeliveryException extends RuntimeException {

    public EmailDeliveryException(String message, Throwable cause) {
        super(message, cause);
    }
}
