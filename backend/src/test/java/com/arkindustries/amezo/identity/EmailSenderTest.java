package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.common.exception.EmailDeliveryException;
import com.resend.core.exception.ResendException;
import com.resend.services.emails.model.CreateEmailOptions;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Plain unit tests - no Spring context, no Postgres, no network. The picking
 * logic and the failure mapping are exactly the parts that decide whether a
 * deployment silently logs sign-in links or tells the seller the truth, so they're
 * worth testing somewhere that runs without a Docker daemon.
 */
class EmailSenderTest {

    private final EmailSenderConfig config = new EmailSenderConfig();

    @Test
    void fallsBackToLoggingWhenNoApiKeyIsConfigured() {
        assertThat(config.emailSender("", "onboarding@resend.dev"))
                .isInstanceOf(LoggingEmailSender.class);
        assertThat(config.emailSender("   ", "onboarding@resend.dev"))
                .isInstanceOf(LoggingEmailSender.class);
    }

    @Test
    void usesResendWhenAnApiKeyIsConfigured() {
        assertThat(config.emailSender("re_test_key", "noreply@example.com"))
                .isInstanceOf(ResendEmailSender.class);
    }

    @Test
    void sendsTheConfiguredFromAddressSubjectAndBody() throws Exception {
        List<CreateEmailOptions> sent = new ArrayList<>();
        EmailSender sender = new ResendEmailSender(sent::add, "noreply@example.com");

        sender.send("seller@example.com", "Sign in to Amezo Seller Portal", "Click: https://amezo/verify?token=abc");

        assertThat(sent).hasSize(1);
        CreateEmailOptions options = sent.get(0);
        assertThat(options.getFrom()).isEqualTo("noreply@example.com");
        assertThat(options.getTo()).containsExactly("seller@example.com");
        assertThat(options.getSubject()).isEqualTo("Sign in to Amezo Seller Portal");
        assertThat(options.getText()).contains("https://amezo/verify?token=abc");
        // Plain text only - the caller owns the message, so this class invents no markup.
        assertThat(options.getHtml()).isNull();
    }

    /**
     * The failure that will actually happen: Resend refusing a recipient that isn't
     * the account's own address while no domain is verified. It has to reach the
     * caller as a 502-mapped exception, not get swallowed into a "check your email"
     * for a link that was never sent.
     */
    @Test
    void wrapsAProviderRefusalSoTheCallerLearnsTheEmailWasNotSent() {
        EmailSender sender = new ResendEmailSender(
                options -> {
                    throw new ResendException("You can only send testing emails to your own email address");
                },
                "onboarding@resend.dev");

        assertThatThrownBy(() -> sender.send("someone-else@example.com", "Sign in", "link"))
                .isInstanceOf(EmailDeliveryException.class)
                .hasMessageContaining("Couldn't send the sign-in email")
                .hasRootCauseInstanceOf(ResendException.class);
    }

    /**
     * The other real failure: the network, not the provider. Resend's send()
     * declares only ResendException, but a transport error comes out as a raw
     * java.io.IOException the signature never mentions - so a catch on
     * ResendException alone would let it escape as an unmapped 500. Reproduced
     * here with the same shape: a checked exception thrown undeclared.
     */
    @Test
    void wrapsAnUndeclaredTransportFailureToo() {
        EmailSender sender = new ResendEmailSender(
                options -> sneakyThrow(new IOException("Unexpected response code for CONNECT: 403")),
                "onboarding@resend.dev");

        assertThatThrownBy(() -> sender.send("seller@example.com", "Sign in", "link"))
                .isInstanceOf(EmailDeliveryException.class)
                .hasRootCauseInstanceOf(IOException.class);
    }

    @SuppressWarnings("unchecked")
    private static <T extends Throwable> void sneakyThrow(Throwable t) throws T {
        throw (T) t;
    }
}
