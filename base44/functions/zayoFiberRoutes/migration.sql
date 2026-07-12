create extension if not exists postgis;

create table if not exists public.zayo_fiber_routes (
  id uuid primary key default gen_random_uuid(),
  route_name text,
  route_type text,
  feature_type text not null,
  source_name text not null default 'Zayo KMZ import',
  source_date text,
  confidence text not null default 'medium',
  verification_status text not null default 'unverified',
  geom geometry(Geometry, 4326) not null,
  constraint zayo_fiber_routes_geometry_type check (geometrytype(geom) in ('POINT', 'LINESTRING', 'MULTILINESTRING')),
  constraint zayo_fiber_routes_confidence check (confidence in ('high', 'medium', 'low'))
);

alter table public.zayo_fiber_routes add column if not exists feature_type text;
alter table public.zayo_fiber_routes add column if not exists source_name text default 'Zayo KMZ import';
alter table public.zayo_fiber_routes add column if not exists source_date text;
alter table public.zayo_fiber_routes add column if not exists confidence text default 'medium';
alter table public.zayo_fiber_routes add column if not exists verification_status text default 'unverified';
alter table public.zayo_fiber_routes alter column geom type geometry(Geometry, 4326) using geom::geometry(Geometry, 4326);

create index if not exists zayo_fiber_routes_geom_gix
  on public.zayo_fiber_routes
  using gist (geom);

alter table public.zayo_fiber_routes enable row level security;

create or replace function public.import_zayo_fiber_routes(routes jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  inserted_count integer;
begin
  with parsed as (
    select
      nullif(item->>'route_name', '') as route_name,
      nullif(item->>'route_type', '') as route_type,
      item->>'feature_type' as feature_type,
      coalesce(nullif(item->>'source_name', ''), 'Zayo KMZ import') as source_name,
      nullif(item->>'source_date', '') as source_date,
      coalesce(nullif(item->>'confidence', ''), 'medium') as confidence,
      coalesce(nullif(item->>'verification_status', ''), 'unverified') as verification_status,
      st_setsrid(st_geomfromgeojson(item->'geometry'), 4326) as parsed_geom
    from jsonb_array_elements(routes) as item
  )
  insert into public.zayo_fiber_routes (
    route_name, route_type, feature_type, source_name, source_date,
    confidence, verification_status, geom
  )
  select
    route_name, route_type, feature_type, source_name, source_date,
    confidence, verification_status, parsed_geom
  from parsed
  where geometrytype(parsed_geom) in ('POINT', 'LINESTRING', 'MULTILINESTRING')
    and st_isvalid(parsed_geom)
    and not st_isempty(parsed_geom);

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

drop function if exists public.zayo_fiber_routes_in_bbox(double precision, double precision, double precision, double precision, double precision, double precision);

create function public.zayo_fiber_routes_in_bbox(
  west double precision,
  south double precision,
  east double precision,
  north double precision,
  candidate_lon double precision default null,
  candidate_lat double precision default null
)
returns table (
  id uuid,
  route_name text,
  route_type text,
  feature_type text,
  source_name text,
  source_date text,
  confidence text,
  verification_status text,
  geometry jsonb,
  distance_miles double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select st_makeenvelope(west, south, east, north, 4326) as box
  ), candidate as (
    select case
      when candidate_lon is null or candidate_lat is null then null
      else st_setsrid(st_makepoint(candidate_lon, candidate_lat), 4326)
    end as point
  )
  select
    features.id,
    features.route_name,
    features.route_type,
    features.feature_type,
    features.source_name,
    features.source_date,
    features.confidence,
    features.verification_status,
    st_asgeojson(st_intersection(features.geom, bounds.box), 6)::jsonb as geometry,
    case when candidate.point is null then null
      else st_distance(features.geom::geography, candidate.point::geography) / 1609.344
    end as distance_miles
  from public.zayo_fiber_routes features
  cross join bounds
  cross join candidate
  where features.geom && bounds.box
    and st_intersects(features.geom, bounds.box);
$$;

revoke all on public.zayo_fiber_routes from anon, authenticated;
revoke all on function public.import_zayo_fiber_routes(jsonb) from public, anon, authenticated;
revoke all on function public.zayo_fiber_routes_in_bbox(double precision, double precision, double precision, double precision, double precision, double precision) from public;
grant select on public.zayo_fiber_routes to anon, authenticated, service_role;
grant insert on public.zayo_fiber_routes to service_role;
grant execute on function public.import_zayo_fiber_routes(jsonb) to service_role;
grant execute on function public.zayo_fiber_routes_in_bbox(double precision, double precision, double precision, double precision, double precision, double precision) to anon, authenticated, service_role;