-- The refund domain, which did not exist in any form: no table, no column, no
-- enum value anywhere in the schema mentioned a refund, while the contract
-- (frontend/openapi/fixture.yaml: RefundRequest*, RefundStatus, RefundEvent),
-- two full designs (Seller Refunds, Refund Request) and a block on the buyer's
-- My Orders were all written against it. Every one of those endpoints answered
-- 403 from anyRequest().denyAll().
--
-- Two tables here, the event log in V22.
--
-- IMPORTANT, and the reason several columns below are NOT what you would expect
-- of a refund: THERE IS NO PAYMENT SYSTEM IN THIS CODEBASE. No payment table,
-- no gateway, no ledger, no captured method - checkout takes no money (see
-- PaymentSummary's own note in the contract). A refund request here therefore
-- records a DECISION and an AMOUNT and the moment each was taken. It does not
-- move money, and nothing in this migration pretends otherwise: there is no
-- transaction id, no provider reference and no settlement state, because there
-- is nothing to hold in them. refunded_at means "the seller released this",
-- not "a provider paid it".
CREATE TABLE refund_request (
    id UUID PRIMARY KEY,

    -- The short human key the designs print ("ref_4d90b12c"), stable and
    -- unique. Stored rather than derived on read so it survives being quoted
    -- in an email or a support ticket even if the derivation ever changes.
    reference VARCHAR(32) NOT NULL UNIQUE,

    -- A real foreign key, unlike order_line's snapshot columns: a refund is
    -- about one specific live order, and an order that no longer exists has no
    -- refund to decide.
    order_id UUID NOT NULL REFERENCES orders(id),

    -- Who raised it and who owes it. buyer_identity_id is copied from the order
    -- so the authorization check ("is this the caller's own order?") is one
    -- column read rather than a join, and seller_id is copied from the order
    -- lines' seller_id_snapshot for the same reason on the seller's side. Both
    -- are real FKs - both rows outlive the order.
    buyer_identity_id UUID NOT NULL REFERENCES buyer_identity(id),
    seller_id UUID NOT NULL REFERENCES seller(id),

    -- A CHECK on a VARCHAR rather than a Postgres ENUM, matching orders.status
    -- (V9), product.status (V17) and seller_store.status (V18): the application
    -- maps these with @Enumerated(EnumType.STRING), and a real ENUM type would
    -- need its own ALTER TYPE migration to gain a value.
    --
    -- All eight values of the contract's RefundStatus, including the two the
    -- current UI never sends (APPROVED without a return, CANCELLED): the column
    -- is the contract's enum, not the subset one screen happens to use.
    status VARCHAR(20) NOT NULL
        CHECK (status IN ('REQUESTED', 'APPROVED', 'AWAITING_RETURN', 'RETURN_RECEIVED',
                          'REFUNDED', 'REPLACEMENT_SENT', 'DECLINED', 'CANCELLED')),

    -- What is being asked for, and what the seller settled on - the same column,
    -- because the seller may settle a replacement request with money or the
    -- reverse (see UpdateRefundRequest.resolution). requested_resolution keeps
    -- the buyer's original ask, so "wants Replacement, settled with a refund" is
    -- still readable afterwards instead of being overwritten.
    requested_resolution VARCHAR(12) NOT NULL
        CHECK (requested_resolution IN ('REFUND', 'REPLACEMENT')),
    resolution VARCHAR(12) NOT NULL
        CHECK (resolution IN ('REFUND', 'REPLACEMENT')),

    -- Where the buyer asked the money to go. NULL for a replacement request,
    -- which moves no money - and the CHECK below is what makes that rule the
    -- database's rather than a convention in one service method.
    payout VARCHAR(20)
        CHECK (payout IS NULL OR payout IN ('ORIGINAL_PAYMENT', 'ALTERNATE_METHOD')),
    CONSTRAINT refund_request_payout_required_for_refund
        CHECK (requested_resolution <> 'REFUND' OR payout IS NOT NULL),

    -- The buyer's account of what went wrong. The 20-character floor is the
    -- contract's (CreateRefundRequest.detail minLength) and is stated here as
    -- well as in the request DTO because the column is what a manual INSERT or a
    -- second writer would have to get past; the DTO only guards the HTTP door.
    detail TEXT NOT NULL CHECK (length(btrim(detail)) >= 20),

    -- The sum of the requested lines at their purchase-time unit prices, fixed
    -- when the request is raised. Stored rather than recomputed because a
    -- refund's value must not move if anything about the catalogue does.
    --
    -- precision/scale match order_line.unit_price_snapshot exactly (10,2): an
    -- amount derived from those must be representable in the same type.
    requested_amount NUMERIC(10, 2) NOT NULL CHECK (requested_amount > 0),

    -- What the seller approved, NULL until they decide. A PARTIAL refund is
    -- legitimate and this is the column that carries it; an OVER-refund is not,
    -- which is what the CHECK enforces. The service refuses it first with a 422
    -- naming the field - this is the backstop, not the error message.
    approved_amount NUMERIC(10, 2)
        CHECK (approved_amount IS NULL
               OR (approved_amount > 0 AND approved_amount <= requested_amount)),

    -- Denormalised from the order's lines. There is no multi-currency support
    -- anywhere in this codebase and no currency column to read one from, so this
    -- is written as the single currency the rest of the app assumes rather than
    -- left for a later migration to backfill from nothing.
    --
    -- VARCHAR(3), not CHAR(3): Postgres reports CHAR as bpchar, and Hibernate's
    -- schema validation (ddl-auto: validate) rejects it against a String field as
    -- "found [bpchar], but expecting [varchar(3)]". Caught by running the
    -- integration tests rather than by reasoning about them.
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',

    -- Required on DECLINED and meaningless otherwise; again a CHECK so the rule
    -- is not only in the service.
    decline_reason TEXT,
    CONSTRAINT refund_request_decline_reason_required
        CHECK (status <> 'DECLINED' OR decline_reason IS NOT NULL),

    -- The reference the buyer quotes when posting the item back. NULL unless the
    -- seller supplies one, and deliberately NEVER minted by this application:
    -- there is no carrier integration, and a plausible-looking label number the
    -- platform invented would tell the buyer a prepaid label exists when none
    -- does. The design prints a label id; the UI omits the sentence when this is
    -- null rather than showing an invented one.
    return_tracking_number VARCHAR(64),

    -- One timestamp per step, for the summary rows that print "refunded on X"
    -- without reading the event log. The log in V22 is the ordered history and
    -- the only place a note can be attached to the step it was written for;
    -- these are the indexed, queryable form of the same facts.
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at TIMESTAMPTZ,
    declined_at TIMESTAMPTZ,
    return_received_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    replacement_sent_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,

    -- Optimistic locking (@Version on RefundRequest). Not decoration: the state
    -- machine reads the current status, decides whether a transition is legal,
    -- and writes the next one. Two sellers in two tabs pressing Approve and
    -- Decline at once would both pass that check against the same REQUESTED row
    -- and the second write would silently win. With this column the second
    -- transaction fails and the service turns it into a 409, which is the same
    -- answer an illegal transition gets.
    version BIGINT NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The seller queue's only query shape: my requests, newest first, optionally
-- narrowed to one status. seller_id leads because it is the equality predicate
-- every read carries.
CREATE INDEX idx_refund_request_seller_requested_at
    ON refund_request (seller_id, requested_at DESC);

-- The buyer's own list, same shape.
CREATE INDEX idx_refund_request_buyer_requested_at
    ON refund_request (buyer_identity_id, requested_at DESC);

-- "What refunds does this order have?" - asked once per order row on the
-- buyer's order list and once per order on the seller's, which is where an
-- order's derived REFUNDED status and its openRefundStatus badge come from.
CREATE INDEX idx_refund_request_order ON refund_request (order_id);

-- Which lines of the order the request covers, and how many of each: the buyer
-- picks items on the form, so a request is not necessarily the whole order.
CREATE TABLE refund_request_line (
    id UUID PRIMARY KEY,
    refund_request_id UUID NOT NULL REFERENCES refund_request(id) ON DELETE CASCADE,
    order_line_id UUID NOT NULL REFERENCES order_line(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),

    -- Denormalised from the parent's status: TRUE while the request is still
    -- live, FALSE once it has settled one way or another. It exists only to
    -- make the partial unique index below possible - a partial index's
    -- predicate can only read columns of the table it is on, so "no two OPEN
    -- requests may cover the same line" cannot be expressed against
    -- refund_request.status from here.
    --
    -- Maintained by the application, in the one method that writes a status
    -- transition (RefundRequestService#transition), not by a trigger: the same
    -- choice and the same reasoning as product.updated_at in V17 and
    -- seller_store.updated_at in V18 - the value a write returns should be the
    -- value that was stored.
    is_open BOOLEAN NOT NULL DEFAULT TRUE,

    -- The purchase-time price and the line total, copied at request time for the
    -- same reason order_line copies them from the offer: what is owed must not
    -- move when the catalogue does.
    unit_price_snapshot NUMERIC(10, 2) NOT NULL CHECK (unit_price_snapshot >= 0),
    line_total NUMERIC(10, 2) NOT NULL CHECK (line_total >= 0),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One entry per line per request. A buyer asking for two of the same line
    -- says quantity 2, not two rows.
    CONSTRAINT refund_request_line_unique_per_request UNIQUE (refund_request_id, order_line_id)
);

-- The duplicate-request rule, as a constraint rather than a read-then-write
-- check: one line may sit inside at most one OPEN request at a time. Without
-- this, two buyer tabs pressing Send request together both see "no open
-- request" and both insert, and the 409 the contract promises is a race the
-- second caller wins half the time.
--
-- A settled request keeps its lines with is_open FALSE, so the history of a
-- declined request is still readable and a fresh request against the same line
-- is still allowed.
CREATE UNIQUE INDEX uq_refund_request_line_open_per_order_line
    ON refund_request_line (order_line_id) WHERE is_open;

-- The join every detail read makes.
CREATE INDEX idx_refund_request_line_request ON refund_request_line (refund_request_id);
