create extension if not exists postgis;

create table if not exists public.zayo_fiber_routes (
  id uuid primary key default gen_random_uuid(),
  route_name text,
  route_type text,
  geom geometry(MultiLineString, 4326) not null
);

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
      coalesce(nullif(item->>'route_type', ''), 'Unclassified') as route_type,
      st_setsrid(st_geomfromgeojson(item->'geometry'), 4326) as parsed_geom
    from jsonb_array_elements(routes) as item
  )
  insert into public.zayo_fiber_routes (route_name, route_type, geom)
  select route_name, route_type, st_multi(parsed_geom)
  from parsed
  where geometrytype(parsed_geom) in ('LINESTRING', 'MULTILINESTRING')
    and st_isvalid(parsed_geom)
    and not st_isempty(parsed_geom);

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.zayo_fiber_routes_in_bbox(
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
    routes.id,
    routes.route_name,
    routes.route_type,
    st_asgeojson(st_intersection(routes.geom, bounds.box), 6)::jsonb as geometry,
    case when candidate.point is null then null
      else st_distance(routes.geom::geography, candidate.point::geography) / 1609.344
    end as distance_miles
  from public.zayo_fiber_routes routes
  cross join bounds
  cross join candidate
  where routes.geom && bounds.box
    and st_intersects(routes.geom, bounds.box);
$$;

revoke all on public.zayo_fiber_routes from anon, authenticated;
revoke all on function public.import_zayo_fiber_routes(jsonb) from public, anon, authenticated;
revoke all on function public.zayo_fiber_routes_in_bbox(double precision, double precision, double precision, double precision, double precision, double precision) from public, anon, authenticated;
grant select, insert on public.zayo_fiber_routes to service_role;
grant execute on function public.import_zayo_fiber_routes(jsonb) to service_role;
grant execute on function public.zayo_fiber_routes_in_bbox(double precision, double precision, double precision, double precision, double precision, double precision) to service_role;