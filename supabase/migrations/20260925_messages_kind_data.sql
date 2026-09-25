-- Pesan kartu (ringkasan vital, sesi makan, catatan panggilan) membawa jenis
-- dan isinya sendiri, supaya perangkat penerima dapat menggambarnya sebagai
-- kartu. Sebelum kolom ini ada, kartu tiba sebagai gelembung kosong.
--
-- Jalankan sekali di Supabase Dashboard -> SQL Editor. Aman diulang.
-- Klien tetap berjalan tanpa migrasi ini: ia jatuh ke `text` berisi
-- ringkasan terbaca.

alter table public.messages
  add column if not exists kind text,
  add column if not exists data jsonb;

alter table public.messages
  drop constraint if exists messages_kind_check;
alter table public.messages
  add constraint messages_kind_check
  check (kind is null or kind in ('vitals', 'meal', 'call'));

-- Batasi ukuran muatan kartu agar kolom ini tidak dipakai sebagai tempat
-- menitip data sembarangan.
alter table public.messages
  drop constraint if exists messages_data_size_check;
alter table public.messages
  add constraint messages_data_size_check
  check (data is null or pg_column_size(data) <= 4096);

-- PostgREST perlu memuat ulang cache skemanya agar kolom baru dikenali.
notify pgrst, 'reload schema';
