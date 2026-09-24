package com.arkindustries.amezo.orders.dto;

import jakarta.validation.constraints.NotBlank;

public record ShipOrderRequest(@NotBlank String trackingNumber) {
}
