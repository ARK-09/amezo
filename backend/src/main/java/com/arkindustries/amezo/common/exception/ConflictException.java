package com.arkindustries.amezo.common.exception;

import java.net.URI;
import java.util.List;

/**
 * The one exception type behind every 409 in docs/api-design.md
 * (out-of-stock, price-changed, upload-not-found, ...). type/title carry
 * the machine-readable code and human title from the shared ProblemDetail
 * shape; errors is the optional itemized field list.
 */
public class ConflictException extends RuntimeException {

    private final URI type;
    private final String title;
    private final List<FieldError> errors;

    public ConflictException(URI type, String title, String detail, List<FieldError> errors) {
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
