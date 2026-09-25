-- Hubungan dokter–pasien yang sungguhan.
--
-- Alur:
--   1. Dokter membuat KODE DOKTER (care_invites) dan memberikannya ke pasien.
--   2. Pasien memasukkan kode itu di aplikasi → fungsi hubungkan_dokter()
--      membuat baris care_links. Pasien tidak pernah bisa membaca daftar kode
--      dokter; yang bisa ia lakukan hanya menukarkan kode yang ia ketahui.
--   3. Selama tautan ada, dokter boleh MEMBACA hasil ukur TeleBand pasien itu
--      (device_readings). Pasien atau dokter dapat memutus tautan kapan saja.
--
-- Jalankan sekali di Supabase Dashboard -> SQL Editor. Aman diulang.
-- Butuh tabel device_readings (20260925_device_readings.sql) sudah ada.

/* ---------------- kode dokter ---------------- */
create table if not exists public.care_invites (
  code        text primary key check (code ~ '^[A-Z2-9]{6}$'),
  doctor_id   uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  doctor_name text not null check (char_length(doctor_name) between 1 and 80),
  created_at  timestamptz not null default now()
);

alter table public.care_invites enable row level security;

-- Hanya pemilik yang melihat, membuat, dan menghapus kodenya sendiri.
drop policy if exists care_invites_own on public.care_invites;
create policy care_invites_own on public.care_invites
  for all to authenticated
  using (doctor_id = auth.uid())
  with check (doctor_id = auth.uid());

/* ---------------- tautan dokter–pasien ---------------- */
create table if not exists public.care_links (
  patient_id   uuid not null references auth.users (id) on delete cascade,
  doctor_id    uuid not null references auth.users (id) on delete cascade,
  patient_name text not null check (char_length(patient_name) between 1 and 80),
  doctor_name  text not null check (char_length(doctor_name) between 1 and 80),
  created_at   timestamptz not null default now(),
  primary key (patient_id, doctor_id),
  check (patient_id <> doctor_id)
);

create index if not exists care_links_doctor on public.care_links (doctor_id);

alter table public.care_links enable row level security;

-- Kedua pihak dapat melihat dan memutus tautannya. Tidak ada INSERT/UPDATE
-- langsung dari klien: tautan hanya lahir lewat hubungkan_dokter().
drop policy if exists care_links_select on public.care_links;
create policy care_links_select on public.care_links
  for select to authenticated
  using (patient_id = auth.uid() or doctor_id = auth.uid());

drop policy if exists care_links_delete on public.care_links;
create policy care_links_delete on public.care_links
  for delete to authenticated
  using (patient_id = auth.uid() or doctor_id = auth.uid());

/* ---------------- menukarkan kode ---------------- */
-- security definer karena pasien tidak boleh membaca care_invites secara
-- langsung. Satu sisi tautan selalu auth.uid(), jadi fungsi ini tidak bisa
-- dipakai untuk menautkan dua pengguna lain.
create or replace function public.hubungkan_dokter(p_kode text, p_nama text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dokter uuid;
  v_nama   text;
  v_pasien text := left(btrim(coalesce(p_nama, '')), 80);
begin
  if auth.uid() is null then
    raise exception 'Belum masuk.' using errcode = '28000';
  end if;
  if v_pasien = '' then
    raise exception 'Nama pasien kosong.' using errcode = '22023';
  end if;

  select doctor_id, doctor_name into v_dokter, v_nama
    from care_invites where code = upper(btrim(p_kode));
  if v_dokter is null then
    raise exception 'Kode dokter tidak ditemukan.' using errcode = 'P0002';
  end if;
  if v_dokter = auth.uid() then
    raise exception 'Kode ini milik akun Anda sendiri.' using errcode = '22023';
  end if;

  insert into care_links (patient_id, doctor_id, patient_name, doctor_name)
  values (auth.uid(), v_dokter, v_pasien, v_nama)
  on conflict (patient_id, doctor_id)
    do update set patient_name = excluded.patient_name, doctor_name = excluded.doctor_name;

  return v_nama;
end;
$$;

revoke all on function public.hubungkan_dokter(text, text) from public, anon;
grant execute on function public.hubungkan_dokter(text, text) to authenticated;

/* ---------------- dokter membaca hasil ukur pasiennya ---------------- */
-- Subkueri tunduk pada RLS care_links, dan dokter memang boleh melihat
-- tautannya sendiri, jadi tidak perlu fungsi security definer.
drop policy if exists device_readings_select_doctor on public.device_readings;
create policy device_readings_select_doctor on public.device_readings
  for select to authenticated
  using (exists (
    select 1 from public.care_links l
    where l.doctor_id = auth.uid() and l.patient_id = device_readings.user_id
  ));

notify pgrst, 'reload schema';
