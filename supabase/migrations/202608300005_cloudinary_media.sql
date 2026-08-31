begin;

alter table public.media_objects
  add column if not exists provider text not null default 'supabase',
  add column if not exists provider_asset_id text,
  add column if not exists public_id text,
  add column if not exists format text,
  add column if not exists resource_type text,
  add column if not exists delivery_type text,
  add column if not exists asset_folder text,
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb;

alter table public.media_objects drop constraint if exists media_objects_bucket_check;
alter table public.media_objects drop constraint if exists media_objects_provider_check;
alter table public.media_objects add constraint media_objects_provider_check
  check (provider in ('supabase', 'cloudinary'));
alter table public.media_objects add constraint media_objects_bucket_check
  check (bucket in ('autentiko-originals', 'autentiko-thumbnails', 'autentiko-previews', 'cloudinary'));

create unique index if not exists media_objects_cloudinary_asset_uidx
  on public.media_objects (provider, provider_asset_id)
  where provider = 'cloudinary' and provider_asset_id is not null;
create index if not exists media_objects_public_id_idx
  on public.media_objects (provider, public_id)
  where provider = 'cloudinary' and public_id is not null;

create or replace function public.complete_media_upload_v2(
  p_document jsonb,
  p_objects jsonb,
  p_jobs jsonb,
  p_event jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  object_item jsonb;
begin
  v_result := public.complete_media_upload(p_document, p_objects, p_jobs, p_event);
  for object_item in select value from jsonb_array_elements(coalesce(p_objects, '[]'::jsonb)) loop
    update public.media_objects set
      provider = coalesce(nullif(object_item->>'provider', ''), 'supabase'),
      provider_asset_id = nullif(object_item->>'provider_asset_id', ''),
      public_id = nullif(object_item->>'public_id', ''),
      format = nullif(object_item->>'format', ''),
      resource_type = nullif(object_item->>'resource_type', ''),
      delivery_type = nullif(object_item->>'delivery_type', ''),
      asset_folder = nullif(object_item->>'asset_folder', ''),
      provider_metadata = coalesce(object_item->'provider_metadata', '{}'::jsonb),
      updated_at = now()
    where document_id = object_item->>'document_id'
      and version = (object_item->>'version')::integer
      and role = object_item->>'role';
  end loop;
  return v_result;
end;
$$;

revoke all on function public.complete_media_upload_v2(jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_media_upload_v2(jsonb, jsonb, jsonb, jsonb)
  to service_role;

commit;
