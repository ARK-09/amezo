package com.arkindustries.amezo.identity;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;

/**
 * Records every outgoing email in the {@link DevMailbox}, then hands it to the real
 * sender.
 *
 * <h2>A decorator, not a replacement</h2>
 *
 * It wraps whichever sender the configuration would otherwise have used - Resend
 * where a key is set, the log-only fallback where none is - rather than standing in
 * for it. That is the whole point: the reason to turn this on is that Resend's free
 * tier cannot be relied on, and a mechanism that only worked when Resend was absent
 * would leave the one case that actually breaks a demo - a key that is configured and
 * rate limited - with nowhere to read the link from.
 *
 * <h2>A delivery failure does not fail the request</h2>
 *
 * With the mailbox on, the operator has said the mailbox is the channel of record, and
 * the message is already in it by the time the delegate runs. Rethrowing would answer
 * the sign-in with "we couldn't email you" about a link that is sitting there
 * readable. So the failure is logged, recorded on the message as undelivered, and the
 * flow continues. Without the mailbox the delegate's exception still reaches the
 * caller untouched, because then it is the truth.
 */
class DevMailboxEmailSender implements EmailSender {

    private static final Logger log = LoggerFactory.getLogger(DevMailboxEmailSender.class);

    private final DevMailbox mailbox;
    private final EmailSender delegate;

    DevMailboxEmailSender(DevMailbox mailbox, EmailSender delegate) {
        this.mailbox = mailbox;
        this.delegate = delegate;
    }

    @Override
    public void send(String toEmail, String subject, String body) {
        boolean delivered = true;
        try {
            delegate.send(toEmail, subject, body);
        } catch (RuntimeException e) {
            delivered = false;
            log.warn("Email to {} was not delivered ({}: {}) - it is readable from the dev mailbox instead",
                    toEmail, e.getClass().getSimpleName(), e.getMessage());
        }
        mailbox.record(new DevMailbox.Message(toEmail, subject, body, Instant.now(), delivered));
    }
}
