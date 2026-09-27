-- The refund's history, as an append-only log.
--
-- A separate table rather than the six timestamps already on refund_request,
-- and the contract says why (RefundEvent): "The timeline is a read of these,
-- not a reconstruction from scattered timestamps, which is the only way a note
-- can be attached to the step it was written for."
--
-- Both designs make that concrete. The seller's decision panel writes an
-- optional "Message to the buyer" on the SAME action that approves, declines or
-- sends a replacement, and the History timeline beside it prints that message
-- against that step. Timestamps alone cannot hold it: a single note column on
-- refund_request would be overwritten by the next transition, and there is no
-- way to tell which step a surviving note belonged to.
--
-- It is also the only honest record of a step taken twice. "Undo approval" walks
-- an approval back to REQUESTED, so a request can genuinely be approved, undone
-- and approved again with a different amount - approved_at can hold one of those
-- and the log holds all three.
CREATE TABLE refund_event (
    id UUID PRIMARY KEY,
    refund_request_id UUID NOT NULL REFERENCES refund_request(id) ON DELETE CASCADE,

    -- The status the request MOVED TO. Same CHECK as refund_request.status, for
    -- the same reason it is a CHECK there and not a Postgres ENUM.
    status VARCHAR(20) NOT NULL
        CHECK (status IN ('REQUESTED', 'APPROVED', 'AWAITING_RETURN', 'RETURN_RECEIVED',
                          'REFUNDED', 'REPLACEMENT_SENT', 'DECLINED', 'CANCELLED')),

    -- Free text the seller (or the buyer, on the first event) wrote alongside
    -- the transition. Shown to the buyer, so nullable rather than defaulted to
    -- an empty string the UI would render as a blank line.
    note TEXT,

    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Position within THIS request's history, 0 for the buyer raising it. Not
    -- redundant with occurred_at: two events can share a timestamp (an approval
    -- and the replacement going out, written in one request), and ordering by a
    -- random UUID as the tiebreak would print them in either order. Assigned as
    -- max + 1 inside the transition that appends, which refund_request.version
    -- serialises - so the UNIQUE below is a real guarantee, not a hope.
    sequence_no INTEGER NOT NULL CHECK (sequence_no >= 0),
    CONSTRAINT refund_event_sequence_unique_per_request
        UNIQUE (refund_request_id, sequence_no)
);

-- The only read: one request's whole history, oldest first. The UNIQUE
-- constraint above already indexes (refund_request_id, sequence_no) in exactly
-- that order, so no second index is created here - the timeline is served from
-- the constraint's own index.
