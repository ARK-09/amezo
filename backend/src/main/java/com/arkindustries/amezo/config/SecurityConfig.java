package com.arkindustries.amezo.config;

import com.arkindustries.amezo.identity.SessionCookieAuthenticationFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * No passwords, no OAuth - the only credential is a magic-link-issued
 * session cookie, resolved by SessionCookieAuthenticationFilter (identity
 * package) ahead of Spring's own UsernamePasswordAuthenticationFilter.
 * CSRF is disabled deliberately: this is a JSON API (no form posts),
 * guarded by a SameSite=Lax session cookie plus a locked-down CORS origin
 * allow-list - the accepted modern replacement for CSRF tokens on
 * cookie-authenticated APIs.
 *
 * Route table (see docs/api-design.md for the full endpoint list):
 *   public        - GET /products/**, GET /variants, POST /magic-links,
 *                    POST /sessions,
 *                    POST /orders (guest checkout), the OpenAPI spec path
 *                    (springdoc.api-docs.path, wherever that points),
 *                    POST /auth/seller/magic-link, POST /auth/seller/verify
 *   either role   - GET /sessions/current (SessionController)
 *   buyer only    - GET /orders/**, POST /reviews
 *   seller only   - every method under /sellers/me/** (own product list,
 *                    product create, orders, ship), plus product/variant/image
 *                    writes under /products/**, /variants/** and /images/**,
 *                    order-line updates, and DELETE /auth/seller/session
 *
 * The /auth/seller/* trio is the seller-portal-specific magic-link flow
 * (SellerAuthController) - see that class's own note on why it's a separate
 * path prefix from the generic /magic-links + /sessions pair above.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            SessionCookieAuthenticationFilter sessionCookieAuthenticationFilter,
            ProblemDetailAuthenticationEntryPoint authenticationEntryPoint,
            ProblemDetailAccessDeniedHandler accessDeniedHandler,
            CorsConfigurationSource corsConfigurationSource,
            // Read from springdoc's own property rather than repeating the literal:
            // the spec path is configurable (API_DOCS_PATH), and a matcher that
            // didn't follow it would 403 the spec at its new path instead.
            @Value("${springdoc.api-docs.path}") String apiDocsPath) throws Exception {

        http
            .csrf(csrf -> csrf.disable())
            .cors(cors -> cors.configurationSource(corsConfigurationSource))
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.GET, "/products/**").permitAll()
                // The cart's batch lookup. Public for the same reason the rest of the
                // catalog read surface is: a cart exists before anyone signs in.
                .requestMatchers(HttpMethod.GET, "/variants").permitAll()
                .requestMatchers(HttpMethod.POST, "/magic-links").permitAll()
                .requestMatchers(HttpMethod.POST, "/sessions").permitAll()
                .requestMatchers(HttpMethod.POST, "/orders").permitAll()
                .requestMatchers(HttpMethod.POST, "/auth/seller/magic-link", "/auth/seller/verify").permitAll()
                .requestMatchers(apiDocsPath + "/**").permitAll()
                // Spring's internal error dispatch, not a real route - without this,
                // anyRequest().denyAll() masks every unhandled exception behind a 403
                // instead of the real ProblemDetail from ApiExceptionHandler.
                .requestMatchers("/error").permitAll()

                // Buyers and sellers alike - the only route either role reaches.
                // A missing or expired cookie gets the 401 from
                // ProblemDetailAuthenticationEntryPoint, which is the frontend's
                // "not signed in" signal, not an error to show.
                //
                // DELETE /sessions/current had a rule here too and no controller
                // behind it, so it answered 404 to an authenticated caller - the
                // same dead-rule bug as the GET. Sign-out is
                // DELETE /auth/seller/session; nothing calls a second one.
                .requestMatchers(HttpMethod.GET, "/sessions/current").authenticated()

                .requestMatchers(HttpMethod.GET, "/orders/**").hasRole("BUYER")
                .requestMatchers(HttpMethod.POST, "/reviews").hasRole("BUYER")

                .requestMatchers(HttpMethod.DELETE, "/auth/seller/session").hasRole("SELLER")

                // Every method, not just GET: /sellers/me/** is the seller's own
                // namespace by construction, and a method-by-method allow-list is
                // how POST /sellers/me/products ended up 403ing - the endpoint
                // existed, no rule named it, and anyRequest().denyAll() answered.
                // Listing the namespace once means a new endpoint under it is
                // seller-only from the moment it exists.
                .requestMatchers("/sellers/me/**").hasRole("SELLER")
                .requestMatchers(HttpMethod.DELETE, "/products/*").hasRole("SELLER")
                // Removing a variant or an image is a seller write like any other;
                // the service resolves which product they belong to and 404s if it
                // isn't the caller's.
                .requestMatchers(HttpMethod.DELETE, "/variants/*", "/images/*").hasRole("SELLER")
                .requestMatchers(HttpMethod.PATCH, "/products/**").hasRole("SELLER")
                .requestMatchers(HttpMethod.POST,
                        "/products/*/variants", "/products/*/images", "/variants/*/images",
                        "/products/*/images/upload-url", "/products/*/images/confirm").hasRole("SELLER")
                .requestMatchers(HttpMethod.PATCH, "/variants/**", "/images/**", "/order-lines/**").hasRole("SELLER")

                .anyRequest().denyAll()
            )
            .exceptionHandling(e -> e
                .authenticationEntryPoint(authenticationEntryPoint)
                .accessDeniedHandler(accessDeniedHandler))
            .addFilterBefore(sessionCookieAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource(
            @Value("${app.cors.allowed-origins}") String allowedOrigins) {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(List.of(allowedOrigins.split(",")));
        configuration.setAllowedMethods(List.of("GET", "POST", "PATCH", "DELETE"));
        configuration.setAllowedHeaders(List.of("Content-Type"));
        configuration.setAllowCredentials(true); // the session cookie must travel cross-port in local dev
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
