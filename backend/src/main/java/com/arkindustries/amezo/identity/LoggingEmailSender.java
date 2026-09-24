package com.arkindustries.amezo.identity;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Stub: no SMTP/mail provider is configured in this project (time-boxed
 * seller-portal build, see docs/superpowers/plans - flagged rather than
 * silently faked). Logs the magic-link email so the flow is fully
 * exercisable in dev without a real inbox; swap for a real EmailSender
 * implementation when a mail provider is wired up.
 */
@Component
class LoggingEmailSender implements EmailSender {

    private static final Logger log = LoggerFactory.getLogger(LoggingEmailSender.class);

    @Override
    public void send(String toEmail, String subject, String body) {
        log.info("[stub email] to={} subject={}\n{}", toEmail, subject, body);
    }
}
