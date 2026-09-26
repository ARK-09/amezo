package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.support.Fixtures;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * GET and PATCH /api/v1/sellers/me/store.
 *
 * Both routes were in the contract, both were called by the portal, and
 * neither had a backend: there was no store-profile table at all, so the
 * Store Settings page could not load and the dashboard's heading fell back to
 * the word "Dashboard" for everyone. These cases pin the parts that are easy to
 * get subtly wrong rather than the happy path alone: the store existing for a
 * seller who never asked for one, an omitted field staying as it was, the
 * timestamp actually moving, the handle 409 naming its field, and one seller's
 * store being invisible to another.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class SellerStoreApiTest {

    private static final String STORE = "/api/v1/sellers/me/store";

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private SellerRepository sellerRepository;

    @Autowired
    private SellerStoreRepository sellerStoreRepository;

    @Autowired
    private SessionRepository sessionRepository;

    // ------------------------------------------------------- auto-provisioning

    /**
     * The headline behaviour. A seller who has never opened Store Settings has
     * no seller_store row, and the answer to that is a store, not a 404 - the
     * page has nothing to seed a form from otherwise.
     */
    @Test
    void firstReadProvisionsADefaultStore() throws Exception {
        Seller seller = seller("provision@example.com");
        assertThat(sellerStoreRepository.findBySellerId(seller.getId())).isEmpty();

        mockMvc.perform(get(STORE).cookie(cookieFor(seller)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").isNotEmpty())
                // Derived from the seller's own record, not invented: full_name
                // is null (nothing captures it yet), so the email's local part
                // is what is left, and it is at least really theirs.
                .andExpect(jsonPath("$.name").value("provision"))
                .andExpect(jsonPath("$.handle").value("provision"))
                .andExpect(jsonPath("$.status").value("OPEN"))
                .andExpect(jsonPath("$.updatedAt").isNotEmpty())
                // Nothing filled in yet reads as null, not as empty strings the
                // storefront would render as blank lines.
                .andExpect(jsonPath("$.tagline").doesNotExist())
                .andExpect(jsonPath("$.about").doesNotExist());

        assertThat(sellerStoreRepository.findBySellerId(seller.getId())).isPresent();
    }

    /** A seller with a name on the account is named after it, not after their inbox. */
    @Test
    void provisioningPrefersTheSellersFullName() throws Exception {
        Seller seller = sellerRepository.save(Seller.builder()
                .email("named@example.com")
                .fullName("Northwind Supply")
                .build());

        mockMvc.perform(get(STORE).cookie(cookieFor(seller)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Northwind Supply"))
                .andExpect(jsonPath("$.handle").value("northwind-supply"));
    }

    /** Provisioning happens once: the second read is the same store, not a new one. */
    @Test
    void secondReadReturnsTheSameStore() throws Exception {
        Cookie session = cookieFor(seller("stable@example.com"));

        String firstId = readId(session);
        String secondId = readId(session);

        assertThat(secondId).isEqualTo(firstId);
    }

    /**
     * Two sellers whose default handles would collide do not: the second is
     * de-duplicated rather than failing on seller_store.handle's UNIQUE index.
     */
    @Test
    void provisioningDeduplicatesACollidingHandle() throws Exception {
        Seller first = sellerRepository.save(Seller.builder()
                .email("collide-a@example.com").fullName("Bits And Bobs").build());
        Seller second = sellerRepository.save(Seller.builder()
                .email("collide-b@example.com").fullName("Bits and bobs").build());

        mockMvc.perform(get(STORE).cookie(cookieFor(first)))
                .andExpect(jsonPath("$.handle").value("bits-and-bobs"));
        mockMvc.perform(get(STORE).cookie(cookieFor(second)))
                .andExpect(jsonPath("$.handle").value("bits-and-bobs-2"));
    }

    // -------------------------------------------------------- partial updates

    /**
     * PATCH semantics: what the body does not mention keeps its value. The
     * regression this guards is a write that blanks every unsent field.
     */
    @Test
    void omittedFieldsAreLeftAlone() throws Exception {
        Cookie session = cookieFor(seller("partial@example.com"));
        mockMvc.perform(patch(STORE).cookie(session).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Northwind","tagline":"Tools that last","location":"Leeds",
                                 "foundedYear":1994,"supportEmail":"help@northwind.test",
                                 "about":"Family run since 1994."}"""))
                .andExpect(status().isOk());

        mockMvc.perform(patch(STORE).cookie(session).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"tagline\":\"Still tools that last\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tagline").value("Still tools that last"))
                .andExpect(jsonPath("$.name").value("Northwind"))
                .andExpect(jsonPath("$.location").value("Leeds"))
                .andExpect(jsonPath("$.foundedYear").value(1994))
                .andExpect(jsonPath("$.supportEmail").value("help@northwind.test"))
                .andExpect(jsonPath("$.about").value("Family run since 1994."));
    }

    /**
     * Blank is not absent. The Store Settings form sends every optional field
     * on every save, empty string included, so "" is how a seller clears a
     * tagline - and it has to come back as null, not as "".
     */
    @Test
    void blankClearsAnOptionalFieldBackToNull() throws Exception {
        Cookie session = cookieFor(seller("clear@example.com"));
        mockMvc.perform(patch(STORE).cookie(session).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"tagline\":\"Temporary\"}"))
                .andExpect(jsonPath("$.tagline").value("Temporary"));

        mockMvc.perform(patch(STORE).cookie(session).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"tagline\":\"\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tagline").doesNotExist());
    }

    @Test
    void statusAndVacationNoteRoundTrip() throws Exception {
        Cookie session = cookieFor(seller("vacation@example.com"));

        mockMvc.perform(patch(STORE).cookie(session).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"VACATION\",\"vacationNote\":\"Back on the 9th\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("VACATION"))
                .andExpect(jsonPath("$.vacationNote").value("Back on the 9th"));

        mockMvc.perform(get(STORE).cookie(session))
                .andExpect(jsonPath("$.status").value("VACATION"));
    }

    /**
     * The trap Agent B hit on product.updated_at: @UpdateTimestamp assigns at
     * flush, so a response mapped from an unflushed entity carries the OLD
     * timestamp while the row has already moved. Both halves are asserted - the
     * body the write returns AND the next read - because it is exactly the case
     * where they disagree.
     */
    @Test
    void updatedAtMovesOnWriteAndInTheResponseBody() throws Exception {
        Cookie session = cookieFor(seller("timestamp@example.com"));
        Instant provisioned = Instant.parse(readField(session, "updatedAt"));

        MvcResult written = mockMvc.perform(patch(STORE).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"tagline\":\"Moved\"}"))
                .andExpect(status().isOk())
                .andReturn();
        Instant returned = Instant.parse(jsonString(written, "updatedAt"));

        assertThat(returned).isAfter(provisioned);
        assertThat(Instant.parse(readField(session, "updatedAt"))).isEqualTo(returned);
    }

    // -------------------------------------------------------- handle conflicts

    /**
     * The contract's 409, and it has to name the field: StoreSettings.tsx looks
     * for the errors entry whose field is "handle" to mark the input.
     */
    @Test
    void takenHandleIs409NamingTheField() throws Exception {
        Cookie mine = cookieFor(seller("handle-a@example.com"));
        Cookie theirs = cookieFor(seller("handle-b@example.com"));

        mockMvc.perform(patch(STORE).cookie(mine).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"handle\":\"northwind-supply\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.handle").value("northwind-supply"));

        mockMvc.perform(patch(STORE).cookie(theirs).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"handle\":\"northwind-supply\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("https://api/errors/handle-taken"))
                .andExpect(jsonPath("$.title").value("Handle already in use"))
                .andExpect(jsonPath("$.errors[0].field").value("handle"))
                .andExpect(jsonPath("$.errors[0].reason").value("already in use"));
    }

    /**
     * Re-saving the form without touching the URL sends the handle back
     * unchanged. That must not collide with the store's own row.
     */
    @Test
    void resubmittingOwnHandleIsNotAConflict() throws Exception {
        Cookie session = cookieFor(seller("same-handle@example.com"));
        String handle = readField(session, "handle");

        mockMvc.perform(patch(STORE).cookie(session).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"handle\":\"" + handle + "\",\"tagline\":\"Unchanged URL\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.handle").value(handle));
    }

    // ------------------------------------------------------------- validation

    /**
     * StoreHandle enforced server-side, not trusted to the client: the pattern,
     * and both length bounds. Each of these is something the form would refuse,
     * which is exactly why the server has to refuse it too.
     */
    @Test
    void invalidHandlesAreRejected() throws Exception {
        Cookie session = cookieFor(seller("bad-handle@example.com"));

        for (String handle : new String[]{
                "-leading",          // leading dash
                "trailing-",         // trailing dash
                "Upper-Case",        // uppercase
                "has space",         // space
                "a",                 // below minLength
                "x".repeat(40),      // above maxLength
                "under_score"}) {
            mockMvc.perform(patch(STORE).cookie(session).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"handle\":\"" + handle + "\"}"))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.type").value("https://api/errors/validation-error"))
                    .andExpect(jsonPath("$.errors[0].field").value("handle"));
        }

        // And none of them was written.
        mockMvc.perform(get(STORE).cookie(session))
                .andExpect(jsonPath("$.handle").value("bad-handle"));
    }

    /** A name is required on StoreProfile, so blanking it is a refusal, not a clear. */
    @Test
    void blankNameIsRejected() throws Exception {
        Cookie session = cookieFor(seller("blank-name@example.com"));

        mockMvc.perform(patch(STORE).cookie(session).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"   \"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("name"));
    }

    @Test
    void supportEmailThatIsNotAnEmailIsRejected() throws Exception {
        Cookie session = cookieFor(seller("bad-email@example.com"));

        mockMvc.perform(patch(STORE).cookie(session).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"supportEmail\":\"not-an-address\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("supportEmail"));
    }

    // ------------------------------------------------------------- isolation

    /**
     * The subject of both routes is whoever the cookie names. A seller can
     * neither read nor write another's store, and there is no id in the path to
     * try it with.
     */
    @Test
    void oneSellersWritesDoNotTouchAnothersStore() throws Exception {
        Cookie mine = cookieFor(seller("iso-a@example.com"));
        Cookie theirs = cookieFor(seller("iso-b@example.com"));

        mockMvc.perform(patch(STORE).cookie(mine).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Mine\",\"tagline\":\"Mine only\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(get(STORE).cookie(theirs))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("iso-b"))
                .andExpect(jsonPath("$.tagline").doesNotExist());

        mockMvc.perform(get(STORE).cookie(mine))
                .andExpect(jsonPath("$.name").value("Mine"));
    }

    // ------------------------------------------------------------------- auth

    /**
     * 401, not 403 and not 404 - the frontend reads a 401 as "not signed in".
     * Nothing is provisioned for a caller with no session either.
     */
    @Test
    void withoutASessionBothRoutesAre401() throws Exception {
        mockMvc.perform(get(STORE))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(patch(STORE).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Anonymous\"}"))
                .andExpect(status().isUnauthorized());
    }

    /** A buyer session is not a seller session, whatever it is pointed at. */
    @Test
    void aBuyerSessionCannotReachTheSellerStore() throws Exception {
        Cookie buyer = Fixtures.sessionCookie(sessionRepository, IdentityType.BUYER, UUID.randomUUID());

        mockMvc.perform(get(STORE).cookie(buyer))
                .andExpect(status().isForbidden());
    }

    // ---------------------------------------------------------------- helpers

    private Seller seller(String email) {
        return sellerRepository.save(Seller.builder().email(email).build());
    }

    private Cookie cookieFor(Seller seller) {
        return Fixtures.sessionCookie(sessionRepository, IdentityType.SELLER, seller.getId());
    }

    private String readId(Cookie session) throws Exception {
        return readField(session, "id");
    }

    private String readField(Cookie session, String field) throws Exception {
        MvcResult result = mockMvc.perform(get(STORE).cookie(session))
                .andExpect(status().isOk())
                .andReturn();
        return jsonString(result, field);
    }

    private static String jsonString(MvcResult result, String field) throws Exception {
        return com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$." + field);
    }
}
