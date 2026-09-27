package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.identity.dto.DevMailboxMessageResponse;
import com.arkindustries.amezo.common.exception.InvalidTokenException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.security.MessageDigest;
import java.util.List;

/**
 * Reads the {@link DevMailbox} back, for a demo or a local run with no working email
 * provider.
 *
 * <h2>Three things keep this from being a way in</h2>
 *
 * The body of a message here is a sign-in link, so an open version of this endpoint
 * would let anybody become anybody by asking for a link and then reading it. Hence:
 *
 * <ol>
 *   <li>the bean does not exist unless {@code app.email.dev-mailbox.enabled} is true,
 *       which is false by default - so on an ordinary deployment this is not a route
 *       that is guarded, it is a route that is not there, and the path 404s;
 *   <li>turning it on without {@code app.email.dev-mailbox.token} fails the boot
 *       (EmailSenderConfig), so it cannot be opened by setting one flag or by a
 *       half-finished configuration;
 *   <li>every call must present that token, compared in constant time.
 * </ol>
 *
 * The token is the operator's, supplied through the environment. It is not a
 * credential of any account and grants nothing but a view of this buffer - and it is
 * never defaulted, so there is nothing hardcoded to guess.
 *
 * <h2>It is still a demo facility</h2>
 *
 * Whoever holds the token can read anyone's sign-in link, which is the same authority
 * as reading the server log the fallback sender already writes to. That is acceptable
 * for a demo instance and is not acceptable anywhere real accounts live, which is why
 * the default is off and the warning on boot is loud.
 */
@RestController
@RequestMapping("/dev/emails")
@ConditionalOnProperty(name = "app.email.dev-mailbox.enabled", havingValue = "true")
class DevMailboxController {

    static final String TOKEN_HEADER = "X-Dev-Mailbox-Token";

    private final DevMailbox mailbox;
    private final String token;

    DevMailboxController(DevMailbox mailbox, DevMailboxProperties properties) {
        this.mailbox = mailbox;
        this.token = properties.token();
    }

    /**
     * The recent messages, newest first.
     *
     * The token is accepted as a header or as {@code ?token=}. The query form is there
     * because a browser cannot set a header, and a demo is driven from a browser - and
     * it is no new exposure: a query string reaches the access log, which is the same
     * log the fallback sender writes the whole link into.
     */
    @GetMapping
    List<DevMailboxMessageResponse> recent(
            @RequestHeader(value = TOKEN_HEADER, required = false) String headerToken,
            @RequestParam(required = false) String token,
            @RequestParam(required = false) String to) {

        requireToken(headerToken != null ? headerToken : token);

        return mailbox.recent(to).stream()
                .map(message -> new DevMailboxMessageResponse(
                        message.to(), message.subject(), message.body(), message.sentAt(), message.delivered()))
                .toList();
    }

    /**
     * 401 through InvalidTokenException, which is the same answer an expired magic
     * link gets - this endpoint has no business saying whether a token was close.
     * Constant-time comparison so a wrong token cannot be narrowed by timing it.
     */
    private void requireToken(String presented) {
        if (presented == null
                || !MessageDigest.isEqual(presented.getBytes(), token.getBytes())) {
            throw new InvalidTokenException("Invalid dev mailbox token");
        }
    }
}
