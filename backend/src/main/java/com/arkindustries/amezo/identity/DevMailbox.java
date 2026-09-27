package com.arkindustries.amezo.identity;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;

/**
 * The last few emails this instance tried to send, held in memory.
 *
 * <h2>Why this exists</h2>
 *
 * Every sign-in here is a magic link, so an instance that cannot deliver email
 * cannot let anybody in. Resend's free tier is a sandbox until a domain is verified
 * - it delivers only to the account holder's own address - and it is rate limited,
 * so a demo depending on it is a demo that stops working on someone else's schedule.
 * The pre-existing fallback wrote the link to the server log, which works if you can
 * read the server log, and a deployed instance's logs are behind the hosting
 * dashboard.
 *
 * So the messages are also kept here, where {@link DevMailboxController} can hand
 * them back to whoever holds the operator's token.
 *
 * <h2>In memory, and small, on purpose</h2>
 *
 * A table would outlive the process and would need a migration, a retention rule and
 * a reason not to be read from a database backup. A bounded deque forgets on restart
 * and forgets the oldest message once {@link #CAPACITY} is reached, which is all a
 * link with a fifteen-minute life is worth keeping. It is not an audit log and must
 * never be used as one.
 *
 * <h2>It is not an authentication bypass</h2>
 *
 * It holds sign-in links, so reading it IS signing in - which is exactly why the
 * facility is off unless configured, why the controller that exposes it does not
 * exist unless it is on, and why reaching it needs a token the operator supplied.
 * See {@link DevMailboxController} and EmailSenderConfig.
 */
class DevMailbox {

    /** Enough for a demo walking two or three flows; small enough to stay a buffer. */
    static final int CAPACITY = 50;

    /** One message, as it was handed to the sender. */
    record Message(String to, String subject, String body, Instant sentAt, boolean delivered) {
    }

    private final Deque<Message> recent = new ArrayDeque<>(CAPACITY);

    synchronized void record(Message message) {
        if (recent.size() == CAPACITY) {
            recent.removeLast();
        }
        recent.addFirst(message);
    }

    /**
     * Newest first, optionally narrowed to one recipient.
     *
     * The filter is a convenience for a demo with two addresses in play, not a
     * security boundary - anything that can call this can also call it without the
     * filter. Case-insensitive, because nobody types their own address the same way
     * twice.
     */
    synchronized List<Message> recent(String to) {
        return recent.stream()
                .filter(message -> to == null || to.isBlank()
                        || message.to().equalsIgnoreCase(to.trim()))
                .toList();
    }

    /** Only for tests, which must not see each other's messages. */
    synchronized void clear() {
        recent.clear();
    }
}
