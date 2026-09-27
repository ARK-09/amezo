package com.arkindustries.amezo.identity;

import com.arkindustries.amezo.support.Fixtures;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * POST /api/v1/sellers/me/store/images and .../images/confirm, plus the two
 * PATCH paths that clear what they set.
 *
 * Both routes were in the contract with no backend at all: seller_store's
 * cover_url and logo_url were writable, but nothing on the server produced a URL
 * to write into them, so the Branding section worked only against the MSW mock.
 *
 * These cases pin the parts that are easy to get subtly wrong rather than the
 * happy path alone: the slot being checked against the reservation, a confirm of
 * an object that was never uploaded leaving the profile untouched, a replaced
 * cover's object being deleted, and one seller being unable to confirm another's
 * upload.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class SellerStoreImageApiTest {

    private static final String STORE = "/api/v1/sellers/me/store";
    private static final String IMAGES = STORE + "/images";
    private static final String CONFIRM = STORE + "/images/confirm";

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    static {
        // Presigning resolves credentials through the SDK's default chain the
        // first time it signs, and CI has none. These two system properties are a
        // link in that chain, so the signing math has a key to work with; nothing
        // ever leaves the JVM - a presigned URL is computed locally, not
        // requested. Same block, same reason, as SellerProductApiTest.
        System.setProperty("aws.accessKeyId", "test-access-key");
        System.setProperty("aws.secretAccessKey", "test-secret-key");
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private SellerRepository sellerRepository;

    @Autowired
    private SessionRepository sessionRepository;

    @Autowired
    private SellerStoreRepository storeRepository;

    @Autowired
    private SellerStoreImageRepository storeImageRepository;

    /**
     * Mocked, not real: confirm HEADs the bucket and a replacement deletes from
     * it, and neither belongs in a test's reach. Stubbing it also makes "the
     * object isn't there" a case that can be asserted rather than waited for.
     */
    @MockitoBean
    private S3Client s3Client;

    // ------------------------------------------------------------- presigning

    @Test
    void reservingACoverSlotAnswersAPresignedPutAndAPendingRow() throws Exception {
        Cookie session = cookieFor(seller("reserve@example.com"));

        String body = mockMvc.perform(post(IMAGES).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"slot":"COVER","contentType":"image/png","fileSizeBytes":204800}"""))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.uploadUrl").isNotEmpty())
                .andExpect(jsonPath("$.expiresAt").isNotEmpty())
                .andReturn().getResponse().getContentAsString();

        UUID id = UUID.fromString(objectMapper.readTree(body).get("id").asText());
        SellerStoreImage reserved = storeImageRepository.findById(id).orElseThrow();
        assertThat(reserved.getSlot()).isEqualTo(StoreImageSlot.COVER);
        assertThat(reserved.getStatus()).isEqualTo(StoreImageStatus.PENDING);
        assertThat(reserved.getSizeBytes()).isEqualTo(204800L);

        // Nothing is live yet. The whole reason a PENDING row exists is that the
        // object it names may never arrive.
        mockMvc.perform(get(STORE).cookie(session))
                .andExpect(jsonPath("$.coverUrl").doesNotExist());

        // A signed PUT for the key the row holds, not a bare bucket URL.
        String uploadUrl = objectMapper.readTree(body).get("uploadUrl").asText();
        assertThat(uploadUrl).contains(reserved.getS3Key());
        assertThat(uploadUrl).contains("X-Amz-Signature");
    }

    /**
     * The key carries the slot, so an operator looking at the bucket can tell a
     * 1600x400 band from a logo without joining back to the database.
     */
    @Test
    void theObjectKeyIsScopedToTheStoreAndTheSlot() throws Exception {
        Cookie session = cookieFor(seller("keyed@example.com"));
        UUID id = reserve(session, "LOGO", 4096);

        SellerStoreImage reserved = storeImageRepository.findById(id).orElseThrow();
        assertThat(reserved.getS3Key())
                .startsWith("stores/" + reserved.getSellerStoreId() + "/logo/");
    }

    /** The drop-zone promises "up to 5 MB". The server has to mean it. */
    @Test
    void aFileOverFiveMegabytesIsRefusedBeforeAnyUrlIsIssued() throws Exception {
        Seller seller = seller("too-big@example.com");
        Cookie session = cookieFor(seller);
        // Reading the store first so the refusal below cannot be mistaken for
        // "the store did not exist yet".
        mockMvc.perform(get(STORE).cookie(session)).andExpect(status().isOk());
        UUID storeId = storeRepository.findBySellerId(seller.getId()).orElseThrow().getId();

        mockMvc.perform(post(IMAGES).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"slot":"COVER","contentType":"image/jpeg","fileSizeBytes":6291456}"""))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.type").value("https://api/errors/file-too-large"));

        // Nothing was reserved: a URL, once issued, is a capability the bucket
        // honours for the whole TTL whatever we later think of it.
        assertThat(storeImageRepository.findBySellerStoreIdAndSlot(storeId, StoreImageSlot.COVER))
                .isEmpty();
    }

    /**
     * accept="image/*" filters the file picker, never a drag-and-drop, so the
     * content type is checked here too - it is signed into the URL and served
     * back to every shopper as the object's Content-Type.
     */
    @Test
    void aContentTypeThatIsNotAnImageIsRejectedNamingTheField() throws Exception {
        Cookie session = cookieFor(seller("not-image@example.com"));

        mockMvc.perform(post(IMAGES).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"slot":"COVER","contentType":"application/pdf","fileSizeBytes":2048}"""))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.type").value("https://api/errors/validation-error"))
                .andExpect(jsonPath("$.errors[0].field").value("contentType"));
    }

    @Test
    void aMissingSlotOrSizeIsRejectedNamingTheField() throws Exception {
        Cookie session = cookieFor(seller("incomplete@example.com"));

        mockMvc.perform(post(IMAGES).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"image/png\",\"fileSizeBytes\":1024}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("slot"));

        mockMvc.perform(post(IMAGES).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"slot\":\"COVER\",\"contentType\":\"image/png\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("fileSizeBytes"));
    }

    /**
     * A seller who picks three files before any confirm lands leaves two dead
     * reservations. Only the newest can be confirmed, so the older rows - and
     * their objects - go.
     */
    @Test
    void anOlderReservationForTheSameSlotIsDiscarded() throws Exception {
        Cookie session = cookieFor(seller("repicked@example.com"));

        UUID first = reserve(session, "COVER", 1024);
        UUID second = reserve(session, "COVER", 2048);

        assertThat(storeImageRepository.findById(first)).isEmpty();
        assertThat(storeImageRepository.findById(second)).isPresent();
    }

    /** The two slots are independent: reserving a logo leaves the cover alone. */
    @Test
    void reservingTheOtherSlotDoesNotDiscardThisOne() throws Exception {
        Cookie session = cookieFor(seller("both-slots@example.com"));

        UUID cover = reserve(session, "COVER", 1024);
        UUID logo = reserve(session, "LOGO", 1024);

        assertThat(storeImageRepository.findById(cover)).isPresent();
        assertThat(storeImageRepository.findById(logo)).isPresent();
    }

    // -------------------------------------------------------------- confirming

    @Test
    void confirmPutsTheUrlOnTheProfileAndAnswersTheWholeProfile() throws Exception {
        Cookie session = cookieFor(seller("confirmed@example.com"));
        UUID id = reserve(session, "COVER", 8192);
        headReturns(4242L);

        String key = storeImageRepository.findById(id).orElseThrow().getS3Key();

        mockMvc.perform(post(CONFIRM).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\":\"" + id + "\",\"slot\":\"COVER\"}"))
                .andExpect(status().isOk())
                // The whole StoreProfile, not just a URL: the Branding section
                // writes this straight into its cache instead of re-reading.
                .andExpect(jsonPath("$.handle").value("confirmed"))
                .andExpect(jsonPath("$.status").value("OPEN"))
                .andExpect(jsonPath("$.coverUrl").value(org.hamcrest.Matchers.endsWith(key)))
                .andExpect(jsonPath("$.logoUrl").doesNotExist());

        SellerStoreImage stored = storeImageRepository.findById(id).orElseThrow();
        assertThat(stored.getStatus()).isEqualTo(StoreImageStatus.STORED);
        // The bucket's number, not the 8192 the client declared at presign time.
        assertThat(stored.getSizeBytes()).isEqualTo(4242L);

        mockMvc.perform(get(STORE).cookie(session))
                .andExpect(jsonPath("$.coverUrl").value(org.hamcrest.Matchers.endsWith(key)));
    }

    /**
     * The check the contract's duplicated `slot` exists for: reserving a cover
     * and confirming it as a logo would put a 1600x400 banner in an 88px circle.
     */
    @Test
    void confirmingTheWrongSlotIs422NamingTheSlot() throws Exception {
        Cookie session = cookieFor(seller("slot-mismatch@example.com"));
        UUID id = reserve(session, "COVER", 1024);

        mockMvc.perform(post(CONFIRM).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\":\"" + id + "\",\"slot\":\"LOGO\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.type").value("https://api/errors/validation-error"))
                .andExpect(jsonPath("$.errors[0].field").value("slot"))
                .andExpect(jsonPath("$.errors[0].reason").value("does not match the reserved slot"));

        // Nothing was headed, nothing was promoted.
        verify(s3Client, never()).headObject(any(HeadObjectRequest.class));
        assertThat(storeImageRepository.findById(id).orElseThrow().getStatus())
                .isEqualTo(StoreImageStatus.PENDING);
    }

    /**
     * The failure the HeadObject step exists to catch. A STORED row with no
     * object behind it is a permanent broken image at the top of the storefront,
     * so the row stays PENDING and the profile keeps whatever it had.
     */
    @Test
    void confirmIsRefusedWhenNothingWasEverUploaded() throws Exception {
        Cookie session = cookieFor(seller("never-uploaded@example.com"));
        UUID id = reserve(session, "LOGO", 1024);
        when(s3Client.headObject(any(HeadObjectRequest.class)))
                .thenThrow(NoSuchKeyException.builder().message("not found").build());

        mockMvc.perform(post(CONFIRM).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\":\"" + id + "\",\"slot\":\"LOGO\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("https://api/errors/upload-not-found"));

        assertThat(storeImageRepository.findById(id).orElseThrow().getStatus())
                .isEqualTo(StoreImageStatus.PENDING);
        mockMvc.perform(get(STORE).cookie(session))
                .andExpect(jsonPath("$.logoUrl").doesNotExist());
    }

    @Test
    void confirmingTwiceIsAConflict() throws Exception {
        Cookie session = cookieFor(seller("twice@example.com"));
        UUID id = reserve(session, "COVER", 1024);
        headReturns(1024L);

        mockMvc.perform(post(CONFIRM).cookie(session).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\":\"" + id + "\",\"slot\":\"COVER\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(post(CONFIRM).cookie(session).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\":\"" + id + "\",\"slot\":\"COVER\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("https://api/errors/already-confirmed"));
    }

    @Test
    void confirmingAnUnknownIdIsAConflictNotA500() throws Exception {
        Cookie session = cookieFor(seller("unknown-id@example.com"));

        mockMvc.perform(post(CONFIRM).cookie(session).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\":\"" + UUID.randomUUID() + "\",\"slot\":\"COVER\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("https://api/errors/upload-not-found"));
    }

    /**
     * Replacing a cover retires the one it replaces. Without this the old object
     * stays in the bucket, reachable from nothing and deletable by nothing - a
     * paid-for leak on every re-upload.
     */
    @Test
    void confirmingAReplacementDeletesTheObjectItSupersedes() throws Exception {
        Cookie session = cookieFor(seller("replaced@example.com"));
        headReturns(1024L);

        UUID firstId = reserve(session, "COVER", 1024);
        String firstKey = storeImageRepository.findById(firstId).orElseThrow().getS3Key();
        confirm(session, firstId, "COVER");

        UUID secondId = reserve(session, "COVER", 2048);
        String secondKey = storeImageRepository.findById(secondId).orElseThrow().getS3Key();
        confirm(session, secondId, "COVER");

        // After the commit, not before: object storage is outside the
        // transaction, so a rolled-back replacement must not have deleted the
        // cover that is still live.
        verify(s3Client, timeout(2000)).deleteObject(
                DeleteObjectRequest.builder().bucket("amezo-dev").key(firstKey).build());
        assertThat(storeImageRepository.findById(firstId)).isEmpty();

        mockMvc.perform(get(STORE).cookie(session))
                .andExpect(jsonPath("$.coverUrl").value(org.hamcrest.Matchers.endsWith(secondKey)));
    }

    // -------------------------------------------------------------- clearing

    /**
     * "Remove cover" sends {"coverUrl": null}. Under the old
     * null-means-unchanged rule that was a silent no-op against this API, and it
     * only looked like it worked because the MSW mock merges the patch literally.
     */
    @Test
    void patchingCoverUrlToNullClearsItAndDropsTheObject() throws Exception {
        Cookie session = cookieFor(seller("remove-cover@example.com"));
        headReturns(1024L);
        UUID id = reserve(session, "COVER", 1024);
        String key = storeImageRepository.findById(id).orElseThrow().getS3Key();
        confirm(session, id, "COVER");

        mockMvc.perform(patch(STORE).cookie(session).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"coverUrl\":null}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.coverUrl").doesNotExist());

        verify(s3Client, timeout(2000)).deleteObject(
                DeleteObjectRequest.builder().bucket("amezo-dev").key(key).build());
        assertThat(storeImageRepository.findById(id)).isEmpty();
    }

    /** An omitted coverUrl still means "leave it alone" - that rule did not change. */
    @Test
    void aPatchThatDoesNotMentionTheCoverLeavesItAlone() throws Exception {
        Cookie session = cookieFor(seller("keep-cover@example.com"));
        headReturns(1024L);
        UUID id = reserve(session, "COVER", 1024);
        String key = storeImageRepository.findById(id).orElseThrow().getS3Key();
        confirm(session, id, "COVER");

        mockMvc.perform(patch(STORE).cookie(session).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"tagline\":\"Unrelated edit\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.coverUrl").value(org.hamcrest.Matchers.endsWith(key)));

        assertThat(storeImageRepository.findById(id)).isPresent();
    }

    /**
     * The design's "Selling since" box can be emptied, and the storefront
     * preview then reads "New seller". An Integer has no blank, so null is how
     * that is said - and it used to mean "unchanged", making the year
     * unremovable once set.
     */
    @Test
    void patchingFoundedYearToNullClearsIt() throws Exception {
        Cookie session = cookieFor(seller("clear-year@example.com"));

        mockMvc.perform(patch(STORE).cookie(session).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"foundedYear\":2019}"))
                .andExpect(jsonPath("$.foundedYear").value(2019));

        mockMvc.perform(patch(STORE).cookie(session).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"foundedYear\":null}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.foundedYear").doesNotExist());

        mockMvc.perform(get(STORE).cookie(session))
                .andExpect(jsonPath("$.foundedYear").doesNotExist());
    }

    /** And a PATCH about something else still leaves the year where it was. */
    @Test
    void aPatchThatDoesNotMentionTheYearLeavesItAlone() throws Exception {
        Cookie session = cookieFor(seller("keep-year@example.com"));

        mockMvc.perform(patch(STORE).cookie(session).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"foundedYear\":1994}"))
                .andExpect(jsonPath("$.foundedYear").value(1994));

        mockMvc.perform(patch(STORE).cookie(session).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"location\":\"Leeds\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.foundedYear").value(1994));
    }

    // -------------------------------------------------------------- isolation

    /**
     * The reservation is looked up BY store id, so another seller's id is simply
     * not found - there is no ownership check to forget.
     */
    @Test
    void oneSellerCannotConfirmAnothersUpload() throws Exception {
        Cookie mine = cookieFor(seller("owner@example.com"));
        Cookie theirs = cookieFor(seller("intruder@example.com"));
        UUID id = reserve(mine, "COVER", 1024);

        mockMvc.perform(post(CONFIRM).cookie(theirs).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\":\"" + id + "\",\"slot\":\"COVER\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("https://api/errors/upload-not-found"));

        assertThat(storeImageRepository.findById(id).orElseThrow().getStatus())
                .isEqualTo(StoreImageStatus.PENDING);
    }

    /** Reserving a slot provisions the store, the same way a first read does. */
    @Test
    void reservingASlotProvisionsTheStoreForASellerWhoNeverOpenedSettings() throws Exception {
        Seller seller = seller("never-opened@example.com");
        assertThat(storeRepository.findBySellerId(seller.getId())).isEmpty();

        reserve(cookieFor(seller), "COVER", 1024);

        assertThat(storeRepository.findBySellerId(seller.getId())).isPresent();
    }

    // ------------------------------------------------------------------- auth

    @Test
    void bothImageRoutesRequireASellerSession() throws Exception {
        mockMvc.perform(post(IMAGES).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"slot":"COVER","contentType":"image/png","fileSizeBytes":1024}"""))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post(CONFIRM).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\":\"" + UUID.randomUUID() + "\",\"slot\":\"COVER\"}"))
                .andExpect(status().isUnauthorized());

        Cookie buyer = Fixtures.sessionCookie(sessionRepository, IdentityType.BUYER, UUID.randomUUID());
        mockMvc.perform(post(IMAGES).cookie(buyer).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"slot":"COVER","contentType":"image/png","fileSizeBytes":1024}"""))
                .andExpect(status().isForbidden());
    }

    // ---------------------------------------------------------------- helpers

    private Seller seller(String email) {
        return sellerRepository.save(Seller.builder().email(email).build());
    }

    private Cookie cookieFor(Seller seller) {
        return Fixtures.sessionCookie(sessionRepository, IdentityType.SELLER, seller.getId());
    }

    private void headReturns(long contentLength) {
        when(s3Client.headObject(any(HeadObjectRequest.class)))
                .thenReturn(HeadObjectResponse.builder().contentLength(contentLength).build());
    }

    private UUID reserve(Cookie session, String slot, long sizeBytes) throws Exception {
        String body = mockMvc.perform(post(IMAGES).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"slot\":\"" + slot + "\",\"contentType\":\"image/png\","
                                + "\"fileSizeBytes\":" + sizeBytes + "}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(body).get("id").asText());
    }

    private void confirm(Cookie session, UUID id, String slot) throws Exception {
        mockMvc.perform(post(CONFIRM).cookie(session).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\":\"" + id + "\",\"slot\":\"" + slot + "\"}"))
                .andExpect(status().isOk());
    }
}
