package com.arkindustries.amezo.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

// Wiring only - no upload/confirm service is built this pass. Whatever
// service ends up handling POST /products/{id}/images and PATCH
// /images/{id} (docs/api-design.md) injects these beans.
@Configuration
public class S3Config {

    @Bean
    public S3Client s3Client(@Value("${app.s3.region}") String region) {
        return S3Client.builder().region(Region.of(region)).build();
    }

    @Bean
    public S3Presigner s3Presigner(@Value("${app.s3.region}") String region) {
        return S3Presigner.builder().region(Region.of(region)).build();
    }
}
