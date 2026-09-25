package com.arkindustries.amezo.identity;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The no-API-key fallback: writes the magic link to the log so the sign-in flow
 * stays walkable without a mail provider - locally, and on a deployment that
 * hasn't been given a Resend key. EmailSenderConfig picks between this and
 * ResendEmailSender; it is deliberately not a @Component, so only one of the two
 * ever exists.
 *
 * Logging a sign-in token is a real (if minor) exposure - anyone who can read the
 * server log can use the link. That is the trade for a flow that works with no
 * credentials, and the reason a configured key wins automatically.
 */
class LoggingEmailSender implements EmailSender {

    private static final Logger log = LoggerFactory.getLogger(LoggingEmailSender.class);

    @Override
    public void send(String toEmail, String subject, String body) {
        log.info("[no email provider configured - logging instead] to={} subject={}\n{}",
                toEmail, subject, body);
    }
}
