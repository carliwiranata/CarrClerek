-- Master Produk PPS: jalankan sekali di Supabase SQL Editor.
-- Tabel menyimpan PLU + nama produk per kategori.
create table if not exists public.product_master (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('PSM','PWP','SERTIS','SEGER')),
  plu text not null,
  product_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Wajib supaya satu PLU tidak dobel di kategori yang sama dan menjadi dasar konsistensi import.
create unique index if not exists product_master_category_plu_uidx
  on public.product_master(category, plu);

alter table public.product_master enable row level security;

drop policy if exists "product_master_select_auth" on public.product_master;
create policy "product_master_select_auth"
on public.product_master for select
using (auth.uid() is not null);

drop policy if exists "product_master_admin_insert" on public.product_master;
create policy "product_master_admin_insert"
on public.product_master for insert
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and lower(coalesce(p.role,'user')) = 'admin'));

drop policy if exists "product_master_admin_update" on public.product_master;
create policy "product_master_admin_update"
on public.product_master for update
using (exists (select 1 from public.profiles p where p.id = auth.uid() and lower(coalesce(p.role,'user')) = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and lower(coalesce(p.role,'user')) = 'admin'));

-- Opsional: hapus policy delete jika tidak ingin produk dihapus dari aplikasi.
drop policy if exists "product_master_admin_delete" on public.product_master;
create policy "product_master_admin_delete"
on public.product_master for delete
using (exists (select 1 from public.profiles p where p.id = auth.uid() and lower(coalesce(p.role,'user')) = 'admin'));

create or replace function public.set_product_master_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists product_master_updated_at on public.product_master;
create trigger product_master_updated_at
before update on public.product_master
for each row execute function public.set_product_master_updated_at();


-- Mengganti seluruh isi satu kategori secara atomik saat Admin upload Excel baru.
create or replace function public.replace_product_master_category(
  p_category text,
  p_products jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category text := upper(trim(p_category));
  v_count integer;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and lower(coalesce(p.role,'user')) = 'admin'
  ) then
    raise exception 'Hanya admin yang dapat memperbarui master produk';
  end if;

  if v_category not in ('PSM','PWP','SERTIS','SEGER') then
    raise exception 'Kategori tidak valid';
  end if;

  delete from public.product_master where category = v_category;

  insert into public.product_master(category, plu, product_name, is_active)
  select
    v_category,
    trim(x->>'plu'),
    trim(x->>'product_name'),
    true
  from jsonb_array_elements(coalesce(p_products,'[]'::jsonb)) x
  where trim(coalesce(x->>'plu','')) <> ''
    and trim(coalesce(x->>'product_name','')) <> ''
  on conflict (category, plu) do update
    set product_name = excluded.product_name,
        is_active = true;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.replace_product_master_category(text,jsonb) from public;
grant execute on function public.replace_product_master_category(text,jsonb) to authenticated;
