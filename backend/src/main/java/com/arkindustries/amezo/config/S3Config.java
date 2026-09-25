package com.arkindustries.amezo.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3ClientBuilder;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

import java.net.URI;

/**
 * Credentials come from the SDK's default chain (AWS_ACCESS_KEY_ID /
 * AWS_SECRET_ACCESS_KEY), which is why nothing wires them here - see
 * backend/.env.example.
 *
 * app.s3.endpoint switches both beans onto an S3-compatible provider
 * (Cloudflare R2, Backblaze B2, MinIO) instead of AWS. Empty means AWS. Two
 * things change together when it's set, and both have to: the endpoint itself,
 * and path-style addressing - the SDK otherwise folds the bucket name into the
 * hostname, which is a host these providers don't serve. R2 also wants
 * app.s3.region left at auto.
 */
@Configuration
public class S3Config {

    @Bean
    public S3Client s3Client(
            @Value("${app.s3.region}") String region,
            @Value("${app.s3.endpoint}") String endpoint) {
        S3ClientBuilder builder = S3Client.builder().region(Region.of(region));
        if (!endpoint.isBlank()) {
            builder.endpointOverride(URI.create(endpoint))
                    .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build());
        }
        return builder.build();
    }

    @Bean
    public S3Presigner s3Presigner(
            @Value("${app.s3.region}") String region,
            @Value("${app.s3.endpoint}") String endpoint) {
        S3Presigner.Builder builder = S3Presigner.builder().region(Region.of(region));
        if (!endpoint.isBlank()) {
            builder.endpointOverride(URI.create(endpoint))
                    .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build());
        }
        return builder.build();
    }
}
