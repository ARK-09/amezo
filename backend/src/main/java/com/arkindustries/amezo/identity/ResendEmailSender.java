package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.common.exception.EmailDeliveryException;
import com.resend.Resend;
import com.resend.core.exception.ResendException;
import com.resend.services.emails.model.CreateEmailOptions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Magic-link delivery through Resend's HTTP API. Chosen over SMTP because
 * Render's free plan blocks outbound SMTP ports, and over
 * spring-boot-starter-mail because there is no SMTP server to point it at.
 *
 * The API key comes from the environment (RESEND_API_KEY -> app.email.resend
 * .api-key), never from source: it is a bearer credential that can send mail as
 * the sending domain, and a committed one is a committed spam relay.
 *
 * Plain text, not HTML: the caller composes the message (SellerAuthService), so
 * this class would have to invent and escape markup for a body it doesn't own.
 * Mail clients linkify a bare URL on their own.
 */
class ResendEmailSender implements EmailSender {

    private static final Logger log = LoggerFactory.getLogger(ResendEmailSender.class);

    /**
     * The one call that leaves the JVM, behind an interface purely so the failure
     * path below can be tested without a network round trip or a live key.
     */
    interface Transport {
        void send(CreateEmailOptions options) throws ResendException;
    }

    private final Transport transport;
    private final String fromAddress;

    ResendEmailSender(String apiKey, String fromAddress) {
        Resend resend = new Resend(apiKey);
        this.transport = options -> resend.emails().send(options);
        this.fromAddress = fromAddress;
    }

    ResendEmailSender(Transport transport, String fromAddress) {
        this.transport = transport;
        this.fromAddress = fromAddress;
    }

    @Override
    public void send(String toEmail, String subject, String body) {
        CreateEmailOptions options = CreateEmailOptions.builder()
                .from(fromAddress)
                .to(toEmail)
                .subject(subject)
                .text(body)
                .build();

        try {
            transport.send(options);
        } catch (Exception ex) {
            // Exception, not ResendException, and not by laziness: send() declares
            // only ResendException, but a transport failure comes out as a raw
            // java.io.IOException that the signature never mentions (seen in
            // testing: a blocked outbound connection surfaced as an undeclared
            // IOException and escaped a ResendException-only catch as a bare 500).
            // The compiler can't flag what the SDK doesn't declare.
            //
            // Logged as well as thrown: the caller gets the ProblemDetail, while the
            // provider's actual reason - an unverified sending domain being the
            // usual one - stays here for whoever reads the server log.
            log.error("Resend could not send the sign-in email to {} (from {}): {}: {}",
                    toEmail, fromAddress, ex.getClass().getSimpleName(), ex.getMessage());
            throw new EmailDeliveryException(
                    "Couldn't send the sign-in email. The email provider rejected the request.", ex);
        }
    }
}
