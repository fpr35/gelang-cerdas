# Panduan Memasang TeleCare di Firebase (paket gratis)

Panduan ini untuk pemula. Ikuti berurutan, satu langkah demi satu langkah.
Perkiraan waktu: **30–45 menit**. Tidak perlu kartu kredit — semuanya memakai
paket **Spark (gratis)**.

> **Cara tercepat:** kerjakan Bagian 1–5 di Firebase Console, lalu kirim ke
> Claude (asisten kode) **isi `firebaseConfig`** dari Bagian 2. Claude akan
> mengisi berkas-berkas konfigurasinya. Setelah itu Anda tinggal mengerjakan
> Bagian 7 (deploy).

Yang akan dipakai:

| Layanan Firebase | Untuk apa |
| --- | --- |
| **Hosting** | Menayangkan situs (landing page) dan aplikasi `/app/` |
| **Authentication** | Masuk dengan Google (pasien) dan email + kata sandi (admin) |
| **Cloud Firestore** | Database: profil pasien, catatan makanan, hasil ukur TeleBand, daftar admin |
| **AI Logic** | Gemini untuk deteksi makanan dari foto dan "Wawasan TeleCare AI" |

---

## Bagian 1 — Membuat project Firebase

1. Buka **https://console.firebase.google.com** dan masuk dengan akun Google
   yang akan menjadi pemilik project (sebaiknya akun tim, bukan akun pribadi).
2. Klik **Create a project** (atau **Get started by setting up a Firebase project**).
3. **Project name**: isi misalnya `telecare-app`. Di bawah nama, Firebase
   menampilkan **Project ID** (contoh: `telecare-app-1a2b3`).
   **Catat Project ID ini** — dipakai di beberapa langkah berikutnya.
4. Centang persetujuan, klik **Continue**.
5. Bila ditanya soal **Gemini in Firebase / AI assistance**: boleh dibiarkan, klik **Continue**.
6. Pada halaman **Google Analytics**: **matikan** tombolnya (tidak dibutuhkan), lalu klik **Create project**.
7. Tunggu sampai muncul "Your new project is ready", klik **Continue**.

> Paket bawaan project baru adalah **Spark (gratis)**. Jangan klik
> "Upgrade" atau "Blaze" di mana pun.

---

## Bagian 2 — Mendaftarkan aplikasi web (mendapatkan `firebaseConfig`)

1. Di halaman utama project (**Project Overview**), klik ikon **`</>`** (Web).
   Bila tidak terlihat, klik **+ Add app** lalu pilih **Web**.
2. **App nickname**: isi `TeleCare Web`.
3. **Jangan** centang "Also set up Firebase Hosting" (sudah diatur di repo).
4. Klik **Register app**.
5. Muncul kode seperti ini:

   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy....",
     authDomain: "telecare-app-1a2b3.firebaseapp.com",
     projectId: "telecare-app-1a2b3",
     storageBucket: "telecare-app-1a2b3.firebasestorage.app",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef123456"
   };
   ```

   **Salin seluruh blok `firebaseConfig` itu** dan simpan (kirim ke Claude, atau
   isi sendiri di Bagian 6). Nilai ini **boleh** terlihat publik — keamanan data
   dijaga oleh aturan database, bukan oleh kerahasiaan `apiKey`.
6. Klik **Continue to console**.

> Lupa menyalin? Buka ⚙️ (roda gigi di kiri atas) → **Project settings** →
> tab **General** → gulir ke **Your apps** → bagian **SDK setup and
> configuration** → pilih **Config**.

---

## Bagian 3 — Mengaktifkan cara masuk (Authentication)

1. Menu kiri: **Build → Authentication** (atau **Security → Authentication**) → klik **Get started**.
2. Tab **Sign-in method**:
   - Klik **Google** → nyalakan **Enable** → pada **Support email for project**
     pilih email Anda → **Save**.
   - Klik **Add new provider** → **Email/Password** → nyalakan **Enable**
     (tombol pertama saja; "Email link" biarkan mati) → **Save**.
3. Tab **Settings** → **Authorized domains**. Pastikan sudah ada (biasanya otomatis):
   - `localhost`
   - `<Project ID>.firebaseapp.com`
   - `<Project ID>.web.app`

   Bila kelak memakai domain sendiri (mis. `telecare.id`), tambahkan di sini
   lewat **Add domain**, kalau tidak tombol "Masuk dengan Google" akan gagal.

---

## Bagian 4 — Membuat database (Cloud Firestore)

1. Menu kiri: **Build → Firestore Database** (atau **Databases → Firestore**) → klik **Create database**.
2. Bila ditanya **edition**, pilih **Standard edition**.
3. **Database ID**: biarkan `(default)`.
4. **Location**: pilih **`asia-southeast2 (Jakarta)`**.
   ⚠️ Lokasi **tidak bisa diubah** setelah dibuat.
5. Pilih **Start in production mode** (semua akses ditolak sampai aturan
   TeleCare dipasang di Bagian 7 — itu yang kita mau).
6. Klik **Create**. Tunggu sampai halaman database kosong muncul.

> Anda **tidak perlu** membuat koleksi/tabel apa pun secara manual, kecuali
> `admins` di Bagian 5. Koleksi lain dibuat otomatis oleh aplikasi.

---

## Bagian 5 — AI Logic (Gemini, gratis) dan akun admin

### 5a. Mengaktifkan AI Logic

1. Menu kiri: **Build → AI Logic** (bisa juga di kategori **AI**) → **Get started**.
2. Pilih **Gemini Developer API** (BUKAN "Vertex AI Gemini API" — yang itu butuh paket Blaze).
3. Ikuti tombolnya (**Get started with this API** / **Enable API**) sampai selesai.
   Firebase membuat kunci API Gemini secara otomatis — Anda tidak perlu menyalin apa pun.

### 5b. Membuat akun admin

Admin adalah orang yang bisa membuka dasbor semua pasien di
`/app/#/masuk/admin`. Halaman itu sengaja tidak punya tautan di mana pun.

1. **Authentication → Users** → **Add user**.
2. Isi **Email** (mis. `admin@telecare.id`) dan **Password** (minimal 6 karakter,
   sebaiknya panjang). Klik **Add user**.
3. Di daftar pengguna, arahkan kursor ke baris akun tadi dan salin
   **User UID** (deretan huruf-angka seperti `kJ8sd7...`). Ada tombol salin di sebelahnya.
4. Buka **Firestore Database** → tab **Data** → **+ Start collection**.
5. **Collection ID**: ketik `admins` (huruf kecil semua) → **Next**.
6. **Document ID**: tempel **User UID** dari langkah 3 (jangan klik "Auto-ID").
7. Isi satu field: **Field** `catatan`, **Type** `string`, **Value** `admin`.
8. Klik **Save**.

Untuk admin tambahan: ulangi langkah 1–3, lalu di koleksi `admins` klik
**+ Add document** dengan Document ID = UID akun baru itu.

> Akun admin **tidak bisa** dipakai untuk masuk sebagai pasien, dan akun
> Google pasien tidak bisa masuk ke halaman admin.

---

## Bagian 6 — Mengisi konfigurasi di repo

> Lewati bagian ini bila Claude yang mengisinya.

1. Buka berkas **`app/js/firebase-config.js`**. Ganti setiap nilai bertuliskan
   `GANTI-...` dengan nilai dari `firebaseConfig` (Bagian 2). Contoh:

   ```js
   window.TELECARE_FIREBASE = {
     apiKey: 'AIzaSy....',
     authDomain: 'telecare-app-1a2b3.firebaseapp.com',
     projectId: 'telecare-app-1a2b3',
     storageBucket: 'telecare-app-1a2b3.firebasestorage.app',
     messagingSenderId: '1234567890',
     appId: '1:1234567890:web:abcdef123456'
   };
   ```
2. Buka berkas **`.firebaserc`** dan ganti `GANTI-projectId` dengan Project ID Anda:

   ```json
   { "projects": { "default": "telecare-app-1a2b3" } }
   ```
3. (Opsional, untuk SEO) Di `index.html`, `robots.txt`, dan `sitemap.xml`, ganti
   `telecare-id.web.app` dengan `<Project ID>.web.app`.

---

## Bagian 7 — Deploy (menayangkan situs + memasang aturan database)

Perintah diketik di **Terminal**. Di VS Code: menu **Terminal → New Terminal**
(pastikan terminal berada di folder repo `gelang-cerdas`).

1. Cek Firebase CLI sudah terpasang:

   ```bash
   firebase --version
   ```

   Muncul angka (mis. `15.12.0`) → lanjut. Muncul "not recognized" → pasang dulu
   dengan `npm install -g firebase-tools` (butuh Node.js dari https://nodejs.org).

2. Masuk ke akun Google pemilik project (sekali saja per komputer):

   ```bash
   firebase login
   ```

   Peramban terbuka → pilih akun Google yang sama dengan Bagian 1 → **Allow**.
   Bila ditanya soal mengirim laporan penggunaan, jawab bebas (`Y` atau `n`).

3. Pastikan project yang dipakai benar:

   ```bash
   firebase projects:list
   ```

   Project ID Anda harus tertera, dan cocok dengan isi `.firebaserc`.

4. Deploy semuanya (situs, aplikasi, aturan keamanan, indeks database):

   ```bash
   firebase deploy
   ```

   Tunggu sampai muncul **`✔ Deploy complete!`** beserta **Hosting URL**, contoh
   `https://telecare-app-1a2b3.web.app`. Itu alamat situs Anda.

5. **Tunggu 3–5 menit** sebelum mencoba: indeks database dibangun di latar
   belakang. Selama itu layar bisa menulis "Indeks Firestore belum dibuat".

Setelah ada perubahan kode di kemudian hari, cukup ulangi `firebase deploy`
(atau `firebase deploy --only hosting` bila hanya situs yang berubah).

---

## Bagian 8 — Mencoba

| Coba | Yang diharapkan |
| --- | --- |
| Buka `https://<Project ID>.web.app` | Landing page tampil |
| Buka `https://<Project ID>.web.app/app/` → **Masuk dengan Google** | Jendela pilih akun Google → masuk → layar "Lengkapi Data" |
| Isi Lengkapi Data, catat satu makanan | Tersimpan; di Console → Firestore → Data muncul `patients` dan `patient_meals` |
| Buka aplikasi di perangkat lain dengan akun Google yang sama | Profil & catatan makanan ikut muncul (langsung ke Beranda) |
| Catat makanan lewat foto | Makanan dikenali otomatis (AI Logic) |
| Buka `https://<Project ID>.web.app/app/#/masuk/admin`, masuk dengan akun admin | Dasbor admin menampilkan pasien |

---

## Bagian 9 — Membersihkan layanan lama

Lakukan **setelah** Bagian 8 berhasil:

1. **Vercel**: buka https://vercel.com → project `gelang-cerdas` → **Settings** →
   (bagian bawah) **Delete Project**. Ini penting: selama masih ada, alamat
   `gelang-cerdas.vercel.app` tetap menayangkan versi lama, dan pengguna yang
   membukanya masih memakai Supabase.
2. **Supabase**: buka https://supabase.com/dashboard → project TeleCare →
   **Project Settings → General** → **Pause project** (atau **Delete project**
   bila datanya memang tidak dipakai lagi — kita mulai dari nol).
3. **metered.ca**: masuk ke dashboard metered.ca → hapus / putar ulang
   (rotate) kredensial TURN. Kredensial lama pernah tersimpan di repo publik.
4. Beri tahu pengguna alamat baru: `https://<Project ID>.web.app/app/`.
   Akun dan data lama tidak ikut pindah — pengguna masuk lagi dengan Google
   dan memulai dari awal.

---

## Batas paket gratis (Spark) yang perlu diketahui

Firebase **tidak akan menagih** apa pun di paket Spark. Bila batas harian
habis, layanan berhenti sampai kuota pulih (setiap hari sekitar pukul
14.00–15.00 WIB).

| Layanan | Batas gratis | Catatan |
| --- | --- | --- |
| Firestore | 50.000 baca, 20.000 tulis, 20.000 hapus per hari; 1 GB data | Aplikasi sudah dihemat: tarikan data per 5 menit, hasil ukur hanya yang baru, dasbor admin disimpan sementara 60 dtk |
| Hosting | 10 GB penyimpanan, **360 MB transfer per hari** | Satu kunjungan landing page ± 2–3 MB. Video di bagian tersembunyi tidak ikut terunduh |
| Authentication | Google & email gratis | — |
| AI Logic (Gemini Developer API) | Kuota harian gratis dari Google (berubah sewaktu-waktu) | Bila habis, aplikasi menulis "Layanan deteksi sedang sibuk" dan pengguna memilih makanan sendiri |

**Tidak tersedia di paket gratis:** push notifikasi dari server (butuh Cloud
Functions). Notifikasi peringatan di perangkat pasien tetap berjalan.

---

## Bila ada masalah

| Pesan / gejala | Penyebab & solusi |
| --- | --- |
| "Layanan masuk belum siap" | `app/js/firebase-config.js` masih berisi `GANTI-...` (Bagian 6), atau internet mati |
| "Metode masuk ini belum diaktifkan" | Bagian 3 langkah 2 belum dikerjakan |
| "Domain ini belum diizinkan" | Tambahkan domain situs di Authentication → Settings → Authorized domains |
| "Akses ditolak server" | Aturan belum terpasang: jalankan `firebase deploy --only firestore` |
| "Indeks Firestore belum dibuat" | Tunggu 3–5 menit setelah deploy; bila tetap, jalankan `firebase deploy --only firestore` |
| Admin: "Akun ini bukan akun admin" | Document ID di koleksi `admins` tidak sama persis dengan User UID (Bagian 5b) |
| Deteksi makanan selalu gagal | AI Logic belum diaktifkan dengan **Gemini Developer API** (Bagian 5a). Bila model Gemini sudah dipensiunkan Google, ubah daftar `models` di `app/js/firebase-config.js` |
| `firebase deploy` → "Invalid project id" / "Not in a Firebase app directory" | Terminal tidak berada di folder repo, atau `.firebaserc` masih `GANTI-projectId` |
| `firebase deploy` → "403 / permission" | Masuk CLI dengan akun lain: `firebase logout` lalu `firebase login` dengan akun pemilik project |
