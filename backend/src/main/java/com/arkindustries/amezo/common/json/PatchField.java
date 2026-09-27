package com.arkindustries.amezo.common.json;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;

/**
 * One field of a PATCH body, carrying the distinction a plain nullable field
 * cannot: whether the client MENTIONED it.
 *
 * A PATCH DTO normally reads null as "not mentioned, leave it alone", and for
 * strings that is enough - blank can mean "clear this" because blank is a value
 * the client can send. Two kinds of field have no blank to spend:
 *
 *   - a number. `foundedYear` could be set but never removed: null already meant
 *     untouched, and an Integer has no empty string. A seller who typed the
 *     wrong founding year was stuck with it, while the Store Settings design
 *     lets the "Selling since" box be emptied and the preview then reads
 *     "New seller".
 *   - a field the contract itself declares nullable. UpdateStoreProfile marks
 *     coverUrl and logoUrl `nullable: true`, so a client following the contract
 *     clears a cover by sending null - which the old null-means-untouched rule
 *     read as "leave it", making "Remove cover" a silent no-op against the real
 *     API. It only appeared to work because the MSW mock merges the patch object
 *     literally.
 *
 * So there are three states, and this type is how a record component holds all
 * three:
 *
 *   field absent   -> the component is null              -> leave it alone
 *   field is null  -> PatchField with a null value        -> clear it
 *   field has a value -> PatchField holding that value    -> set it
 *
 * Validation annotations still work: put them on the record component and
 * Jakarta Validation walks into the wrapper's value if the constraint is
 * declared for the contained type, or use @Valid-free simple checks in the
 * service. The one thing NOT to do is treat `new PatchField<>(null)` as absent -
 * that is the whole point of the class.
 *
 * Deliberately hand-rolled rather than pulling in org.openapitools'
 * JsonNullable: it is the same twenty lines, it needs no new dependency, and the
 * absent-versus-null trick it turns on (getAbsentValue vs getNullValue) is worth
 * having written down where the next reader can see it.
 */
@JsonDeserialize(using = PatchFieldDeserializer.class)
public final class PatchField<T> {

    private final T value;

    private PatchField(T value) {
        this.value = value;
    }

    /** A mentioned field. A null argument means the client asked for it to be cleared. */
    public static <T> PatchField<T> of(T value) {
        return new PatchField<>(value);
    }

    /** The value the client sent, or null when the client sent null to clear it. */
    public T value() {
        return value;
    }

    /** True when the client explicitly sent null, i.e. asked for the field to be emptied. */
    public boolean isCleared() {
        return value == null;
    }
}
