-- CarrClerek: Admin role + activity log
-- Jalankan satu kali di Supabase SQL Editor.
-- Mengangkat akun yang sudah terdaftar menjadi admin.
-- Tidak mengubah password, status aktif, masa aktif, atau data toko.

begin;

update public.profiles p
set role = 'admin'
from auth.users u
where u.id = p.id
  and lower(u.email) = lower('carliwiranata12@gmail.com');

create table if not exists public.user_activity_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('login', 'feature')),
  feature_name text,
  store_code text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint user_activity_feature_name_check
    check (
      (event_type = 'login' and feature_name is null)
      or
      (event_type = 'feature' and feature_name is not null)
    )
);

create index if not exists user_activity_logs_user_time_idx
  on public.user_activity_logs (user_id, occurred_at desc);
create index if not exists user_activity_logs_type_time_idx
  on public.user_activity_logs (event_type, occurred_at desc);

alter table public.user_activity_logs enable row level security;

drop policy if exists "Users can insert own activity logs" on public.user_activity_logs;
drop policy if exists "Admins can read all activity logs" on public.user_activity_logs;

create policy "Admins can read all activity logs"
  on public.user_activity_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles admin_profile
      where admin_profile.id = auth.uid()
        and lower(coalesce(admin_profile.role, '')) = 'admin'
        and coalesce(admin_profile.is_active, true) = true
        and (
          admin_profile.expires_at is null
          or admin_profile.expires_at > now()
        )
    )
  );

-- Client hanya boleh mencatat aktivitas miliknya melalui fungsi ini.
-- Waktu selalu ditentukan database, bukan dari jam HP.
create or replace function public.record_carrclerek_activity(
  p_event_type text,
  p_feature_name text default null,
  p_store_code text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_type text := lower(trim(coalesce(p_event_type, '')));
  v_feature text := nullif(trim(coalesce(p_feature_name, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Sesi login tidak ditemukan.';
  end if;

  if v_type not in ('login', 'feature') then
    raise exception 'Jenis aktivitas tidak valid.';
  end if;

  if v_type = 'login' then
    v_feature := null;
  elsif v_feature is null then
    raise exception 'Nama fitur wajib diisi.';
  end if;

  insert into public.user_activity_logs
    (user_id, event_type, feature_name, store_code, occurred_at)
  values
    (auth.uid(), v_type, v_feature, nullif(trim(coalesce(p_store_code, '')), ''), now())
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_carrclerek_activity(text, text, text) from public;
grant execute on function public.record_carrclerek_activity(text, text, text) to authenticated;
grant select on public.user_activity_logs to authenticated;

commit;

-- Verifikasi role admin. Hasil harus menunjukkan role = admin.
select u.email, p.role, p.is_active, p.expires_at
from auth.users u
join public.profiles p on p.id = u.id
where lower(u.email) = lower('carliwiranata12@gmail.com');
