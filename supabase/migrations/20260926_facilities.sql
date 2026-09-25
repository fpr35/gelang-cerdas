-- Unit fasilitas kesehatan (Admin Faskes) yang sungguhan.
--
-- Alur:
--   1. Admin Faskes membuat UNIT (facilities) dan mendapat KODE UNIT.
--   2. Pasien atau dokter memasukkan kode itu di aplikasi → fungsi
--      gabung_unit() membuat baris facility_members (pasien = anggota,
--      dokter = nakes). Tidak ada yang bisa membaca daftar kode unit; kode
--      hanya bisa ditukarkan.
--   3. Selama keanggotaan ada, admin unit boleh MEMBACA hasil ukur TeleBand
--      anggota berperan pasien (device_readings). Admin maupun anggota dapat
--      mengakhiri keanggotaan kapan saja.
--
-- Jalankan sekali di Supabase Dashboard -> SQL Editor. Aman diulang.
-- Butuh tabel device_readings (20260925_device_readings.sql) sudah ada.

/* ---------------- unit ---------------- */
create table if not exists public.facilities (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  kind       text not null check (char_length(kind) between 1 and 40),
  city       text not null default '' check (char_length(city) <= 60),
  code       text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  created_at timestamptz not null default now()
);

alter table public.facilities enable row level security;

-- Hanya admin pemilik yang melihat dan mengelola unitnya. Anggota tidak perlu
-- membaca tabel ini: nama unit disalin ke baris keanggotaannya.
drop policy if exists facilities_own on public.facilities;
create policy facilities_own on public.facilities
  for all to authenticated
  using (admin_id = auth.uid())
  with check (admin_id = auth.uid());

/* ---------------- keanggotaan ---------------- */
create table if not exists public.facility_members (
  facility_id   uuid not null references public.facilities (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          text not null check (role in ('pasien', 'dokter')),
  member_name   text not null check (char_length(member_name) between 1 and 80),
  facility_name text not null check (char_length(facility_name) between 1 and 80),
  created_at    timestamptz not null default now(),
  primary key (facility_id, user_id)
);

create index if not exists facility_members_user on public.facility_members (user_id);

alter table public.facility_members enable row level security;

-- Anggota melihat keanggotaannya sendiri; admin melihat semua anggota unitnya.
-- Tidak ada INSERT/UPDATE langsung dari klien: hanya lewat gabung_unit().
drop policy if exists facility_members_select on public.facility_members;
create policy facility_members_select on public.facility_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.facilities f
               where f.id = facility_members.facility_id and f.admin_id = auth.uid())
  );

drop policy if exists facility_members_delete on public.facility_members;
create policy facility_members_delete on public.facility_members
  for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.facilities f
               where f.id = facility_members.facility_id and f.admin_id = auth.uid())
  );

/* ---------------- menukarkan kode unit ---------------- */
-- security definer karena anggota tidak boleh membaca facilities secara
-- langsung. Baris yang dibuat selalu milik auth.uid() sendiri.
create or replace function public.gabung_unit(p_kode text, p_nama text, p_peran text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit  uuid;
  v_admin uuid;
  v_nama  text;
  v_diri  text := left(btrim(coalesce(p_nama, '')), 80);
begin
  if auth.uid() is null then
    raise exception 'Belum masuk.' using errcode = '28000';
  end if;
  if v_diri = '' then
    raise exception 'Nama kosong.' using errcode = '22023';
  end if;
  if p_peran not in ('pasien', 'dokter') then
    raise exception 'Peran tidak dikenal.' using errcode = '22023';
  end if;

  select id, admin_id, name into v_unit, v_admin, v_nama
    from facilities where code = upper(btrim(p_kode));
  if v_unit is null then
    raise exception 'Kode unit tidak ditemukan.' using errcode = 'P0002';
  end if;
  if v_admin = auth.uid() then
    raise exception 'Unit ini dikelola akun Anda sendiri.' using errcode = '22023';
  end if;

  insert into facility_members (facility_id, user_id, role, member_name, facility_name)
  values (v_unit, auth.uid(), p_peran, v_diri, v_nama)
  on conflict (facility_id, user_id)
    do update set role = excluded.role, member_name = excluded.member_name,
                  facility_name = excluded.facility_name;

  return v_nama;
end;
$$;

revoke all on function public.gabung_unit(text, text, text) from public, anon;
grant execute on function public.gabung_unit(text, text, text) to authenticated;

/* ---------------- admin unit membaca hasil ukur anggotanya ---------------- */
-- Subkueri tunduk pada RLS facility_members/facilities; admin memang boleh
-- melihat keduanya untuk unitnya sendiri.
drop policy if exists device_readings_select_facility on public.device_readings;
create policy device_readings_select_facility on public.device_readings
  for select to authenticated
  using (exists (
    select 1
    from public.facility_members m
    join public.facilities f on f.id = m.facility_id
    where f.admin_id = auth.uid()
      and m.role = 'pasien'
      and m.user_id = device_readings.user_id
  ));

notify pgrst, 'reload schema';
