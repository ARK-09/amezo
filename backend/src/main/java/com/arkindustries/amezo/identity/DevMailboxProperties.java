package com.arkindustries.amezo.identity;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The dev mailbox's two settings. See {@link DevMailboxController} for why both are
 * required together and why neither has a usable default.
 *
 * @param enabled whether outgoing email is also kept in memory and readable back.
 *                False everywhere it is not deliberately turned on.
 * @param token   the operator's token every read must present. Blank is refused at
 *                boot rather than treated as "no token needed", because a facility
 *                that hands out sign-in links must not be one typo from being open.
 */
@ConfigurationProperties(prefix = "app.email.dev-mailbox")
record DevMailboxProperties(boolean enabled, String token) {
}
