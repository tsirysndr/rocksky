-- Rocksky -> provider mirroring, the opposite direction to `enabled`.
--
-- Nullable with no default: NULL means the user never chose, and the API
-- reports that as enabled. That keeps every existing row pushing exactly as it
-- did before this column existed, with no backfill.
ALTER TABLE "mirror_sources" ADD COLUMN IF NOT EXISTS "push_enabled" boolean;
