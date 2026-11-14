-- Reprogramacion de solicitudes: el anfitrion propone otro horario en lugar de rechazar.
ALTER TABLE public.meeting_request
    ADD COLUMN IF NOT EXISTS proposed_start_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS proposed_end_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS proposal_message TEXT,
    ADD COLUMN IF NOT EXISTS proposed_at TIMESTAMPTZ;

ALTER TABLE public.meeting_request
    DROP CONSTRAINT IF EXISTS meeting_request_status_check;

ALTER TABLE public.meeting_request
    ADD CONSTRAINT meeting_request_status_check
    CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'reschedule_proposed'));

ALTER TABLE public.meeting_request
    DROP CONSTRAINT IF EXISTS meeting_request_proposal_check;

ALTER TABLE public.meeting_request
    ADD CONSTRAINT meeting_request_proposal_check
    CHECK (
        status <> 'reschedule_proposed'
        OR (
            proposed_start_at IS NOT NULL
            AND proposed_end_at IS NOT NULL
            AND proposed_start_at < proposed_end_at
        )
    );

CREATE INDEX IF NOT EXISTS meeting_request_recipient_proposal_index
    ON public.meeting_request (recipient_user_id, status, proposed_start_at);

ALTER TABLE public.notification
    DROP CONSTRAINT IF EXISTS notification_type_check;

ALTER TABLE public.notification
    ADD CONSTRAINT notification_type_check CHECK (notification_type IN (
        'meeting_request_created',
        'meeting_request_updated',
        'meeting_request_cancelled',
        'meeting_request_accepted',
        'meeting_request_rejected',
        'meeting_request_rescheduled',
        'meeting_request_reschedule_answered'
    ));
