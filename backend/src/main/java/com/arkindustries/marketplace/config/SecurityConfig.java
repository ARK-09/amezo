package com.arkindustries.marketplace.config;

import com.arkindustries.marketplace.identity.SessionCookieAuthenticationFilter;
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
 *   public        - GET /products/**, POST /magic-links, POST /sessions,
 *                    POST /orders (guest checkout), OpenAPI/Swagger paths
 *   either role   - GET/DELETE /sessions/current
 *   buyer only    - GET /orders/**, POST /reviews
 *   seller only   - /sellers/me/**, product/variant/image writes, order-line updates
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
            CorsConfigurationSource corsConfigurationSource) throws Exception {

        http
            .csrf(csrf -> csrf.disable())
            .cors(cors -> cors.configurationSource(corsConfigurationSource))
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.GET, "/products/**").permitAll()
                .requestMatchers(HttpMethod.POST, "/magic-links").permitAll()
                .requestMatchers(HttpMethod.POST, "/sessions").permitAll()
                .requestMatchers(HttpMethod.POST, "/orders").permitAll()
                .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                // Spring's internal error dispatch, not a real route - without this,
                // anyRequest().denyAll() masks every unhandled exception behind a 403
                // instead of the real ProblemDetail from ApiExceptionHandler.
                .requestMatchers("/error").permitAll()

                .requestMatchers(HttpMethod.GET, "/sessions/current").authenticated()
                .requestMatchers(HttpMethod.DELETE, "/sessions/current").authenticated()

                .requestMatchers(HttpMethod.GET, "/orders/**").hasRole("BUYER")
                .requestMatchers(HttpMethod.POST, "/reviews").hasRole("BUYER")

                .requestMatchers(HttpMethod.GET, "/sellers/me/**").hasRole("SELLER")
                .requestMatchers(HttpMethod.POST, "/products").hasRole("SELLER")
                .requestMatchers(HttpMethod.PATCH, "/products/**").hasRole("SELLER")
                .requestMatchers(HttpMethod.POST,
                        "/products/*/variants", "/products/*/images", "/variants/*/images").hasRole("SELLER")
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
