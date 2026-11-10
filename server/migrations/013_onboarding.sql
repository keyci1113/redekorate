-- First-run wizard. Null = the person has not finished (or skipped) it yet.
alter table users add column if not exists onboarded_at timestamptz;
-- Everyone who already has an account never sees the wizard.
update users set onboarded_at = created_at where onboarded_at is null;
