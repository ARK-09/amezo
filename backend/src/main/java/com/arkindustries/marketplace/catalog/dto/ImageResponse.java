package com.arkindustries.marketplace.catalog.dto;

import java.util.UUID;

public record ImageResponse(UUID id, String url, int position) {
}
