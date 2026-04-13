-- Keep persisted schedule entry statuses aligned with the unit's derived status.
-- This cleans up stale rows such as installation tasks still marked not_started
-- after the unit has already reached installed.

UPDATE public.schedule_entries AS se
SET status = u.status
FROM public.units AS u
WHERE u.id = se.unit_id
  AND se.status IS DISTINCT FROM u.status;
