ALTER TABLE public.meeting_request
    ALTER COLUMN requester_user_id DROP NOT NULL;

ALTER TABLE public.meeting_request
    ADD COLUMN guest_name VARCHAR(100),
    ADD COLUMN guest_email VARCHAR(200);

ALTER TABLE public.meeting_request
    DROP CONSTRAINT meeting_request_participants_check;

ALTER TABLE public.meeting_request
    ADD CONSTRAINT meeting_request_participants_check
    CHECK (
        requester_user_id IS NULL
        OR requester_user_id <> recipient_user_id
    );

ALTER TABLE public.meeting_request
    ADD CONSTRAINT meeting_request_requester_identity_check
    CHECK (
        (
            requester_user_id IS NOT NULL
            AND guest_name IS NULL
            AND guest_email IS NULL
        )
        OR
        (
            requester_user_id IS NULL
            AND guest_name IS NOT NULL
            AND LENGTH(BTRIM(guest_name)) BETWEEN 1 AND 100
            AND guest_email IS NOT NULL
            AND LENGTH(BTRIM(guest_email)) BETWEEN 3 AND 200
        )
    );