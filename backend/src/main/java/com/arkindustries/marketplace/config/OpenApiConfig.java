package com.arkindustries.marketplace.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeIn;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import org.springframework.context.annotation.Configuration;

// paramName is a literal, not ${app.session.cookie-name} - annotation
// values must be compile-time constants. Keep it in sync with
// application.yml by hand if that property ever changes.
@Configuration
@OpenAPIDefinition(info = @Info(title = "Marketplace API", version = "v1"))
@SecurityScheme(
        name = "sessionCookie",
        type = SecuritySchemeType.APIKEY,
        in = SecuritySchemeIn.COOKIE,
        paramName = "mp_session"
)
public class OpenApiConfig {
}
