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
 *   public        - GET /products/**, GET /variants, GET /categories,
 *                    GET /countries, POST /magic-links, POST /sessions,
 *                    POST /orders (guest checkout), the OpenAPI spec path
 *                    (springdoc.api-docs.path, wherever that points),
 *                    POST /auth/{seller,buyer}/magic-link and /verify
 *   either role   - GET /sessions/current, DELETE /sessions/current
 *                    (SessionController - the role-agnostic sign-out)
 *   buyer only    - POST /reviews, the per-product review eligibility read
 *                    (GET under a product's reviews), the last-checkout-details
 *                    read, DELETE /auth/buyer/session
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
                // Buyer-scoped, so it has to be matched BEFORE the blanket
                // GET /products/** rule below - Spring Security takes the first
                // matching rule, and a permitAll there would let an anonymous
                // caller reach a method that assumes a buyer principal.
                .requestMatchers(HttpMethod.GET, "/products/*/reviews/eligibility").hasRole("BUYER")
                .requestMatchers(HttpMethod.GET, "/products/**").permitAll()
                // The system reference lists. Public because the category
                // navigation and the checkout country selector both render before
                // anyone signs in.
                .requestMatchers(HttpMethod.GET, "/categories", "/countries").permitAll()
                // The cart's batch lookup. Public for the same reason the rest of the
                // catalog read surface is: a cart exists before anyone signs in.
                .requestMatchers(HttpMethod.GET, "/variants").permitAll()
                .requestMatchers(HttpMethod.POST, "/magic-links").permitAll()
                .requestMatchers(HttpMethod.POST, "/sessions").permitAll()
                .requestMatchers(HttpMethod.POST, "/orders").permitAll()
                .requestMatchers(HttpMethod.POST,
                        "/auth/seller/magic-link", "/auth/seller/verify",
                        "/auth/buyer/magic-link", "/auth/buyer/verify").permitAll()
                .requestMatchers(apiDocsPath + "/**").permitAll()
                // Spring's internal error dispatch, not a real route - without this,
                // anyRequest().denyAll() masks every unhandled exception behind a 403
                // instead of the real ProblemDetail from ApiExceptionHandler.
                .requestMatchers("/error").permitAll()

                // Buyers and sellers alike - the routes either role reaches.
                // A missing or expired cookie gets the 401 from
                // ProblemDetailAuthenticationEntryPoint, which is the frontend's
                // "not signed in" signal, not an error to show.
                //
                // DELETE has a controller behind it now (SessionController), so
                // this pair is two live routes rather than the dead rule the
                // DELETE used to be.
                //
                // Sign-out is authenticated() and not role-scoped on purpose.
                // The role-prefixed sign-outs below scope to one identity type
                // each, and that is what broke the account page: it is reachable
                // by a seller session, so its buyer-only sign-out 403'd for
                // exactly the people most likely to have both. Revoking a
                // session needs no role - it deletes the row the cookie names.
                .requestMatchers(HttpMethod.GET, "/sessions/current").authenticated()
                .requestMatchers(HttpMethod.DELETE, "/sessions/current").authenticated()

                // GET /orders/** had a rule here and no controller behind it, the
                // same dead-rule shape that made /sessions/current answer 404. A
                // buyer order history isn't built, so the path is now plainly not a
                // route (403 from denyAll) rather than looking like a broken one.
                //
                // Writing a review requires being a signed-in buyer; ReviewService
                // then checks that the order line is actually theirs. The role is
                // the door, the ownership check is the lock - a buyer session alone
                // does not entitle anyone to review a stranger's purchase.
                .requestMatchers(HttpMethod.POST, "/reviews").hasRole("BUYER")

                // Reading back a buyer's own last delivery details to prefill
                // checkout. Buyer-scoped even though POST /orders beside it is
                // public: checking out needs no account, but reading what someone
                // ordered before is reading their data.
                .requestMatchers(HttpMethod.GET, "/checkout/last-details").hasRole("BUYER")

                .requestMatchers(HttpMethod.DELETE, "/auth/seller/session").hasRole("SELLER")
                .requestMatchers(HttpMethod.DELETE, "/auth/buyer/session").hasRole("BUYER")

                // Every method, not just GET: /sellers/me/** is the seller's own
                // namespace by construction, and a method-by-method allow-list is
                // how POST /sellers/me/products ended up 403ing - the endpoint
                // existed, no rule named it, and anyRequest().denyAll() answered.
                // Listing the namespace once means a new endpoint under it is
                // seller-only from the moment it exists.
                .requestMatchers("/sellers/me/**").hasRole("SELLER")
                // The same namespace under the /api/v1 prefix the contract uses
                // for new endpoints. A separate line because the matcher above
                // matches the path as written: without this, a new
                // /api/v1/sellers/me/... route falls through to
                // anyRequest().denyAll() and 403s however correct it is.
                .requestMatchers("/api/v1/sellers/me/**").hasRole("SELLER")
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
