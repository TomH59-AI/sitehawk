-- ScipHawk Fiber Map — multi-provider fiber route store.
-- Run ONCE in the Supabase SQL editor (same project as zayo_fiber_routes).

create extension if not exists postgis;

create table if not exists fiber_provider_routes (
  id bigint generated always as identity primary key,
  provider text not null,
  route_name text,
  route_type text,
  feature_type text,
  source_name text,
  source_date date,
  confidence text default 'medium',
  verification_status text default 'unverified',
  geom geometry(Geometry, 4326) not null,
  created_at timestamptz default now()
);

create index if not exists fiber_provider_routes_geom_idx on fiber_provider_routes using gist (geom);
create index if not exists fiber_provider_routes_provider_idx on fiber_provider_routes (provider);

alter table fiber_provider_routes enable row level security;
drop policy if exists fiber_provider_routes_read on fiber_provider_routes;
create policy fiber_provider_routes_read on fiber_provider_routes for select using (true);

-- Import RPC — service-role only. replace_existing wipes the provider's prior rows.
create or replace function import_fiber_provider_routes(p_provider text, routes jsonb, replace_existing boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer := 0;
  r jsonb;
begin
  if replace_existing then
    delete from fiber_provider_routes where provider = p_provider;
  end if;
  for r in select * from jsonb_array_elements(routes) loop
    insert into fiber_provider_routes
      (provider, route_name, route_type, feature_type, source_name, source_date, confidence, verification_status, geom)
    values (
      p_provider,
      r->>'route_name',
      r->>'route_type',
      r->>'feature_type',
      r->>'source_name',
      nullif(r->>'source_date','')::date,
      coalesce(r->>'confidence','medium'),
      coalesce(r->>'verification_status','unverified'),
      st_setsrid(st_geomfromgeojson(r->'geometry'), 4326)
    );
    inserted := inserted + 1;
  end loop;
  return inserted;
end;
$$;

revoke all on function import_fiber_provider_routes(text, jsonb, boolean) from public, anon, authenticated;

-- Bbox query RPC — readable by anon/authenticated (routes are non-sensitive screening data).
create or replace function fiber_provider_routes_in_bbox(
  providers text[],
  west double precision,
  south double precision,
  east double precision,
  north double precision,
  candidate_lon double precision default null,
  candidate_lat double precision default null
)
returns table (
  provider text,
  route_name text,
  route_type text,
  feature_type text,
  source_name text,
  source_date date,
  confidence text,
  verification_status text,
  geometry jsonb,
  distance_miles double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    provider, route_name, route_type, feature_type, source_name, source_date, confidence, verification_status,
    st_asgeojson(geom)::jsonb as geometry,
    case when candidate_lon is null or candidate_lat is null then null
      else st_distance(geom::geography, st_setsrid(st_makepoint(candidate_lon, candidate_lat), 4326)::geography) / 1609.344
    end as distance_miles
  from fiber_provider_routes
  where (providers is null or provider = any(providers))
    and geom && st_makeenvelope(west, south, east, north, 4326)
  limit 5000;
$$;

grant execute on function fiber_provider_routes_in_bbox to anon, authenticated;

-- Per-provider import counts for the admin page.
create or replace function fiber_provider_route_counts()
returns table (provider text, feature_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select provider, count(*) from fiber_provider_routes group by provider order by provider;
$$;

grant execute on function fiber_provider_route_counts() to anon, authenticated;