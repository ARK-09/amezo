package com.arkindustries.amezo.catalog;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Turns a stored object key into the public URL buyers load the image from.
 * Assumes public-read objects, same as every other product image on the
 * internet - no presigned GETs on the read path, unlike the private evidence
 * photos in the deferred returns/warranty work (docs/next-build.md), which is a
 * different privacy requirement entirely.
 *
 * The AWS virtual-hosted pattern is only the default. Any S3-compatible
 * provider serves its objects from somewhere else entirely (R2 hands you a
 * pub-*.r2.dev subdomain or a custom domain, MinIO its own host), and that
 * host has nothing to do with the S3 API endpoint the presigner signs against
 * - so it's a separate setting, app.s3.public-base-url.
 */
@Component
public class ImageUrlResolver {

    private final String baseUrl;

    public ImageUrlResolver(
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
