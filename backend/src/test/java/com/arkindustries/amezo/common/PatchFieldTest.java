package com.arkindustries.amezo.common;

import com.arkindustries.amezo.identity.dto.UpdateStoreProfileRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The three-state PATCH field, tested through the DTO that needs it.
 *
 * A plain ObjectMapper and no Spring context, which is the point: this is the
 * one part of the store work whose correctness can be PROVEN in this
 * environment, where Docker is missing and every Testcontainers test errors. If
 * absent and explicit-null ever collapse back into one value, "Remove cover"
 * silently stops working and a founding year can be set but never taken out -
 * both of which are invisible failures at the HTTP layer.
 */
class PatchFieldTest {

    private final ObjectMapper mapper = new ObjectMapper();

    // ------------------------------------------------------------ foundedYear

    @Test
    void anAbsentNumberLeavesTheComponentNull() throws Exception {
        UpdateStoreProfileRequest request = read("{\"tagline\":\"Only this\"}");

        assertThat(request.foundedYear()).isNull();
    }

    @Test
    void anExplicitNullNumberIsPresentAndCleared() throws Exception {
        UpdateStoreProfileRequest request = read("{\"foundedYear\":null}");

        assertThat(request.foundedYear()).isNotNull();
        assertThat(request.foundedYear().isCleared()).isTrue();
        assertThat(request.foundedYear().value()).isNull();
    }

    @Test
    void aNumberIsCarriedThrough() throws Exception {
        UpdateStoreProfileRequest request = read("{\"foundedYear\":2019}");

        assertThat(request.foundedYear()).isNotNull();
        assertThat(request.foundedYear().isCleared()).isFalse();
        assertThat(request.foundedYear().value()).isEqualTo(2019);
    }

    // ------------------------------------------------------- cover and logo

    /**
     * The bug this whole type exists for. The Branding section's "Remove cover"
     * sends {"coverUrl": null}, and under plain null-means-unchanged the server
     * read that as "leave the cover alone" - so the button did nothing against
     * the real API while appearing to work against the MSW mock.
     */
    @Test
    void anExplicitNullUrlIsAClearNotAnAbsence() throws Exception {
        UpdateStoreProfileRequest cleared = read("{\"coverUrl\":null,\"logoUrl\":null}");

        assertThat(cleared.coverUrl()).isNotNull();
        assertThat(cleared.coverUrl().isCleared()).isTrue();
        assertThat(cleared.logoUrl()).isNotNull();
        assertThat(cleared.logoUrl().isCleared()).isTrue();
    }

    @Test
    void aUrlOmittedFromTheBodyIsUntouched() throws Exception {
        UpdateStoreProfileRequest request = read("{\"name\":\"Aurora Audio\"}");

        assertThat(request.coverUrl()).isNull();
        assertThat(request.logoUrl()).isNull();
    }

    @Test
    void aUrlIsCarriedThrough() throws Exception {
        UpdateStoreProfileRequest request =
                read("{\"coverUrl\":\"https://cdn.test/stores/a/cover/1\"}");

        assertThat(request.coverUrl().value()).isEqualTo("https://cdn.test/stores/a/cover/1");
    }

    /**
     * Blank still clears, because the Store Settings form sends every optional
     * field on every save and an emptied box goes out as "". Both spellings have
     * to reach the same place; the service's clearedIfBlank is what turns this
     * one into null.
     */
    @Test
    void blankIsAValueNotAnAbsence() throws Exception {
        UpdateStoreProfileRequest request = read("{\"coverUrl\":\"\"}");

        assertThat(request.coverUrl()).isNotNull();
        assertThat(request.coverUrl().isCleared()).isFalse();
        assertThat(request.coverUrl().value()).isEmpty();
    }

    // ------------------------------------------------- the rest still binds

    /** The unwrapped fields are untouched by any of this. */
    @Test
    void plainFieldsStillBindAsBefore() throws Exception {
        UpdateStoreProfileRequest request = read("""
                {"name":"Aurora Audio","handle":"aurora-audio","tagline":"Repairable audio",
                 "location":"Portland, OR","supportEmail":"hello@aurora.test","about":"Seven people.",
                 "status":"VACATION","vacationNote":"Back on the 9th"}""");

        assertThat(request.name()).isEqualTo("Aurora Audio");
        assertThat(request.handle()).isEqualTo("aurora-audio");
        assertThat(request.status().name()).isEqualTo("VACATION");
        assertThat(request.vacationNote()).isEqualTo("Back on the 9th");
        assertThat(request.foundedYear()).isNull();
    }

    private UpdateStoreProfileRequest read(String json) throws Exception {
        return mapper.readValue(json, UpdateStoreProfileRequest.class);
    }
}
