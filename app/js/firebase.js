/* ============================================================
   TeleCare App — firebase.js
   Lapisan server: Firebase Auth, Cloud Firestore, dan Firebase AI
   Logic (Gemini). Menggantikan supabase.js dengan nama API yang SAMA
   (TC.FB, TC.ReadingsDB, TC.PatientsDB, TC.DeteksiDB) supaya layar-layar
   tidak perlu diubah.

   Koleksi Firestore meniru tabel Supabase lama — nama koleksi, nama
   field, dan bentuk nilainya sama (waktu = teks ISO 8601):
     admins/{uid}                                  (diisi manual di Console)
     patients/{uid}
     patient_meals/{uid}_{idCatatan}
     device_readings/{uid}_{serial}_{idAlat}_{epoch}
   Aturan aksesnya di firestore.rules; indeks di firestore.indexes.json.

   Paket Spark (gratis): tidak ada Cloud Functions, jadi semua logika
   ada di sini dan di aturan Firestore. Fitur konsultasi/chat/panggilan
   (TC.Chat, TC.RTC) BELUM dipindah ke Firebase — lihat TC.FITUR.
   ============================================================ */
(function (TC) {
  'use strict';

  /* ============================================================
     0. MENUNGGU SDK (firebase-init.js memuatnya secara asinkron)
     ============================================================ */
  function fbKlien() {
    if (window.TELECARE_FB) return Promise.resolve(window.TELECARE_FB);
    if (window.TELECARE_FB_ERROR) return Promise.reject(new Error(window.TELECARE_FB_ERROR));
    return new Promise((resolve, reject) => {
      const siap = () => { bersih(); resolve(window.TELECARE_FB); };
      const gagal = (e) => { bersih(); reject(new Error((e && e.detail) || 'Firebase gagal dimuat.')); };
      const t = setTimeout(() => { bersih(); reject(new Error('Waktu tunggu Firebase habis.')); }, 15000);
      function bersih() {
        clearTimeout(t);
        window.removeEventListener('telecare:fb-ready', siap);
        window.removeEventListener('telecare:fb-error', gagal);
      }
      window.addEventListener('telecare:fb-ready', siap);
      window.addEventListener('telecare:fb-error', gagal);
    });
  }

  /**
   * Firestore tidak pernah menolak tulisan saat luring — janjinya baru
   * selesai ketika server mengonfirmasi, yang bisa tak kunjung terjadi.
   * Batas waktu membuat pemanggil tahu tulisan BELUM tersimpan (mis. hasil
   * TeleBand tidak di-HAPUS dari alat). Tulisan itu tetap antre di SDK dan
   * dikirim begitu tersambung; pengiriman ulang dari aplikasi aman.
   */
  function batasWaktu(janji, ms, pesan) {
    let t;
    const habis = new Promise((_, tolak) => {
      t = setTimeout(() => {
        const e = new Error(pesan || 'Server tidak menjawab. Periksa koneksi internet.');
        e.code = 'waktu-habis';
        tolak(e);
      }, ms);
    });
    return Promise.race([janji, habis]).finally(() => clearTimeout(t));
  }
  const TULIS_MS = 15000;
  const BACA_MS = 20000;
  const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
  const kini = () => new Date().toISOString();

  /* ============================================================
     1. SESI & STATUS
     ============================================================ */
  const FB = {
    ready: false,       // true sejak init() — fungsi lain menunggu SDK sendiri
    online: navigator.onLine !== false,
    settled: false,     // status masuk sudah diketahui (atau Firebase gagal dimuat)
    uid: null,
    authUser: null,
    anonymous: false,   // tidak ada lagi sesi anonim; dipertahankan untuk pemanggil lama
    error: null,
    authFatal: null,
    _subs: new Set()
  };

  function emit() {
    FB._subs.forEach((fn) => { try { fn(FB); } catch (e) { /* abaikan */ } });
    window.dispatchEvent(new CustomEvent('telecare:fb', { detail: { online: FB.online } }));
  }

  FB.onStatus = function (fn) {
    FB._subs.add(fn);
    fn(FB);
    return () => FB._subs.delete(fn);
  };

  /** Pengguna Firebase → bentuk yang dipakai layar (sama dengan versi Supabase). */
  function normal(u) {
    if (!u) return null;
    const penyedia = (u.providerData || []).map((p) => p.providerId);
    return {
      id: u.uid,
      email: u.email || null,
      phone: u.phoneNumber || '',
      is_anonymous: !!u.isAnonymous,
      provider: penyedia.indexOf('google.com') !== -1 ? 'google' : (penyedia[0] || null),
      user_metadata: { full_name: u.displayName || null, avatar_url: u.photoURL || null }
    };
  }

  FB.init = function () {
    if (FB.ready) return;
    FB.ready = true;   // SEBELUM SDK siap; setiap fungsi menunggu fbKlien() sendiri.
    window.addEventListener('online', () => { FB.online = true; emit(); });
    window.addEventListener('offline', () => { FB.online = false; emit(); });
    fbKlien().then((k) => {
      k.authM.onAuthStateChanged(k.auth, (u) => {
        FB.uid = u ? u.uid : null;
        FB.authUser = normal(u);
        FB.anonymous = !!(u && u.isAnonymous);
        FB.settled = true;
        emit();
      });
    }).catch((e) => {
      FB.error = e.message;
      FB.ready = false;
      FB.settled = true;
      console.warn('[TeleCare] Firebase tidak aktif:', e.message);
      emit();
    });
  };

  /** Pengguna yang sedang masuk. Tanpa sesi → galat `belum-masuk` (tidak ada sesi anonim). */
  FB.ensureAuth = async function () {
    const k = await fbKlien();
    await k.auth.authStateReady();
    const u = k.auth.currentUser;
    if (!u) {
      const e = new Error('Belum masuk ke akun.');
      e.code = 'belum-masuk';
      throw e;
    }
    return normal(u);
  };

  /**
   * uid pengguna yang sedang masuk, dibaca LANGSUNG dari Auth (tanpa
   * menunggu event onAuthStateChanged, yang bisa datang sesaat setelah
   * signInWithPopup selesai). null = tidak ada sesi. Hanya bermakna
   * setelah `settled`.
   */
  FB.uidKini = function () {
    const k = window.TELECARE_FB;
    const u = k && k.auth.currentUser;
    return u ? u.uid : null;
  };

  FB.canSync = () => !!(FB.ready && FB.online && FB.uid);
  FB.waitOnline = () => Promise.resolve(FB.online);
  FB.googleAvailable = () => FB.ready;

  /* ---------------- Masuk dengan Google ----------------
     Jendela popup lebih dulu: pengalihan halaman bermasalah di peramban
     yang memblokir penyimpanan pihak ketiga, karena halaman login ada di
     domain *.firebaseapp.com. Popup diblokir → pengalihan sebagai cadangan. */
  FB.signInGoogle = async function () {
    const k = await fbKlien();
    const p = new k.authM.GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    try {
      const r = await k.authM.signInWithPopup(k.auth, p);
      return normal(r.user);
    } catch (e) {
      if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
        await k.authM.signInWithRedirect(k.auth, p);
        return null;   // halaman berpindah
      }
      throw e;
    }
  };

  /** Pengguna Google yang sedang masuk (hasil pengalihan, atau sesi tersimpan), atau null. */
  FB.redirectResult = async function () {
    try {
      const k = await fbKlien();
      try { await k.authM.getRedirectResult(k.auth); }
      catch (e) { console.warn('[TeleCare] hasil masuk Google:', e.code || e.message); }
      await k.auth.authStateReady();
      const u = normal(k.auth.currentUser);
      return u && u.provider === 'google' ? u : null;
    } catch (e) { return null; }
  };

  FB.signOut = function () {
    return fbKlien().then((k) => k.authM.signOut(k.auth)).catch(() => null);
  };

  /* ---------------- Admin (email + kata sandi) ----------------
     Admin = pengguna Firebase Auth yang punya dokumen admins/{uid}.
     Dokumen itu hanya bisa dibuat dari Firebase Console (aturan menolak
     tulisan dari aplikasi). Akun yang bukan admin langsung dikeluarkan. */
  async function adminKah(k, uid) {
    const s = await batasWaktu(k.fsM.getDoc(k.fsM.doc(k.db, 'admins', uid)), BACA_MS);
    return s.exists();
  }

  FB.signInAdmin = async function (email, pass) {
    const k = await fbKlien();
    const r = await k.authM.signInWithEmailAndPassword(k.auth, String(email || '').trim(), pass);
    let admin = false, galat = null;
    try { admin = await adminKah(k, r.user.uid); } catch (e) { galat = e; }
    if (!admin) {
      await k.authM.signOut(k.auth).catch(() => null);
      if (galat) throw galat;
      const e = new Error('Akun ini bukan akun admin.');
      e.code = 'BUKAN_ADMIN';
      throw e;
    }
    return normal(r.user);
  };

  /** Apakah sesi saat ini milik admin? Galat dianggap bukan admin. */
  FB.cekAdmin = async function () {
    try {
      const k = await fbKlien();
      await k.auth.authStateReady();
      const u = k.auth.currentUser;
      return u ? await adminKah(k, u.uid) : false;
    } catch (e) { return false; }
  };

  /** Pesan galat Firebase Auth yang bisa dipahami pengguna. */
  FB.authError = function (err) {
    const kode = (err && err.code) || '';
    const PESAN = {
      'auth/operation-not-allowed': 'Metode masuk ini belum diaktifkan. Buka Firebase Console → Authentication → Sign-in method.',
      'auth/configuration-not-found': 'Authentication belum diaktifkan di Firebase Console (Authentication → Get started).',
      'auth/unauthorized-domain': 'Domain ini belum diizinkan. Tambahkan di Firebase Console → Authentication → Settings → Authorized domains.',
      'auth/popup-closed-by-user': 'Jendela masuk ditutup sebelum selesai.',
      'auth/cancelled-popup-request': 'Jendela masuk ditutup sebelum selesai.',
      'auth/network-request-failed': 'Jaringan bermasalah. Coba lagi.',
      'auth/invalid-credential': 'Email atau kata sandi salah.',
      'auth/wrong-password': 'Email atau kata sandi salah.',
      'auth/user-not-found': 'Email atau kata sandi salah.',
      'auth/invalid-email': 'Format email belum benar.',
      'auth/user-disabled': 'Akun ini dinonaktifkan.',
      'auth/too-many-requests': 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.'
    };
    return PESAN[kode] || (err && err.message) || 'Masuk gagal.';
  };

  /** Pesan galat Firestore yang bisa dipahami (dipakai layar admin). */
  FB.pesanGalat = function (e) {
    const kode = (e && e.code) || '';
    const isi = (e && e.message) || '';
    if (kode === 'permission-denied') {
      return 'Akses ditolak server. Pastikan aturan Firestore sudah dipasang (firebase deploy --only firestore) ' +
        'dan akun ini berhak membuka data tersebut.';
    }
    if (kode === 'failed-precondition' && /index/i.test(isi)) {
      return 'Indeks Firestore belum dibuat. Jalankan: firebase deploy --only firestore';
    }
    if (kode === 'unavailable' || kode === 'waktu-habis') return 'Server tidak terjangkau. Periksa koneksi internet.';
    if (kode === 'belum-masuk') return 'Sesi sudah berakhir. Silakan masuk kembali.';
    return isi || 'Gagal menghubungi server.';
  };

  /* ============================================================
     2. BANTUAN FIRESTORE
     ============================================================ */
  const baris = (snap) => Object.assign({ id: snap.id }, snap.data());

  /** Kueri dengan batas waktu → array baris. */
  async function ambil(koleksi, kendala) {
    const k = await fbKlien();
    const f = k.fsM;
    const s = await batasWaktu(f.getDocs(f.query(f.collection(k.db, koleksi), ...kendala(f))), BACA_MS);
    return s.docs.map(baris);
  }

  /** Simpanan sementara 60 dtk untuk kueri admin yang besar (kuota baca gratis 50.000/hari). */
  const simpanan = new Map();
  async function bersimpan(kunci, fn) {
    const x = simpanan.get(kunci);
    if (x && Date.now() - x.at < 60000) return x.isi;
    const isi = await fn();
    simpanan.set(kunci, { at: Date.now(), isi });
    return isi;
  }
  const lupakanSimpanan = () => simpanan.clear();

  /* ============================================================
     3. HASIL UKUR PERANGKAT — koleksi device_readings
     ============================================================ */
  // Semua kolom selalu dikirim (null bila kosong): aturan Firestore memeriksa
  // setiap field, dan field yang hilang berbeda dari field bernilai null.
  const KOLOM_HASIL = ['device_serial', 'device_unit', 'firmware', 'device_result_id', 'device_epoch',
    'measured_at', 'time_valid', 'duration_s', 'bpm', 'spo2', 'glucose_est', 'sys_est', 'dia_est',
    'source', 'flags'];

  const ReadingsDB = {
    /**
     * Menyimpan satu hasil. Duplikat (serial + id + epoch yang sama) dianggap
     * BERHASIL — hasil itu memang sudah ada di server, jadi alat boleh
     * menghapusnya. Melempar galat bila penyimpanan gagal.
     */
    async simpan(row) {
      const k = await fbKlien();
      const user = await FB.ensureAuth();
      const f = k.fsM;
      const d = { user_id: user.id, received_at: kini() };
      KOLOM_HASIL.forEach((c) => { d[c] = row[c] === undefined ? null : row[c]; });
      const id = [user.id, d.device_serial, d.device_result_id, d.device_epoch].join('_');
      const ref = f.doc(k.db, 'device_readings', id);
      try {
        await batasWaktu(f.setDoc(ref, d), TULIS_MS);
      } catch (e) {
        // Dokumen sudah ada → aturan menolak penimpaan (hasil ukur tidak boleh
        // berubah). Setara ignoreDuplicates di versi Supabase.
        if (e && e.code === 'permission-denied') {
          const s = await batasWaktu(f.getDoc(ref), BACA_MS).catch(() => null);
          if (s && s.exists()) return true;
        }
        throw e;
      }
      return true;
    },

    /**
     * Hasil milik pengguna tertentu (bawaan: diri sendiri), terbaru diterima dulu.
     * @param {object} [opsi]  { sejak: ISO } — hanya yang diterima server SETELAH waktu itu
     */
    async daftar(userId, batas, opsi) {
      const user = await FB.ensureAuth();
      return ambil('device_readings', (f) => {
        const k = [f.where('user_id', '==', userId || user.id)];
        if (opsi && opsi.sejak) k.push(f.where('received_at', '>', opsi.sejak));
        return k.concat([f.orderBy('received_at', 'desc'), f.limit(batas || 50)]);
      });
    },

    /** Hasil milik beberapa pengguna sekaligus, terbaru dulu (kueri `in` maks. 30 id). */
    async daftarBanyak(userIds, batas) {
      await FB.ensureAuth();
      if (!userIds || !userIds.length) return [];
      const potong = [];
      for (let i = 0; i < userIds.length; i += 30) potong.push(userIds.slice(i, i + 30));
      const hasil = await Promise.all(potong.map((ids) => ambil('device_readings', (f) => [
        f.where('user_id', 'in', ids), f.orderBy('received_at', 'desc'), f.limit(batas || 1000)
      ])));
      return [].concat(...hasil)
        .sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)))
        .slice(0, batas || 1000);
    },

    /** Hasil ukur terbaru dari semua pengguna yang boleh dibaca (admin: semuanya). */
    async terbaru(batas) {
      await FB.ensureAuth();
      return bersimpan('terbaru:' + (batas || 2000), () => ambil('device_readings', (f) => [
        f.orderBy('received_at', 'desc'), f.limit(batas || 2000)
      ]));
    }
  };

  /* ============================================================
     4. DATA PASIEN — koleksi patients & patient_meals
     Pasien mendaftarkan dirinya sendiri; admin membaca semuanya.
     ============================================================ */
  const PatientsDB = {
    /** @param {object} [ekstra]  { profile, sesi_berjalan } */
    async daftarkan(nama, email, ekstra) {
      const k = await fbKlien();
      const user = await FB.ensureAuth();
      const f = k.fsM;
      const ref = f.doc(k.db, 'patients', user.id);
      const lama = await batasWaktu(f.getDoc(ref), BACA_MS);
      const d = {
        user_id: user.id,
        name: String(nama || 'Pasien').trim().slice(0, 80) || 'Pasien',
        email: email ? String(email).slice(0, 120) : null,
        anonymous: !!user.is_anonymous,
        // created_at diisi sekali saat pertama terdaftar, lalu dipertahankan.
        created_at: lama.exists() && lama.data().created_at ? lama.data().created_at : kini(),
        last_seen: kini(),
        profile: ekstra && ekstra.profile ? ekstra.profile : null,
        sesi_berjalan: null
      };
      await batasWaktu(f.setDoc(ref, d), TULIS_MS);
      return true;
    },

    /** Menyalin catatan makanan (tanpa foto) ke server. */
    async simpanSesi(daftar) {
      const k = await fbKlien();
      const user = await FB.ensureAuth();
      if (!daftar.length) return true;
      const f = k.fsM;
      for (let i = 0; i < daftar.length; i += 400) {
        const b = f.writeBatch(k.db);
        daftar.slice(i, i + 400).forEach((m) => {
          b.set(f.doc(k.db, 'patient_meals', user.id + '_' + m.id), {
            user_id: user.id, id: String(m.id), at: new Date(m.at).toISOString(),
            data: m, updated_at: kini()
          });
        });
        await batasWaktu(b.commit(), TULIS_MS);
      }
      return true;
    },

    /** Menghapus satu catatan makanan milik sendiri dari salinan server. */
    async hapusSesi(id) {
      const k = await fbKlien();
      const user = await FB.ensureAuth();
      await batasWaktu(k.fsM.deleteDoc(k.fsM.doc(k.db, 'patient_meals', user.id + '_' + id)), TULIS_MS);
      return true;
    },

    /** Satu pasien lengkap dengan profilnya (pasien sendiri atau admin). */
    async satu(userId) {
      const k = await fbKlien();
      await FB.ensureAuth();
      const s = await batasWaktu(k.fsM.getDoc(k.fsM.doc(k.db, 'patients', userId)), BACA_MS);
      return s.exists() ? baris(s) : null;
    },

    /** Riwayat makanan seorang pasien, terbaru dulu. */
    async sesi(userId, batas) {
      await FB.ensureAuth();
      const rows = await ambil('patient_meals', (f) => [
        f.where('user_id', '==', userId), f.orderBy('at', 'desc'), f.limit(batas || 60)
      ]);
      return rows.map((r) => r.data);
    },

    /**
     * Admin menghapus seluruh data seorang pasien di server: hasil ukur,
     * catatan makanan, lalu dokumen pasiennya. Akun login-nya (Firebase
     * Auth) tidak ikut terhapus — itu hanya dari Console.
     */
    async hapusData(userId) {
      const k = await fbKlien();
      await FB.ensureAuth();
      const f = k.fsM;
      for (const koleksi of ['device_readings', 'patient_meals']) {
        for (;;) {
          const s = await batasWaktu(f.getDocs(f.query(f.collection(k.db, koleksi),
            f.where('user_id', '==', userId), f.limit(400))), BACA_MS);
          if (s.empty) break;
          const b = f.writeBatch(k.db);
          s.docs.forEach((d) => b.delete(d.ref));
          await batasWaktu(b.commit(), TULIS_MS);
        }
      }
      await batasWaktu(f.deleteDoc(f.doc(k.db, 'patients', userId)), TULIS_MS);
      lupakanSimpanan();
      return true;
    },

    /** Semua pasien (hanya berhasil untuk admin), terakhir aktif lebih dulu. */
    async semua(batas) {
      await FB.ensureAuth();
      return bersimpan('pasien:' + (batas || 1000), () => ambil('patients', (f) => [
        f.orderBy('last_seen', 'desc'), f.limit(batas || 1000)
      ]));
    }
  };

  /* ============================================================
     5. DETEKSI MAKANAN & WAWASAN — Firebase AI Logic (Gemini)
     Dulu Edge Function di server; paket gratis tidak punya Cloud
     Functions, jadi Gemini dipanggil langsung lewat AI Logic (kuncinya
     dikelola Firebase, tidak ada di kode). Validasi yang dulu di server
     kini di sini: nama makanan harus dari daftar, porsi dibulatkan.
     ============================================================ */
  const PORSI = [0.5, 1, 1.5, 2, 3];
  const MAKS_GAMBAR = 3000000;   // ± 2,2 MB biner dalam base64
  const statusAI = (e) => (e && e.customErrorData && e.customErrorData.status) || 0;

  /**
   * Mencoba model satu per satu (TELECARE_AI.models). Model tidak ada (404)
   * → model berikutnya; sibuk/kuota (429/500/503) → ulangi sekali, lalu
   * model berikutnya. Mengembalikan teks jawaban (JSON).
   */
  async function panggilAI(isi, generationConfig) {
    const k = await fbKlien();
    const daftar = ((window.TELECARE_AI || {}).models || []).filter(Boolean);
    if (!daftar.length) throw new Error('Daftar model AI kosong (app/js/firebase-config.js).');
    let akhir = null, sibuk = false;
    for (const nama of daftar) {
      const model = k.aiM.getGenerativeModel(k.ai, { model: nama, generationConfig });
      for (let coba = 0; coba < 2; coba++) {
        try {
          const r = await batasWaktu(model.generateContent(isi), 60000, 'Layanan AI tidak menjawab.');
          return r.response.text();
        } catch (e) {
          akhir = e;
          const st = statusAI(e);
          if (st === 404 || (st === 400 && /not found|not supported|unsupported/i.test(e.message || ''))) {
            console.warn('[TeleCare] model AI tidak tersedia:', nama);
            break;
          }
          if (st === 429 || st === 500 || st === 503 || e.code === 'waktu-habis') {
            sibuk = true;
            if (coba === 0) { await tidur(1500); continue; }
            break;
          }
          throw e;
        }
      }
    }
    if (sibuk) {
      const e = new Error('Layanan AI sedang sibuk. Coba lagi beberapa saat lagi.');
      e.code = 'sibuk';
      throw e;
    }
    throw akhir || new Error('Tidak ada model AI yang tersedia.');
  }

  const DeteksiDB = {
    /**
     * @param {string} dataUrl  foto (data:image/jpeg;base64,...)
     * @param {Array} foods     daftar makanan yang boleh dijawab (TC.DATA.FOODS)
     * @returns {{makanan:[{nama,porsi,yakin}], lainnya:string[], bukanMakanan:boolean}}
     */
    async makanan(dataUrl, foods) {
      const k = await fbKlien();
      const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
      if (!m) throw new Error('Foto tidak terbaca.');
      if (m[2].length > MAKS_GAMBAR) throw new Error('Foto terlalu besar.');
      const daftar = (foods || []).filter((x) => x && typeof x.n === 'string').slice(0, 120);
      if (!daftar.length) throw new Error('Daftar makanan kosong.');
      const nama = daftar.map((x) => x.n);
      const S = k.aiM.Schema;

      const prompt =
        'Anda membantu aplikasi pencatat gizi di Indonesia. Kenali makanan dan minuman pada foto.\n' +
        'Pilih HANYA nama dari daftar berikut, dan perkirakan jumlah porsinya (0.5, 1, 1.5, 2, atau 3) ' +
        'relatif terhadap ukuran porsi yang tertulis:\n' +
        daftar.map((x) => `- ${x.n} (1 porsi = 1 ${x.unit || 'porsi'}, ±${x.g || '?'} g)`).join('\n') + '\n' +
        'Makanan yang terlihat tetapi tidak ada di daftar, tulis namanya di "lainnya". ' +
        'Isi "yakin" dengan keyakinan 0–1 per butir. Bila foto bukan makanan, isi bukan_makanan = true ' +
        'dan kosongkan "makanan". Jangan menebak makanan yang tidak terlihat.';

      const skema = S.object({
        properties: {
          makanan: S.array({ items: S.object({
            properties: { nama: S.enumString({ enum: nama }), porsi: S.number(), yakin: S.number() },
            optionalProperties: ['yakin']
          }) }),
          lainnya: S.array({ items: S.string() }),
          bukan_makanan: S.boolean()
        },
        optionalProperties: ['lainnya', 'bukan_makanan']
      });

      const teks = await panggilAI(
        [prompt, { inlineData: { mimeType: m[1], data: m[2] } }],
        { temperature: 0.2, responseMimeType: 'application/json', responseSchema: skema });

      let h;
      try { h = JSON.parse(teks); } catch (e) { throw new Error('Jawaban layanan deteksi tidak dapat dibaca.'); }

      // Validasi ulang: nama harus dari daftar, porsi dibulatkan ke pilihan
      // yang ada di aplikasi, duplikat digabung.
      const gabung = new Map();
      (h.makanan || []).forEach((x) => {
        if (!x || nama.indexOf(x.nama) === -1) return;
        const p = +x.porsi || 1;
        const porsi = PORSI.reduce((a, b) => (Math.abs(b - p) < Math.abs(a - p) ? b : a));
        const yakin = typeof x.yakin === 'number' ? Math.max(0, Math.min(1, x.yakin)) : null;
        const ada = gabung.get(x.nama);
        if (ada) ada.porsi = Math.min(3, ada.porsi + porsi);
        else gabung.set(x.nama, { nama: x.nama, porsi, yakin });
      });
      return {
        makanan: Array.from(gabung.values()),
        lainnya: (h.lainnya || []).filter((x) => typeof x === 'string').map((x) => x.slice(0, 60)).slice(0, 10),
        bukanMakanan: !!h.bukan_makanan
      };
    },

    /**
     * Wawasan TeleCare AI untuk Beranda.
     * @param {object} ringkasan  angka gizi/vital pasien, tanpa nama & email
     * @returns {{judul:string, isi:string}}
     */
    async wawasan(ringkasan) {
      const k = await fbKlien();
      const S = k.aiM.Schema;
      const prompt =
        'Anda adalah "TeleCare AI", asisten edukasi kesehatan di aplikasi pemantauan TeleCare (Indonesia). ' +
        'Berdasarkan ringkasan data pengguna berikut (JSON), tulis satu wawasan singkat yang personal.\n' +
        JSON.stringify(ringkasan || {}).slice(0, 4000) + '\n\n' +
        'Aturan:\n' +
        '- Bahasa Indonesia yang hangat dan mudah dipahami, sapa dengan "Anda".\n' +
        '- "judul": maksimal 8 kata. "isi": 2–3 kalimat, maksimal 60 kata.\n' +
        '- Kaitkan asupan gizi hari ini dengan tujuan kesehatannya (mis. bulking, turun berat, gula stabil) ' +
        'dan target hariannya, serta detak jantung/SpO₂ bila ada. Beri satu saran praktis (mis. makanan yang perlu ditambah).\n' +
        '- Hanya gunakan angka yang ada di data; jangan mengarang angka. Bila data kosong, ajak mencatat makanan atau mengukur dengan TeleBand.\n' +
        '- Jangan mendiagnosis penyakit atau menyarankan obat. Bila detak jantung < 50 atau > 100 bpm saat istirahat, ' +
        'atau SpO₂ < 94%, sarankan ukur ulang dan hubungi tenaga kesehatan bila ada keluhan.\n' +
        '- Tekanan darah dan glukosa TeleBand adalah estimasi eksperimental; jangan dijadikan dasar kesimpulan.';
      const teks = await panggilAI([prompt], {
        temperature: 0.6, responseMimeType: 'application/json',
        responseSchema: S.object({ properties: { judul: S.string(), isi: S.string() } })
      });
      let o;
      try { o = JSON.parse(teks); } catch (e) { throw new Error('Jawaban layanan AI tidak dapat dibaca.'); }
      const judul = String(o.judul || '').trim().slice(0, 80);
      const isi = String(o.isi || '').trim().slice(0, 600);
      if (!judul || !isi) throw new Error('Jawaban kosong.');
      return { judul, isi };
    }
  };

  TC.FB = FB;
  TC.ReadingsDB = ReadingsDB;
  TC.PatientsDB = PatientsDB;
  TC.DeteksiDB = DeteksiDB;
})(window.TC);
