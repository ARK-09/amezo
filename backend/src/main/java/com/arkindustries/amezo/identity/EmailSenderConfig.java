package com.arkindustries.amezo.identity;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Picks the email sender from configuration: Resend when an API key is set,
 * otherwise the log-only fallback.
 *
 * A factory rather than two @Component classes with @ConditionalOnProperty,
 * because the key's property always exists - application.yml declares it with an
 * empty default - so the condition that matters is "non-blank", which that
 * annotation can't express. This way exactly one bean exists, the choice is one
 * readable line, and a deployment with no key still boots.
 */
@Configuration
class EmailSenderConfig {

    private static final Logger log = LoggerFactory.getLogger(EmailSenderConfig.class);

    @Bean
    EmailSender emailSender(
            @Value("${app.email.resend.api-key}") String resendApiKey,
            @Value("${app.email.from}") String fromAddress) {
        if (resendApiKey.isBlank()) {
            log.warn("No RESEND_API_KEY set - magic-link emails will be written to this log "
                    + "instead of sent. Anyone who can read the log can use the sign-in links.");
            return new LoggingEmailSender();
        }
        log.info("Sending magic-link emails through Resend as {}", fromAddress);
        return new ResendEmailSender(resendApiKey, fromAddress);
    }
}
