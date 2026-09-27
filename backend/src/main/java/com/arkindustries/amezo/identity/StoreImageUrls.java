package com.arkindustries.amezo.identity;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Turns a stored object key into the public URL a shopper's browser loads the
 * storefront's cover and logo from. Same three settings, and the same AWS
 * virtual-hosted fallback, as catalog's ImageUrlResolver: the bucket's API
 * endpoint and the host its objects are SERVED from are different things on
 * every S3-compatible provider (R2 hands out a pub-*.r2.dev subdomain, MinIO its
 * own host), which is why app.s3.public-base-url exists separately.
 *
 * A second class rather than an import of catalog's, deliberately.
 * PackageBoundaryTest forbids identity from depending on anything in catalog
 * outside catalog.api, and this is not a cross-feature query worth an api
 * surface - it is a pure function of three config values with no catalog
 * concepts in it. The alternative was hoisting one of them into `common`, which
 * means editing catalog while another agent is working in it.
 */
@Component
public class StoreImageUrls {

    private final String baseUrl;

    public StoreImageUrls(
            @Value("${app.s3.bucket}") String bucket,
            @Value("${app.s3.region}") String region,
            @Value("${app.s3.public-base-url}") String publicBaseUrl) {
        this.baseUrl = publicBaseUrl.isBlank()
                ? "https://%s.s3.%s.amazonaws.com".formatted(bucket, region)
                : publicBaseUrl.replaceAll("/+$", "");
    }

    public String forKey(String s3Key) {
        return baseUrl + "/" + s3Key;
    }
}
