package com.arkindustries.amezo.common.json;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.BeanProperty;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.deser.ContextualDeserializer;

import java.io.IOException;

/**
 * Reads a {@link PatchField}. Everything interesting is in the two methods that
 * are NOT deserialize():
 *
 *   getNullValue  - called when the JSON really contained `"field": null`.
 *                   Answers a PatchField holding null, i.e. "clear it".
 *   getAbsentValue - called when the property was missing from the object.
 *                   Answers null, so the record component stays null, i.e.
 *                   "leave it alone".
 *
 * Jackson's default getAbsentValue delegates to getNullValue, which is exactly
 * why a plain nullable field cannot tell the two apart. Overriding both is the
 * whole mechanism (Jackson 2.18: PropertyValueBuffer._findMissing consults
 * getAbsentValue for a creator property that never appeared, while
 * SettableBeanProperty.deserialize consults getNullValue for an explicit null).
 *
 * ContextualDeserializer is what gives us T: the raw deserializer is registered
 * against the generic class, and createContextual is called once per declared
 * property with that property's resolved type, from which the contained type is
 * read.
 */
public class PatchFieldDeserializer extends JsonDeserializer<PatchField<?>>
        implements ContextualDeserializer {

    /** Null only on the uncontextualised instance Jackson instantiates from the annotation. */
    private final JavaType contentType;

    public PatchFieldDeserializer() {
        this(null);
    }

    private PatchFieldDeserializer(JavaType contentType) {
        this.contentType = contentType;
    }

    @Override
    public JsonDeserializer<?> createContextual(DeserializationContext ctxt, BeanProperty property) {
        JavaType wrapper = property != null ? property.getType() : ctxt.getContextualType();
        JavaType content = wrapper != null && wrapper.containedTypeCount() == 1
                ? wrapper.containedType(0)
                // A raw PatchField with no type argument. Reading it as a tree
                // node rather than failing keeps the failure at the DTO that
                // forgot its type parameter, not at request time.
                : ctxt.constructType(Object.class);
        return new PatchFieldDeserializer(content);
    }

    @Override
    public PatchField<?> deserialize(JsonParser parser, DeserializationContext ctxt) throws IOException {
        return PatchField.of(ctxt.readValue(parser, contentType));
    }

    /** `"field": null` - the client asked for this field to be emptied. */
    @Override
    public PatchField<?> getNullValue(DeserializationContext ctxt) {
        return PatchField.of(null);
    }

    /** The property was not in the body at all - the component stays null. */
    @Override
    public Object getAbsentValue(DeserializationContext ctxt) {
        return null;
    }
}
