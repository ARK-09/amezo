-- What the seller declared when they moved an order along, kept as a log rather
-- than flattened onto orders.
--
-- PATCH /api/v1/sellers/me/orders/{id} (the contract's UpdateSellerOrder) carries
-- more than the order row has anywhere to put: parcels and packedBy when packing,
-- handoverMethod and hub when handing over, a note either time, and an occurredAt
-- for a seller recording yesterday's handover today. Two of those - parcels and
-- the packed timestamp - are facts about the order's current state and live on
-- orders (V24). The rest are facts about an EVENT, and there can be more than one:
-- an order is packed and then handed over, and each step has its own note, its own
-- actual time and its own operator.
--
-- The alternative was a column per field on orders, which would have meant
-- handover_note and packed_note as separate columns, only one packed_by however
-- many times an order is re-packed, and the seller's "dropped at the Karachi hub"
-- silently discarded because no response field asks for it. Dropping data a seller
-- typed is worse than storing it somewhere honest.
--
-- Mirrors refund_event (V22), which records the refund state machine the same way,
-- for the same reason.
CREATE TABLE order_event (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id),

    -- The status the order moved INTO. Not constrained to the same list as
    -- orders.status: this table is a history, and a status later retired from the
    -- live CHECK must not invalidate the rows that record when it happened.
    status VARCHAR(20) NOT NULL,

    -- Who did it. Nullable because a status the platform moves on its own (a
    -- future carrier webhook, a derived transition) has no seller behind it, and a
    -- FK because a seller who no longer exists cannot have packed anything.
    actor_seller_id UUID REFERENCES seller(id),

    -- When it actually happened, which the seller may backdate. Distinct from
    -- recorded_at below: "packed yesterday, told us today" is two different
    -- timestamps and reporting either one as the other would be wrong.
    occurred_at TIMESTAMPTZ NOT NULL,

    -- Shown to the buyer alongside the shipment, per UpdateSellerOrder.note.
    note TEXT,

    -- Packing. parcels is duplicated onto orders.parcels deliberately: this row is
    -- what was declared at the time, that column is the order's current answer.
    parcels INTEGER CHECK (parcels IS NULL OR parcels >= 1),
    packed_by TEXT,

    -- Handover. A CHECK on a VARCHAR rather than a Postgres ENUM, matching
    -- orders.status (V9), product.status (V17) and seller_store.status (V18): the
    -- application maps these with @Enumerated(EnumType.STRING), and a real ENUM
    -- type would need its own ALTER TYPE migration to gain a value.
    handover_method VARCHAR(16)
        CHECK (handover_method IS NULL
               OR handover_method IN ('AMEZO_PICKUP', 'HUB_DROPOFF', 'LOCKER_DROP')),
    hub TEXT,

    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every read of this table is "the events of this order, in order".
CREATE INDEX idx_order_event_order_id_occurred_at ON order_event(order_id, occurred_at);
