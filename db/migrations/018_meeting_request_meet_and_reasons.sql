ALTER TABLE public.calendar_event
    ADD COLUMN IF NOT EXISTS meet_url TEXT;

ALTER TABLE public.meeting_request
    ADD COLUMN IF NOT EXISTS meet_url TEXT,
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
    ADD COLUMN IF NOT EXISTS requester_calendar_event_id UUID
        REFERENCES public.calendar_event (id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS meeting_request_requester_calendar_event_index
    ON public.meeting_request (requester_calendar_event_id);
