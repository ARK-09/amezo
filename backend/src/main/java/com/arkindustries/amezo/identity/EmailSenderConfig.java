package com.arkindustries.amezo.identity;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Picks the email sender from configuration: Resend when an API key is set,
 * otherwise the log-only fallback - and wraps either in the dev mailbox when that is
 * turned on.
 *
 * A factory rather than two @Component classes with @ConditionalOnProperty,
 * because the key's property always exists - application.yml declares it with an
 * empty default - so the condition that matters is "non-blank", which that
 * annotation can't express. This way exactly one bean exists, the choice is one
 * readable line, and a deployment with no key still boots.
 */
@Configuration
@EnableConfigurationProperties(DevMailboxProperties.class)
class EmailSenderConfig {

    private static final Logger log = LoggerFactory.getLogger(EmailSenderConfig.class);

    /** The buffer itself always exists; only the route that reads it is conditional. */
    @Bean
    DevMailbox devMailbox() {
        return new DevMailbox();
    }

    @Bean
    EmailSender emailSender(
            @Value("${app.email.resend.api-key}") String resendApiKey,
            @Value("${app.email.from}") String fromAddress,
            DevMailboxProperties devMailbox,
            DevMailbox mailbox) {
        return withDevMailbox(deliverySender(resendApiKey, fromAddress), devMailbox, mailbox);
    }

    /** The sender that actually tries to put the message somewhere outside this JVM. */
    EmailSender deliverySender(String resendApiKey, String fromAddress) {
        if (resendApiKey.isBlank()) {
            log.warn("No RESEND_API_KEY set - magic-link emails will be written to this log "
                    + "instead of sent. Anyone who can read the log can use the sign-in links.");
            return new LoggingEmailSender();
        }
        log.info("Sending magic-link emails through Resend as {}", fromAddress);
        return new ResendEmailSender(resendApiKey, fromAddress);
    }

    /**
     * Wraps the delivery sender so every message is also readable back through
     * GET /dev/emails. See DevMailboxController for why this is off by default.
     *
     * Enabling it without a token FAILS THE BOOT rather than defaulting to something.
     * The endpoint hands out sign-in links, so the failure mode of a blank token is
     * anybody being able to sign in as anybody - and a misconfiguration that opens
     * that must be impossible to deploy, not merely discouraged.
     */
    EmailSender withDevMailbox(
            EmailSender delivery, DevMailboxProperties properties, DevMailbox mailbox) {
        if (!properties.enabled()) {
            return delivery;
        }
        if (properties.token() == null || properties.token().isBlank()) {
            throw new IllegalStateException(
                    "app.email.dev-mailbox.enabled is true but app.email.dev-mailbox.token is not set. "
                            + "The dev mailbox serves magic-link emails, so it will not run without a token "
                            + "(set DEV_MAILBOX_TOKEN, or unset DEV_MAILBOX_ENABLED).");
        }
        log.warn("Dev mailbox ENABLED - the last {} outgoing emails, sign-in links included, are readable "
                + "from GET /dev/emails by anyone holding the configured token. "
                + "This is for development and demo instances only.", DevMailbox.CAPACITY);
        return new DevMailboxEmailSender(mailbox, delivery);
    }
}
