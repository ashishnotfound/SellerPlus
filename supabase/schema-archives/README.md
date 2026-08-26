# Supabase schema archives

The files in this directory are historical full-schema snapshots retained for
reference and recovery. They are **not** incremental migrations and must not
be applied by `supabase db push`, `supabase db reset`, or the direct migration
script.

The authoritative deployment path is the timestamped SQL chain in
`supabase/migrations/`. Apply that chain in filename order so Supabase can
record each migration in `supabase_migrations.schema_migrations` and safely
resume after a partial deployment.

If an archived snapshot is needed to recover an old environment, copy it to a
separate throwaway database workflow and review it as a baseline first. Do not
run a snapshot against a live production database.
