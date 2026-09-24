package com.arkindustries.amezo.catalog.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record ImageConfirmRequest(@NotNull UUID imageId) {
}
