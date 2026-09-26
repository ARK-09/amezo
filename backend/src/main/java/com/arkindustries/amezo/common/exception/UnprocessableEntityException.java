package com.arkindustries.amezo.common.exception;

import java.net.URI;
import java.util.List;

/**
 * A 422: the request parsed and every field is individually well-formed, but
 * the values do not describe something the server can act on.
 *
 * Distinct from ConflictException (409, "this is refused because of state you
 * can't retry your way out of") and from bean-validation's 422, which
 * ApiExceptionHandler already produces for annotation failures. This is for the
 * checks that need the database to make - the image reorder's "these ids are
 * not exactly this product's images" being the first of them, which no
 * annotation on the request can see.
 *
 * Same type/title/errors triple as ConflictException, so both render the
 * identical ProblemDetail shape the frontend already parses.
 */
public class UnprocessableEntityException extends RuntimeException {

    private final URI type;
    private final String title;
    private final List<FieldError> errors;

    public UnprocessableEntityException(URI type, String title, String detail, List<FieldError> errors) {
        super(detail);
        this.type = type;
        this.title = title;
        this.errors = errors;
    }

    public URI getType() {
        return type;
    }

    public String getTitle() {
        return title;
    }

    public List<FieldError> getErrors() {
        return errors;
    }

    public record FieldError(String field, String reason) {
    }
}
