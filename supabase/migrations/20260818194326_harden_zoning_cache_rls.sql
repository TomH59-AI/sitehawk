-- Harden SiteHawk's shared Supabase zoning caches.
-- These tables are shared reference caches, not user-owned records. User-owned
-- SiteHawk data remains in Base44 entities with created_by ownership rules.

DROP POLICY IF EXISTS "zoning_cache_read" ON public.zoning_cache;
DROP POLICY IF EXISTS "zoning_cache_write" ON public.zoning_cache;
CREATE POLICY "zoning_cache_read"
  ON public.zoning_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "district_cache_read" ON public.district_cache;
DROP POLICY IF EXISTS "district_cache_write" ON public.district_cache;
CREATE POLICY "district_cache_read"
  ON public.district_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "uses_cache_read" ON public.uses_cache;
DROP POLICY IF EXISTS "uses_cache_write" ON public.uses_cache;
CREATE POLICY "uses_cache_read"
  ON public.uses_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- RLS is already enabled by the original migration. Explicit grants make the
-- Data API exposure intentional; writes remain service-role-only. The service
-- role bypasses RLS and does not need a permissive client policy.
GRANT SELECT ON public.zoning_cache, public.district_cache, public.uses_cache
  TO anon, authenticated;
GRANT ALL ON public.zoning_cache, public.district_cache, public.uses_cache
  TO service_role;

-- The maintenance function is SECURITY DEFINER by design, so it must not remain
-- callable through the exposed public schema by browser roles.
REVOKE ALL ON FUNCTION public.purge_expired_zoning_cache() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_zoning_cache() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_zoning_cache() TO service_role;
