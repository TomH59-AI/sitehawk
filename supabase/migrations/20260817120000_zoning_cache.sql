-- ─────────────────────────────────────────────────────────────────────────────
-- SiteHawk Zoning Engine — Supabase Migration
-- Created: 2026-08-17
-- Run via:  supabase db push
--       or: paste into Supabase SQL editor
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable pg_trgm for fuzzy text search on jurisdiction names (optional but useful)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 1. zoning_cache ───────────────────────────────────────────────────────────
-- Stores parcel/address → zoning district lookups.
-- TTL-based expiry (default 30 days, set via ZONING_CACHE_TTL_DAYS env var).

CREATE TABLE IF NOT EXISTS public.zoning_cache (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key      TEXT        NOT NULL,           -- deterministic key (addr: / parcel: / ll:)
  address        TEXT,                           -- original address string
  parcel_id      TEXT,                           -- county parcel / APN
  lat            DOUBLE PRECISION,
  lng            DOUBLE PRECISION,
  district_code  TEXT        NOT NULL,           -- e.g. "R-1", "C-2"
  district_name  TEXT,                           -- e.g. "Single-Family Residential"
  jurisdiction   TEXT,                           -- place/municipality name
  fips_state     CHAR(2),                        -- Census FIPS state code
  fips_county    CHAR(3),                        -- Census FIPS county code
  fips_place     CHAR(5),                        -- Census FIPS place code
  geometry       JSONB,                          -- ArcGIS geometry object (optional)
  source         TEXT,                           -- "arcgis:<url>" | "municode:<id>" etc.
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()       NOT NULL,
  updated_at     TIMESTAMPTZ DEFAULT NOW()       NOT NULL,

  CONSTRAINT zoning_cache_cache_key_uq UNIQUE (cache_key)
);

-- RLS: only the service role can write; anon/authenticated can read cached results
ALTER TABLE public.zoning_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zoning_cache_read"  ON public.zoning_cache
  FOR SELECT USING (true);

CREATE POLICY "zoning_cache_write" ON public.zoning_cache
  FOR ALL USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_zoning_cache_key
  ON public.zoning_cache (cache_key);

CREATE INDEX IF NOT EXISTS idx_zoning_cache_parcel
  ON public.zoning_cache (parcel_id)
  WHERE parcel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_zoning_cache_expires
  ON public.zoning_cache (expires_at);

CREATE INDEX IF NOT EXISTS idx_zoning_cache_district
  ON public.zoning_cache (district_code, jurisdiction);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER zoning_cache_updated_at
  BEFORE UPDATE ON public.zoning_cache
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 2. district_cache ─────────────────────────────────────────────────────────
-- Stores full ordinance details per district + jurisdiction.
-- TTL default 90 days (set via DISTRICT_CACHE_TTL_DAYS env var).

CREATE TABLE IF NOT EXISTS public.district_cache (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  district_code  TEXT        NOT NULL,
  jurisdiction   TEXT        NOT NULL,
  name           TEXT,                           -- human-readable district name
  description    TEXT,                           -- purpose/intent paragraph
  setbacks       JSONB,                          -- { front, rear, side } in feet
  max_height     DOUBLE PRECISION,               -- feet
  max_far        DOUBLE PRECISION,               -- floor area ratio
  min_lot_size   DOUBLE PRECISION,               -- sq ft
  ordinance_url  TEXT,                           -- permalink to Municode/AmLegal section
  raw_ordinance  TEXT,                           -- full HTML for re-parsing
  source         TEXT,
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()       NOT NULL,

  CONSTRAINT district_cache_code_juris_uq UNIQUE (district_code, jurisdiction)
);

ALTER TABLE public.district_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "district_cache_read"  ON public.district_cache FOR SELECT USING (true);
CREATE POLICY "district_cache_write" ON public.district_cache FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_district_cache_code_juris
  ON public.district_cache (district_code, jurisdiction);

CREATE INDEX IF NOT EXISTS idx_district_cache_expires
  ON public.district_cache (expires_at);

-- ── 3. uses_cache ─────────────────────────────────────────────────────────────
-- Stores permitted / conditional / prohibited use arrays per district.

CREATE TABLE IF NOT EXISTS public.uses_cache (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  district_code  TEXT        NOT NULL,
  jurisdiction   TEXT        NOT NULL,
  permitted      TEXT[]      DEFAULT '{}',
  conditional    TEXT[]      DEFAULT '{}',
  prohibited     TEXT[]      DEFAULT '{}',
  source         TEXT,
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()       NOT NULL,

  CONSTRAINT uses_cache_code_juris_uq UNIQUE (district_code, jurisdiction)
);

ALTER TABLE public.uses_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uses_cache_read"  ON public.uses_cache FOR SELECT USING (true);
CREATE POLICY "uses_cache_write" ON public.uses_cache FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_uses_cache_code_juris
  ON public.uses_cache (district_code, jurisdiction);

-- ── 4. Maintenance: purge expired rows ───────────────────────────────────────
-- Optional: call this from a Supabase cron job (pg_cron extension) or
-- a weekly Supabase Edge Function to keep tables tidy.
--
-- Example pg_cron schedule (enable pg_cron extension first):
--   SELECT cron.schedule('purge-zoning-cache', '0 3 * * 0',
--     $$DELETE FROM public.zoning_cache  WHERE expires_at < NOW();
--       DELETE FROM public.district_cache WHERE expires_at < NOW();
--       DELETE FROM public.uses_cache     WHERE expires_at < NOW();$$);

CREATE OR REPLACE FUNCTION public.purge_expired_zoning_cache()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.zoning_cache   WHERE expires_at < NOW();
  DELETE FROM public.district_cache WHERE expires_at < NOW();
  DELETE FROM public.uses_cache     WHERE expires_at < NOW();
END;
$$;

COMMENT ON FUNCTION public.purge_expired_zoning_cache IS
  'Removes expired rows from all three zoning cache tables. '
  'Wire to a pg_cron job or Supabase Edge Function for weekly cleanup.';


