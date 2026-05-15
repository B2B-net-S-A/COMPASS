-- PR2 — Graph Calendar API write.
--
-- Store the Microsoft Graph event id so we can later delete the event
-- from the consultant's Outlook when the leave is rejected or cancelled.
-- Nullable: legacy rows + rows where Calendar push failed (or credentials
-- missing) stay clean; main approve flow does not depend on this column.

ALTER TABLE leave_requests
    ADD COLUMN IF NOT EXISTS outlook_event_id TEXT;

COMMENT ON COLUMN leave_requests.outlook_event_id IS
    'Microsoft Graph event id zapisany do kalendarza Outlook konsultanta przy approve. NULL gdy Calendar push pominięty lub padł.';
