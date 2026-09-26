package com.arkindustries.amezo.common.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.net.URI;
import java.util.List;
import java.util.Map;

/**
 * One error shape, everywhere: Spring Boot's native ProblemDetail (RFC
 * 7807), not a hand-rolled envelope - see docs/api-design.md's error model
 * section. Every 4xx from this API is produced here, not scattered across
 * individual controllers.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(NotFoundException.class)
    public ProblemDetail handleNotFound(NotFoundException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
        problem.setTitle("Not found");
        problem.setType(URI.create("https://api/errors/not-found"));
        return problem;
    }

    @ExceptionHandler(InvalidTokenException.class)
    public ProblemDetail handleInvalidToken(InvalidTokenException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, ex.getMessage());
        problem.setTitle("Invalid or expired token");
        problem.setType(URI.create("https://api/errors/invalid-token"));
        return problem;
    }

    @ExceptionHandler(ConflictException.class)
    public ProblemDetail handleConflict(ConflictException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, ex.getMessage());
        problem.setTitle(ex.getTitle());
        problem.setType(ex.getType());
        if (ex.getErrors() != null && !ex.getErrors().isEmpty()) {
            problem.setProperty("errors", ex.getErrors());
        }
        return problem;
    }

    @ExceptionHandler(UnprocessableEntityException.class)
    public ProblemDetail handleUnprocessableEntity(UnprocessableEntityException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_ENTITY, ex.getMessage());
        problem.setTitle(ex.getTitle());
        problem.setType(ex.getType());
        if (ex.getErrors() != null && !ex.getErrors().isEmpty()) {
            problem.setProperty("errors", ex.getErrors());
        }
        return problem;
    }

    @ExceptionHandler(PayloadTooLargeException.class)
    public ProblemDetail handlePayloadTooLarge(PayloadTooLargeException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.PAYLOAD_TOO_LARGE, ex.getMessage());
        problem.setTitle("File too large");
        problem.setType(URI.create("https://api/errors/file-too-large"));
        return problem;
    }

    @ExceptionHandler(StorageCapReachedException.class)
    public ProblemDetail handleStorageCapReached(StorageCapReachedException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.INSUFFICIENT_STORAGE, ex.getMessage());
        problem.setTitle("Storage cap reached");
        problem.setType(URI.create("https://api/errors/storage-cap-reached"));
        return problem;
    }

    @ExceptionHandler(StorageUnavailableException.class)
    public ProblemDetail handleStorageUnavailable(StorageUnavailableException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, ex.getMessage());
        problem.setTitle("Image storage unavailable");
        problem.setType(URI.create("https://api/errors/storage-unavailable"));
        return problem;
    }

    @ExceptionHandler(EmailDeliveryException.class)
    public ProblemDetail handleEmailDelivery(EmailDeliveryException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_GATEWAY, ex.getMessage());
        problem.setTitle("Email delivery failed");
        problem.setType(URI.create("https://api/errors/email-delivery-failed"));
        return problem;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.UNPROCESSABLE_ENTITY);
        problem.setTitle("Validation failed");
        problem.setType(URI.create("https://api/errors/validation-error"));
        // getFieldErrors() alone silently drops class-level constraints (a
        // cross-field @Constraint on the whole request type produces a
        // global ObjectError, not a FieldError) - getAllErrors() covers both.
        List<Map<String, String>> errors = ex.getBindingResult().getAllErrors().stream()
                .map(err -> Map.of(
                        "field", err instanceof FieldError fe ? fe.getField() : "request",
                        "reason", err.getDefaultMessage() != null ? err.getDefaultMessage() : "invalid"))
                .toList();
        problem.setProperty("errors", errors);
        return problem;
    }
}
