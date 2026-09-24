package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.identity.api.BuyerIdentityLookup;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class BuyerIdentityLookupService implements BuyerIdentityLookup {

    private final BuyerIdentityRepository buyerIdentityRepository;

    public BuyerIdentityLookupService(BuyerIdentityRepository buyerIdentityRepository) {
        this.buyerIdentityRepository = buyerIdentityRepository;
    }

    @Override
    public UUID findOrCreateByEmail(String email, String fullName) {
        return buyerIdentityRepository.findByEmail(email)
                .orElseGet(() -> buyerIdentityRepository.save(BuyerIdentity.builder()
                        .email(email)
                        .fullName(fullName)
                        .build()))
                .getId();
    }
}
