-- Origin keys are server-keyed one-way hashes, stored in the existing rate-limit log
-- rather than as addresses. Keep the database constraint explicit as each new
-- event kind is an admission-control surface.
alter table public.submission_log drop constraint if exists submission_log_kind_check;
alter table public.submission_log add constraint submission_log_kind_check
  check (kind in ('ticket', 'ticket-ip', 'submit', 'submit-ip', 'claim', 'claim-ip', 'report'));
