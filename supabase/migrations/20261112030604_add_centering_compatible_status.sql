-- No-op for Supabase/Postgres reference; the real backend is MySQL.
-- This migration documents the intended MySQL DDL for the SAED backend:
--
-- ALTER TABLE hkl_reflections
--   MODIFY COLUMN reflection_status
--   ENUM('Allowed','Forbidden','Centering-compatible','Requires SG verification')
--   NOT NULL;
--
-- (Executed against the production MySQL instance out-of-band.)
SELECT 1;