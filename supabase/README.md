# Supabase migrations in this repo

This repo owns Inventory migrations from `20260831194244` onward (plus
`20260901051505_secure_email_logs.sql`, a narrow security fix for a
table this app's collaborator-invite flow writes to).

The Supabase project (`opdotszsldcgwjqtvgul`) is **shared** with several
sibling apps (Appointment, AIBoard, Virtual Pet, Tasks, E-learning), each
with its own migrations in its own repo. Seeing remote migration
versions with no matching local file is expected, not drift.

For any new migration in this repo:

- Do **not** run `supabase db push` — it will not match against the
  sibling repos' migration history.
- Apply the SQL directly against the linked project, then register
  only that one version in `supabase_migrations.schema_migrations`.
