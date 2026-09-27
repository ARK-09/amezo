package com.arkindustries.amezo.identity.dto;

import java.time.Instant;

/**
 * One message from the dev mailbox. The body is the email's plain text, sign-in link
 * and all - which is the whole reason the endpoint that serves it is off by default
 * and token-guarded. See identity/DevMailboxController.
 *
 * @param delivered whether the real sender behind the mailbox accepted it. False is
 *                  the case this facility exists for: a provider that refused or rate
 *                  limited the send, where the link is still readable here.
 */
public record DevMailboxMessageResponse(
        String to,
        String subject,
        String body,
        Instant sentAt,
        boolean delivered
) {
}
