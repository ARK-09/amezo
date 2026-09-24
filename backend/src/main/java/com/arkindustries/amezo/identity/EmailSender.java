package com.arkindustries.amezo.identity;

/**
 * No mail dependency exists in this project yet (no SMTP config, no
 * spring-boot-starter-mail). Kept behind an interface so a real
 * implementation can be swapped in without touching SellerAuthService -
 * see LoggingEmailSender for the log-only MVP stub currently wired.
 */
interface EmailSender {

    void send(String toEmail, String subject, String body);
}
