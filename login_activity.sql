-- CashViewer: catat waktu login user untuk dilihat admin
-- Jalankan SATU KALI di Supabase SQL Editor.

alter table public.profiles
  add column if not exists last_login_at timestamptz;

create or replace function public.record_user_login(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- User hanya boleh mencatat login untuk dirinya sendiri.
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Tidak diizinkan mencatat login user lain';
  end if;

  update public.profiles
     set last_login_at = now()
   where id = p_user_id;

  return found;
end;
$$;

revoke all on function public.record_user_login(uuid) from public;
grant execute on function public.record_user_login(uuid) to authenticated;
