package com.arkindustries.amezo.catalog.dto;

import java.util.UUID;

public record ImageResponse(UUID id, String url, int position) {
}
