/* ============================================================
   TeleCare App — supabase.js
   Pengganti firebase.js. Nama fungsi TC.FB.*, TC.Chat.*, TC.RTC.*
   dibuat SAMA PERSIS dengan versi Firebase supaya file lain
   (views-auth.js, views-care.js, dst.) tidak perlu diubah.
   ============================================================ */
(function (TC) {
  'use strict';

  /* ============================================================
     0. MENUNGGU SUPABASE CLIENT SIAP
     (supabase-init.js memuat SDK secara asinkron dari CDN)
     ============================================================ */
  function sbClient() {
    if (window.TELECARE_SB) return Promise.resolve(window.TELECARE_SB);
    return new Promise((resolve, reject) => {
      const onReady = () => { cleanup(); resolve(window.TELECARE_SB); };
      const onError = (e) => { cleanup(); reject(new Error((e && e.detail) || 'Supabase gagal dimuat')); };
      function cleanup() {
        window.removeEventListener('telecare:sb-ready', onReady);
        window.removeEventListener('telecare:sb-error', onError);
      }
      window.addEventListener('telecare:sb-ready', onReady);
      window.addEventListener('telecare:sb-error', onError);
      setTimeout(() => { cleanup(); reject(new Error('Waktu tunggu Supabase habis')); }, 10000);
    });
  }

  /* ============================================================
     1. KONEKSI & STATUS
     ============================================================ */
  const FB = {
    ready: false,
    online: false,
    settled: false,
    uid: null,
    sb: null,
    error: null,
    authFatal: null,
    anonymous: false,
    authUser: null,
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

  FB.init = function () {
    if (FB.ready) return;
    FB.ready = true;   // <--  SEBELUM menunggu SDK selesai dimuat.
                        //     Semua fungsi Chat.*/RTC.* sudah dirancang untuk menunggu
                        //     sendiri kalau SDK belum siap, jadi ini aman — yang penting
                        //     kode lain yang mengecek "TC.FB.ready" tidak melewatkan
                        //     pemanggilan gara-gara masalah waktu seperti ini.
    sbClient().then((sb) => {
      FB.sb = sb;

      // Supabase tidak punya ".info/connected" seperti RTDB. Kita pakai
      // channel "heartbeat": begitu statusnya SUBSCRIBED, koneksi dianggap hidup.
      const heartbeat = sb.channel('telecare:heartbeat');
      heartbeat.subscribe((status) => {
        FB.online = (status === 'SUBSCRIBED');
        FB.settled = true;
        emit();
      });
      setTimeout(() => { if (!FB.settled) { FB.settled = true; emit(); } }, 8000);

      sb.auth.onAuthStateChange((_event, session) => {
        const u = session && session.user;
        FB.uid = u ? u.id : null;
        FB.authUser = u || null;
        FB.anonymous = !!(u && u.is_anonymous);
        if (!FB._firstAuthResolved) { FB._firstAuthResolved = true; FB._resolveFirstAuth(u || null); }
        emit();
      });
      FB._firstAuth = new Promise((resolve) => { FB._resolveFirstAuth = resolve; });
      FB.ensureAuth().catch(() => {});
    }).catch((e) => {
      FB.error = e.message;
      FB.ready = false;
      FB.settled = true;
      console.warn('[TeleCare] Supabase tidak aktif:', e.message);
      emit();
    });
  };

  /* ---------------- Sesi wajib untuk menulis ke database ---------------- */
  FB._authOnce = null;

  FB.ensureAuth = function () {
    if (FB._authOnce) return FB._authOnce;

    FB._authOnce = sbClient()
      .then(async (sb) => {
        FB.sb = sb;
        const { data } = await sb.auth.getSession();
        const cur = data && data.session && data.session.user;
        if (cur) return cur;
        const { data: anonData, error } = await sb.auth.signInAnonymously();
        if (error) throw error;
        return anonData.user;
      })
      .then((user) => { FB.authFatal = null; emit(); return user; })
      .catch((err) => {
        FB._authOnce = null;
        const msg = (err && err.message) || '';
        if (/anonymous/i.test(msg)) {
          FB.authFatal = 'Sign-in Anonim belum diaktifkan pada project Supabase. ' +
            'Aktifkan di Supabase Dashboard → Authentication → Sign In / Providers → Anonymous Sign-ins.';
        } else {
          FB.authFatal = FB.authError(err);
        }
        console.warn('[TeleCare] sesi Supabase gagal:', FB.authFatal);
        emit();
        throw err;
      });

    return FB._authOnce;
  };

  FB.canSync = function () {
    return !!(FB.ready && FB.online && FB.uid && !FB.authFatal);
  };

  FB.waitOnline = function (ms) {
    if (FB.online) return Promise.resolve(true);
    if (!FB.ready) return Promise.resolve(false);
    return new Promise((resolve) => {
      let done = false;
      const off = FB.onStatus((s) => {
        if (s.online && !done) { done = true; off(); resolve(true); }
      });
      setTimeout(() => { if (!done) { done = true; off(); resolve(false); } }, ms || 7000);
    });
  };

  /* ---------------- Masuk dengan Google ---------------- */
  FB.googleAvailable = () => FB.ready;

  FB.signInGoogle = function () {
    return sbClient().then(async (sb) => {
      const { data } = await sb.auth.getSession();
      const cur = data && data.session && data.session.user;
      if (cur && cur.is_anonymous) {
        // Lepas dulu sesi tamu — supaya Google membuat sesi BARU yang bersih,
        // bukan "menautkan" ke sesi anonim yang datanya belum lengkap ter-refresh.
        await sb.auth.signOut();
      }
      return sb.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + window.location.pathname,
          queryParams: { prompt: 'select_account' }
        }
      });
    }).then(() => null);
  };

  FB.redirectResult = function () {
    return sbClient()
      .then((sb) => sb.auth.getSession())
      .then(({ data }) => {
        const u = data && data.session && data.session.user;
        // Sesi anonim (mode Tamu) BUKAN hasil login Google — jangan pernah
        // dianggap sebagai "baru saja login Google", walau sesi itu sedang aktif.
        if (!u || u.is_anonymous) return null;
        return u;
      })
      .catch(() => null);
  };

  FB.signOut = function () {
    FB._authOnce = null;
    if (!FB.googleAvailable()) return Promise.resolve();
    return FB.sb.auth.signOut()
      .then(() => FB.ensureAuth().catch(() => null))
      .catch(() => null);
  };

  /* ---------------- Masuk admin (email + kata sandi) ----------------
     Admin = pengguna Supabase Auth yang tercatat di tabel `admins`
     (supabase/migrations/20260927_admins.sql). Status admin selalu
     ditanyakan ke server (saya_admin); akun yang bukan admin langsung
     dikeluarkan lagi supaya sesinya tidak tertinggal. */
  FB.signInAdmin = async function (email, pass) {
    const sb = await sbClient();
    FB.sb = sb;
    const { data, error } = await sb.auth.signInWithPassword({ email: String(email || '').trim(), password: pass });
    if (error) throw error;
    const { data: admin, error: e2 } = await sb.rpc('saya_admin');
    if (e2 || !admin) {
      await sb.auth.signOut();
      FB._authOnce = null;
      FB.ensureAuth().catch(() => null);
      if (e2) throw e2;
      const e = new Error('Akun ini bukan akun admin.');
      e.code = 'BUKAN_ADMIN';
      throw e;
    }
    FB._authOnce = Promise.resolve(data.user);
    return data.user;
  };

  /**
   * Apakah sesi Supabase saat ini milik akun admin? Dipakai halaman pasien
   * untuk MENOLAK akun admin (Supabase menggabungkan akun berdasarkan email,
   * jadi admin bisa saja masuk lewat Google dengan email yang sama).
   * Galat (mis. migrasi belum dijalankan = belum ada admin) dianggap bukan admin.
   */
  FB.cekAdmin = async function () {
    try {
      const sb = await sbClient();
      const { data, error } = await sb.rpc('saya_admin');
      return !error && data === true;
    } catch (e) { return false; }
  };

  FB.authError = function (err) {
    const msg = (err && err.message) || '';
    if (/provider is not enabled/i.test(msg)) {
      return 'Metode masuk Google belum diaktifkan pada project Supabase. ' +
             'Aktifkan di Supabase Dashboard → Authentication → Providers → Google.';
    }
    if (/network/i.test(msg)) return 'Jaringan bermasalah. Coba lagi.';
    return msg || 'Masuk dengan Google gagal.';
  };

  /* ---------------- Kehadiran dokter (terpusat, 1 channel per percakapan,
    dipakai bersama oleh presence() dan watchPresence() supaya tidak
    bentrok subscribe ke topik yang sama) ---------------- */
  FB._presenceRegistry = new Map(); // consultId -> { ch, subs, subscribed, wantTrack }

  function getPresenceEntry(sb, consultId) {
    let entry = FB._presenceRegistry.get(consultId);
    if (entry) return entry;

    const ch = sb.channel('presence:consult:' + consultId, {
      config: { presence: { key: FB.uid || ('anon-' + Math.random().toString(36).slice(2)) } }
    });
    entry = { ch, subs: new Set(), subscribed: false, wantTrack: false };
    FB._presenceRegistry.set(consultId, entry);

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState();
      const dokterHadir = Object.values(state).some((list) => list.some((e) => e.role === 'dokter'));
      entry.subs.forEach((cb) => { try { cb(dokterHadir); } catch (e) {} });
    });

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        entry.subscribed = true;
        if (entry.wantTrack) await ch.track({ role: 'dokter', at: Date.now() });
      }
    });

    return entry;
  }

  FB.presence = function (consultId, role) {
    if (role !== 'dokter') return () => {};
    let stopped = false;
    function attach(sb) {
      if (stopped) return;
      const entry = getPresenceEntry(sb, consultId);
      entry.wantTrack = true;
      if (entry.subscribed) entry.ch.track({ role: 'dokter', at: Date.now() });
    }
    if (FB.sb) attach(FB.sb); else sbClient().then(attach).catch((e) => {
      console.warn('[TeleCare] presence gagal:', e.message);
    });
    return () => {
      stopped = true;
      const entry = FB._presenceRegistry.get(consultId);
      if (entry) { entry.wantTrack = false; try { entry.ch.untrack(); } catch (e) {} }
    };
  };

  FB.watchPresence = function (consultId, fn) {
    let stopped = false;
    function attach(sb) {
      if (stopped) return;
      const entry = getPresenceEntry(sb, consultId);
      entry.subs.add(fn);
      if (entry.subscribed) {
        const state = entry.ch.presenceState();
        const dokterHadir = Object.values(state).some((list) => list.some((e) => e.role === 'dokter'));
        fn(dokterHadir);
      }
    }
    if (FB.sb) attach(FB.sb); else sbClient().then(attach).catch((e) => {
      console.warn('[TeleCare] watchPresence gagal:', e.message);
    });
    return () => {
      stopped = true;
      const entry = FB._presenceRegistry.get(consultId);
      if (entry) {
        entry.subs.delete(fn);
        if (entry.subs.size === 0 && !entry.wantTrack) {
          if (FB.sb) FB.sb.removeChannel(entry.ch);
          FB._presenceRegistry.delete(consultId);
        }
      }
    };
};

  /* ============================================================
     2. CHAT — pesan konsultasi, sekarang di tabel Postgres
     (pengganti node consults/{id}/messages di RTDB)
     ============================================================ */

  /** Baris tabel messages → bentuk pesan yang dipakai engine.js. */
  function dariBaris(v) {
    const m = { key: v.id, at: new Date(v.at).getTime(), uid: v.uid, from: v.from_role, text: v.text, mid: v.mid };
    if (v.kind) m.kind = v.kind;
    if (v.data != null) m.data = v.data;
    return m;
  }

  // Kolom `kind` dan `data` ditambahkan belakangan (lihat
  // supabase/migrations). Bila migrasinya belum dijalankan, PostgREST
  // menolak INSERT dengan PGRST204; pesan lalu dikirim tanpa kedua kolom
  // itu — `text` tetap berisi ringkasan terbaca, jadi tidak tampil kosong.
  let kolomKartu = true;
  const kolomTakAda = (e) => e && (e.code === 'PGRST204' || e.code === '42703');

  const Chat = {
    _joined: Object.create(null),
    dariBaris,

    /** Mendaftarkan diri sebagai anggota (baris di tabel consult_members). */
  join(consultId) {
    return FB.ensureAuth().then(async (user) => {
      const key = user.id + '@' + consultId;
      if (Chat._joined[key]) return Chat._joined[key];
      Chat._joined[key] = FB.sb.from('consult_members')
        .insert({ consult_id: consultId, user_id: user.id })
        .then(({ error }) => {
          // 23505 = "sudah pernah jadi anggota" — bukan error sungguhan, abaikan saja
          if (error && error.code !== '23505') { delete Chat._joined[key]; throw error; }
          return true;
        });
      return Chat._joined[key];
    });
  },

    _forget(consultId) {
      if (!FB.uid) return;
      delete Chat._joined[FB.uid + '@' + consultId];
    },

    /** Menuliskan metadata percakapan bila belum ada (baris di tabel consults). */
    ensure(consultId, meta) {
      return FB.ensureAuth().then(async () => {
        const { error: cErr } = await FB.sb.from('consults').insert({
          id: consultId,
          doctor_id: meta.doctorId,
          mode: meta.mode || 'chat',
          started_at: new Date(meta.startedAt || Date.now()).toISOString(),
          status: 'active'
        });
        // 23505 = percakapan ini sudah pernah dibuat (misal oleh sisi lain) — bukan error sungguhan
        if (cErr && cErr.code !== '23505') throw cErr;

        await Chat.join(consultId);
        return true;
      }).catch((e) => {
        console.warn('[TeleCare] gagal menyiapkan percakapan:', e.message);
        return false;
      });
    },

    /** Mendengarkan pesan baru lewat Postgres Changes (setara child_added). */
    subscribe(consultId, onMessage) {
      let ch = null;
      let stopped = false;
      const topik = 'messages:' + consultId + ':' + Date.now() + '-' + Math.random().toString(36).slice(2);
      Chat.join(consultId).then(async () => {
        if (stopped) return;

        // Kejar riwayat yang sudah ada dulu, SEKALI SAJA — postgres_changes
        // cuma menyiarkan yang benar-benar baru SETELAH baris ini, beda
        // dengan child_added Firebase yang otomatis ikut mengirim riwayat.
        try {
          const { data: lama } = await FB.sb.from('messages').select('*')
            .eq('consult_id', consultId).order('at', { ascending: true });
          (lama || []).forEach((v) => onMessage(dariBaris(v)));
        } catch (e) { /* abaikan, tetap lanjut dengar yang baru */ }

        if (stopped) return;
        ch = FB.sb.channel(topik)
          .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'messages',
            filter: 'consult_id=eq.' + consultId
          }, (payload) => onMessage(dariBaris(payload.new)))
          .subscribe();
      }).catch((e) => {
        console.warn('[TeleCare] tidak dapat mengikuti percakapan:', e.message);
      });
      return () => { stopped = true; if (ch) FB.sb.removeChannel(ch); };
    },

    /** Mengirim satu pesan (INSERT ke tabel messages). */
    send(consultId, msg) {
      return Chat.join(consultId).then(async () => {
        const baris = {
          consult_id: consultId,
          uid: FB.uid,
          from_role: msg.from,
          text: msg.text,
          mid: msg.mid || null
        };
        const kartu = !!(msg.kind || msg.data != null);
        if (kartu && kolomKartu) {
          const { error } = await FB.sb.from('messages')
            .insert(Object.assign({ kind: msg.kind || null, data: msg.data == null ? null : msg.data }, baris));
          if (!error) return;
          if (!kolomTakAda(error)) throw error;
          kolomKartu = false;
          console.warn('[TeleCare] kolom messages.kind/data belum ada — jalankan migrasi di supabase/migrations.');
        }
        const { error } = await FB.sb.from('messages').insert(baris);
        if (error) throw error;
      });
    },

    /** Mengambil metadata percakapan (dipakai saat membuka tautan undangan). */
    meta(consultId) {
      return Chat.join(consultId)
        .then(async () => {
          const { data } = await FB.sb.from('consults').select('*').eq('id', consultId).maybeSingle();
          if (data && data.doctor_id) {
            return { doctorId: data.doctor_id, mode: data.mode, startedAt: new Date(data.started_at).getTime(), status: data.status };
          }
          if (FB.uid) {
            await FB.sb.from('consult_members').delete().eq('consult_id', consultId).eq('user_id', FB.uid);
            Chat._forget(consultId);
          }
          return null;
        })
        .catch(() => null);
    },

    setStatus(consultId, status) {
      FB.ensureAuth().then(() => FB.sb.from('consults').update({ status }).eq('id', consultId)).catch(() => {});
    }
  };

  /* ============================================================
     2b. HASIL UKUR PERANGKAT — tabel device_readings
     (supabase/migrations/20260925_device_readings.sql)
     ============================================================ */
  const ReadingsDB = {
    /**
     * Menyimpan satu hasil. Duplikat (serial + id + epoch yang sama) dianggap
     * BERHASIL — artinya hasil itu memang sudah ada di server, jadi alat
     * boleh menghapusnya. Melempar galat bila penyimpanan gagal.
     */
    async simpan(row) {
      const user = await FB.ensureAuth();
      const { error } = await FB.sb.from('device_readings')
        .upsert(Object.assign({ user_id: user.id }, row), {
          onConflict: 'user_id,device_serial,device_result_id,device_epoch',
          ignoreDuplicates: true
        });
      if (error) throw error;
      return true;
    },

    /**
     * Hasil milik beberapa pengguna sekaligus (satu kueri), terbaru dulu.
     * RLS server yang menentukan baris mana yang boleh terbaca.
     */
    async daftarBanyak(userIds, batas) {
      await FB.ensureAuth();
      if (!userIds || !userIds.length) return [];
      const { data, error } = await FB.sb.from('device_readings').select('*')
        .in('user_id', userIds)
        .order('measured_at', { ascending: false, nullsFirst: false })
        .order('received_at', { ascending: false })
        .limit(batas || 1000);
      if (error) throw error;
      return data || [];
    },

    /** Hasil ukur terbaru dari semua pengguna yang boleh dibaca (admin: semuanya). */
    async terbaru(batas) {
      await FB.ensureAuth();
      const { data, error } = await FB.sb.from('device_readings').select('*')
        .order('received_at', { ascending: false })
        .limit(batas || 2000);
      if (error) throw error;
      return data || [];
    },

    /** Hasil milik pengguna tertentu (bawaan: diri sendiri), terbaru dulu. */
    async daftar(userId, batas) {
      const user = await FB.ensureAuth();
      const { data, error } = await FB.sb.from('device_readings').select('*')
        .eq('user_id', userId || user.id)
        .order('measured_at', { ascending: false, nullsFirst: false })
        .order('received_at', { ascending: false })
        .limit(batas || 50);
      if (error) throw error;
      return data || [];
    }
  };

  /* ============================================================
     2c. HUBUNGAN DOKTER–PASIEN — tabel care_invites & care_links
     (supabase/migrations/20260926_care_links.sql)
     ============================================================ */
  // Tanpa huruf/angka yang mudah tertukar (0/O, 1/I/L).
  const ABJAD_KODE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  function kodeAcak() {
    const b = new Uint8Array(6);
    crypto.getRandomValues(b);
    return Array.from(b, (x) => ABJAD_KODE[x % ABJAD_KODE.length]).join('');
  }

  /** Galat "tabel/fungsi belum ada" — migrasi belum dijalankan. */
  function belumDimigrasi(e) {
    const c = e && e.code;
    return c === '42P01' || c === 'PGRST205' || c === 'PGRST202' || c === '42883';
  }

  const CareDB = {
    belumDimigrasi,

    /** Kode dokter milik saya, atau null. */
    async kodeSaya() {
      const user = await FB.ensureAuth();
      const { data, error } = await FB.sb.from('care_invites').select('code')
        .eq('doctor_id', user.id).maybeSingle();
      if (error) throw error;
      return data ? data.code : null;
    },

    /** Membuat kode baru (kode lama tidak berlaku lagi). */
    async buatKode(namaDokter) {
      const user = await FB.ensureAuth();
      await FB.sb.from('care_invites').delete().eq('doctor_id', user.id);
      for (let i = 0; i < 5; i++) {
        const code = kodeAcak();
        const { error } = await FB.sb.from('care_invites')
          .insert({ code, doctor_id: user.id, doctor_name: String(namaDokter || 'Dokter').slice(0, 80) });
        if (!error) return code;
        if (error.code !== '23505') throw error;   // 23505: kode bentrok, coba lagi
      }
      throw new Error('Gagal membuat kode unik. Coba lagi.');
    },

    /** Pasien menukarkan kode dokter. Mengembalikan nama dokter. */
    async hubungkan(kode, namaPasien) {
      await FB.ensureAuth();
      const { data, error } = await FB.sb.rpc('hubungkan_dokter',
        { p_kode: String(kode || '').trim().toUpperCase(), p_nama: String(namaPasien || '').slice(0, 80) });
      if (error) throw error;
      return data;
    },

    /** Dokter yang terhubung dengan saya (sisi pasien). */
    async dokterSaya() {
      const user = await FB.ensureAuth();
      const { data, error } = await FB.sb.from('care_links').select('*')
        .eq('patient_id', user.id).order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    /** Pasien yang terhubung dengan saya (sisi dokter). */
    async pasienSaya() {
      const user = await FB.ensureAuth();
      const { data, error } = await FB.sb.from('care_links').select('*')
        .eq('doctor_id', user.id).order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async putus(patientId, doctorId) {
      await FB.ensureAuth();
      const { error } = await FB.sb.from('care_links').delete()
        .eq('patient_id', patientId).eq('doctor_id', doctorId);
      if (error) throw error;
      return true;
    }
  };

  /* ============================================================
     2d. UNIT FASKES — tabel facilities & facility_members
     (supabase/migrations/20260926_facilities.sql)
     ============================================================ */
  /* ============================================================
     2e. DETEKSI MAKANAN — Edge Function `deteksi-makanan` (Gemini)
     (supabase/functions/deteksi-makanan/index.ts)
     ============================================================ */
  const DeteksiDB = {
    /**
     * @param {string} dataUrl  foto JPEG (data:image/jpeg;base64,...)
     * @param {Array} foods     daftar makanan yang boleh dijawab (TC.DATA.FOODS)
     * @returns {{makanan:[{nama,porsi,yakin}], lainnya:string[], bukanMakanan:boolean}}
     */
    async makanan(dataUrl, foods) {
      await FB.ensureAuth();
      const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(dataUrl || '');
      if (!m) throw new Error('Foto tidak terbaca.');
      const { data, error } = await FB.sb.functions.invoke('deteksi-makanan', {
        body: { mime: m[1], image: m[2], foods: foods.map((f) => ({ n: f.n, unit: f.unit, g: f.g })) }
      });
      if (error) {
        // Pesan dari fungsi (mis. kunci Gemini belum disetel) ada di badan respons.
        let pesan = error.message;
        try { const b = await error.context.json(); if (b && b.error) pesan = b.error; } catch (e) { /* abaikan */ }
        throw new Error(pesan);
      }
      if (data && data.error) throw new Error(data.error);
      return data;
    }
  };

  /* ============================================================
     2f. DAFTAR PASIEN — tabel patients (20260928_patients.sql)
     Pasien mendaftarkan dirinya otomatis saat masuk; admin membaca semuanya.
     ============================================================ */
  const PatientsDB = {
    async daftarkan(nama, email) {
      const user = await FB.ensureAuth();
      const { error } = await FB.sb.from('patients').upsert({
        user_id: user.id,
        name: String(nama || 'Pasien').trim().slice(0, 80) || 'Pasien',
        email: email ? String(email).slice(0, 120) : null,
        anonymous: !!user.is_anonymous,
        last_seen: new Date().toISOString()
      }, { onConflict: 'user_id' });
      if (error) throw error;
      return true;
    },

    /** Semua pasien (hanya berhasil untuk admin), terakhir aktif lebih dulu. */
    async semua(batas) {
      await FB.ensureAuth();
      const { data, error } = await FB.sb.from('patients').select('*')
        .order('last_seen', { ascending: false }).limit(batas || 1000);
      if (error) throw error;
      return data || [];
    }
  };

  const FacilityDB = {
    /** Unit yang saya kelola (sisi admin faskes), atau null. */
    async milikSaya() {
      const user = await FB.ensureAuth();
      const { data, error } = await FB.sb.from('facilities').select('*')
        .eq('admin_id', user.id).maybeSingle();
      if (error) throw error;
      return data || null;
    },

    /** Membuat unit baru beserta kodenya. */
    async buat(unit) {
      const user = await FB.ensureAuth();
      for (let i = 0; i < 5; i++) {
        const { data, error } = await FB.sb.from('facilities').insert({
          admin_id: user.id,
          name: String(unit.name || '').trim().slice(0, 80),
          kind: String(unit.kind || 'Lainnya').slice(0, 40),
          city: String(unit.city || '').trim().slice(0, 60),
          code: kodeAcak()
        }).select('*').single();
        if (!error) return data;
        // 23505 pada kolom code: kode bentrok, coba lagi. Pada admin_id:
        // akun ini sudah punya unit — lempar apa adanya.
        if (error.code !== '23505' || /admin_id/.test(error.message || '')) throw error;
      }
      throw new Error('Gagal membuat kode unit yang unik. Coba lagi.');
    },

    /** Mengganti kode unit; keanggotaan yang ada tidak berubah. */
    async gantiKode(facilityId) {
      await FB.ensureAuth();
      for (let i = 0; i < 5; i++) {
        const code = kodeAcak();
        const { error } = await FB.sb.from('facilities').update({ code }).eq('id', facilityId);
        if (!error) return code;
        if (error.code !== '23505') throw error;
      }
      throw new Error('Gagal membuat kode unit yang unik. Coba lagi.');
    },

    /** Seluruh anggota & nakes sebuah unit (sisi admin). */
    async anggota(facilityId) {
      await FB.ensureAuth();
      const { data, error } = await FB.sb.from('facility_members').select('*')
        .eq('facility_id', facilityId).order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async keluarkan(facilityId, userId) {
      await FB.ensureAuth();
      const { error } = await FB.sb.from('facility_members').delete()
        .eq('facility_id', facilityId).eq('user_id', userId);
      if (error) throw error;
      return true;
    },

    /** Pasien/dokter menukarkan kode unit. Mengembalikan nama unit. */
    async gabung(kode, nama, peran) {
      await FB.ensureAuth();
      const { data, error } = await FB.sb.rpc('gabung_unit', {
        p_kode: String(kode || '').trim().toUpperCase(),
        p_nama: String(nama || '').slice(0, 80),
        p_peran: peran === 'dokter' ? 'dokter' : 'pasien'
      });
      if (error) throw error;
      return data;
    },

    /** Unit tempat saya menjadi anggota/nakes. */
    async unitSaya() {
      const user = await FB.ensureAuth();
      const { data, error } = await FB.sb.from('facility_members').select('*')
        .eq('user_id', user.id).order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async keluar(facilityId) {
      const user = await FB.ensureAuth();
      return FacilityDB.keluarkan(facilityId, user.id);
    }
  };

  /* ============================================================
     3. WEBRTC — panggilan suara/video
     Sinyal (offer/answer/ICE) yang dulu ditulis ke node rooms/{id}
     di RTDB, sekarang lewat Realtime Broadcast (data lewat sebentar
     lalu hilang, tidak perlu disimpan permanen).
     ============================================================ */
  const STUN_CADANGAN = [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
    'stun:stun.services.mozilla.com'
  ];

  const RTC = {
    supported() {
      return !!(window.RTCPeerConnection && navigator.mediaDevices &&
                navigator.mediaDevices.getUserMedia);
    },

    config() {
      return window.TELECARE_RTC || {};
    },

    turnDariPengaturan() {
      const st = TC.Store && TC.Store.state;
      const t = st && st.settings && st.settings.turn;
      if (!t || !t.urls) return null;
      const urls = String(t.urls).split(',').map((u) => u.trim()).filter(Boolean);
      if (!urls.length) return null;
      const s = { urls };
      if (t.username) s.username = t.username;
      if (t.credential) s.credential = t.credential;
      return s;
    },

    async turnDariEndpoint() {
      const url = RTC.config().fetchFrom;
      if (!url) return [];
      try {
        const res = await fetch(url, { credentials: 'omit' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const j = await res.json();
        if (Array.isArray(j.iceServers)) return j.iceServers;
        if (j.urls) return [j];
        return [];
      } catch (e) {
        console.warn('[TeleCare] penerbit TURN tidak terjangkau:', e.message);
        return [];
      }
    },

    async turnAktif() {
      const dariPengaturan = RTC.turnDariPengaturan();
      if (dariPengaturan) return [dariPengaturan];
      const dariEndpoint = await RTC.turnDariEndpoint();
      if (dariEndpoint.length) return dariEndpoint;
      const statis = RTC.config().servers;
      return Array.isArray(statis) ? statis.filter((s) => s && s.urls) : [];
    },

    turnTersedia() {
      if (RTC.turnDariPengaturan()) return true;
      if (RTC.config().fetchFrom) return true;
      const s = RTC.config().servers;
      return !!(Array.isArray(s) && s.some((x) => x && x.urls));
    },

    async rtcConfig() {
      const cfg = RTC.config();
      const stun = Array.isArray(cfg.stun) && cfg.stun.length ? cfg.stun : STUN_CADANGAN;
      const turn = await RTC.turnAktif();
      const out = {
        iceServers: [{ urls: stun }].concat(turn),
        iceCandidatePoolSize: 8
      };
      if (cfg.paksaRelay && turn.length) out.iceTransportPolicy = 'relay';
      return out;
    },

    async diagnose(timeoutMs) {
      if (!window.RTCPeerConnection) {
        return { didukung: false, alasan: 'Peramban ini tidak mendukung WebRTC.' };
      }
      const cfg = await RTC.rtcConfig();
      const pc = new RTCPeerConnection(cfg);
      const jenis = { host: 0, srflx: 0, prflx: 0, relay: 0 };
      const protokolRelay = new Set();

      try {
        pc.createDataChannel('probe');
        await new Promise((resolve) => {
          let selesai = false;
          const tutup = () => { if (!selesai) { selesai = true; resolve(); } };

          pc.onicecandidate = (ev) => {
            if (!ev.candidate) { tutup(); return; }
            const c = ev.candidate;
            const t = c.type || (c.candidate.split(' ')[7]);
            if (t && jenis[t] !== undefined) jenis[t]++;
            if (t === 'relay') protokolRelay.add(c.protocol || '?');
          };
          pc.onicegatheringstatechange = () => {
            if (pc.iceGatheringState === 'complete') tutup();
          };

          pc.createOffer()
            .then((o) => pc.setLocalDescription(o))
            .catch((e) => { console.warn('[TeleCare] diagnosa ICE gagal:', e.message); tutup(); });

          setTimeout(tutup, timeoutMs || 8000);
        });
      } finally {
        try { pc.close(); } catch (e) { /* abaikan */ }
      }

      const adaTurn = RTC.turnTersedia();
      return {
        didukung: true,
        jenis,
        turnDikonfigurasi: adaTurn,
        relayBerhasil: jenis.relay > 0,
        protokolRelay: Array.from(protokolRelay),
        jumlahServer: cfg.iceServers.length,
        ringkasan: !adaTurn
          ? 'TURN belum dikonfigurasi — panggilan dapat gagal di balik NAT ketat.'
          : (jenis.relay > 0
              ? 'TURN bekerja: kandidat relay diperoleh, panggilan dapat menembus NAT ketat.'
              : 'TURN dikonfigurasi tetapi tidak menghasilkan kandidat relay — periksa alamat, port, dan kredensial.')
      };
    },

    /**
     * Bergabung ke ruang panggilan lewat Realtime Broadcast + Presence.
     * Pola: siapa pun yang MELIHAT peserta lain sudah lebih dulu hadir
     * (lewat presence sync) otomatis jadi "caller" dan mengirim offer duluan.
     */
    async join(roomId, opts, on) {
      on = on || {};
      const wantVideo = opts.video !== false;

      if (!RTC.supported()) throw new Error('Peramban ini tidak mendukung WebRTC.');

      const local = await navigator.mediaDevices.getUserMedia({
        video: wantVideo ? { facingMode: 'user' } : false,
        audio: true
      });
      if (on.onLocal) on.onLocal(local);

      const pc = new RTCPeerConnection(await RTC.rtcConfig());
      local.getTracks().forEach((t) => pc.addTrack(t, local));

      const remote = new MediaStream();
      pc.ontrack = (ev) => {
        ev.streams[0].getTracks().forEach((t) => remote.addTrack(t));
        if (on.onRemote) on.onRemote(remote);
      };
      pc.onconnectionstatechange = () => {
        if (on.onState) on.onState(pc.connectionState);
      };

      const linked = FB.sb ? await FB.waitOnline(7000) : false;
      if (linked) {
        try { await Chat.join(roomId); }
        catch (e) { console.warn('[TeleCare] sesi panggilan tidak sah:', e.message); }
      }
      if (!FB.sb || !linked) {
        if (on.onRole) on.onRole('solo');
        return session(pc, local, remote, null, [], 'solo');
      }

      const myPeerId = FB.uid + ':' + Math.random().toString(36).slice(2, 8);
      const ch = FB.sb.channel('call:' + roomId, { config: { presence: { key: myPeerId }, broadcast: { self: false } } });

      // Dipisah sengaja: "akuDuluan" adalah peran PRODUK (siapa yang
      // memulai/mendering panggilan — selalu pasien yang masuk duluan),
      // beda dari "siapa yang secara teknis mengirim offer WebRTC lebih
      // dulu" (itu ditentukan sendiri di bawah, berdasarkan siapa yang
      // baru datang & melihat orang lain sudah menunggu).
      let offerSent = false;
      let pengirimOffer = false;
      let peranDilaporkan = false;
      const offs = [];

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          ch.send({ type: 'broadcast', event: 'ice', payload: { from: myPeerId, candidate: ev.candidate.toJSON() } });
        }
      };

      ch.on('broadcast', { event: 'offer' }, async ({ payload }) => {
        if (payload.from === myPeerId || pc.currentRemoteDescription) return;
        await pc.setRemoteDescription(new RTCSessionDescription({ type: payload.type, sdp: payload.sdp }));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ch.send({ type: 'broadcast', event: 'answer', payload: { from: myPeerId, sdp: answer.sdp, type: answer.type } });
      });

      ch.on('broadcast', { event: 'answer' }, async ({ payload }) => {
        if (!pengirimOffer || pc.currentRemoteDescription) return;
        try { await pc.setRemoteDescription(new RTCSessionDescription({ type: payload.type, sdp: payload.sdp })); }
        catch (e) { console.warn('[TeleCare] answer ditolak:', e.message); }
      });

      ch.on('broadcast', { event: 'ice' }, async ({ payload }) => {
        if (payload.from === myPeerId) return;
        try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); }
        catch (e) { /* kandidat usang, abaikan */ }
      });
      
      ch.on('broadcast', { event: 'bye' }, () => {
        if (on.onState) on.onState('peer-left');
      });

      /**
       * Dipanggil BERULANG KALI (bukan cuma sekali) setiap ada perubahan
       * presence — supaya tidak ada celah waktu di mana kedua sisi
       * kebetulan sama-sama menyimpulkan "sendirian" dan tidak ada yang
       * pernah mengirim offer sama sekali.
       */
      function cobaSinyal() {
        const state = ch.presenceState();
        const others = Object.keys(state).filter((k) => k !== myPeerId);

        if (!peranDilaporkan) {
          peranDilaporkan = true;
          // "caller" = sayalah yang memulai/mendering panggilan ini
          // (dipakai views-care.js untuk memanggil deringkanDokter()).
          if (on.onRole) on.onRole(others.length ? 'callee' : 'caller');
        }

        if (!others.length || offerSent || pc.currentRemoteDescription) return;

        // Kalau KEDUANYA baru saling "melihat" di waktu yang hampir
        // bersamaan, keduanya akan sampai ke titik ini. Supaya cuma SATU
        // yang benar-benar mengirim offer (bukan dua-duanya, atau tidak
        // ada sama sekali), dipakai aturan pasti: id yang lebih kecil
        // (perbandingan teks) yang mengirim, siapa pun itu.
        const lawan = others[0];
        if (myPeerId < lawan) {
          offerSent = true;
          pengirimOffer = true;
          (async () => {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ch.send({ type: 'broadcast', event: 'offer', payload: { from: myPeerId, sdp: offer.sdp, type: offer.type } });
          })();
        }
        // Kalau bukan giliran saya (id saya lebih besar), tidak melakukan
        // apa-apa — nanti tetap menerima offer dari lawan lewat listener
        // 'offer' di atas.
      }

      ch.on('presence', { event: 'sync' }, cobaSinyal);

      await new Promise((resolve) => {
        ch.subscribe(async (status) => {
          if (status !== 'SUBSCRIBED') return;
          await ch.track({ joinedAt: Date.now() });
          cobaSinyal(); // coba langsung, jaga-jaga lawan sudah ada saat ini juga
          resolve();
        });
      });

      offs.push(() => FB.sb.removeChannel(ch));

      return session(pc, local, remote, ch, offs, 'menunggu');
    },

    /** Broadcast tidak menyimpan data permanen, jadi tidak ada yang perlu dihapus. */
    clearRoom(roomId) {
      // sengaja dikosongkan — dipertahankan agar kode lama yang memanggil ini tidak error
    }
  };

  function session(pc, local, remote, channel, offs, role) {
    return {
      pc, local, remote, role,

      async jalurTerpakai() {
        try {
          const stats = await pc.getStats();
          let pair = null;
          const kandidat = new Map();
          stats.forEach((r) => {
            if (r.type === 'local-candidate' || r.type === 'remote-candidate') {
              kandidat.set(r.id, r);
            }
            if (r.type === 'candidate-pair' && (r.selected || r.state === 'succeeded')) {
              if (!pair || r.selected) pair = r;
            }
          });
          if (!pair) return null;
          const l = kandidat.get(pair.localCandidateId);
          const j = kandidat.get(pair.remoteCandidateId);
          const lt = l && (l.candidateType || l.type);
          const jt = j && (j.candidateType || j.type);
          return { lokal: lt || null, jauh: jt || null, viaTurn: lt === 'relay' || jt === 'relay' };
        } catch (e) {
          return null;
        }
      },
      toggleAudio(on) { local.getAudioTracks().forEach((t) => { t.enabled = on; }); },
      toggleVideo(on) { local.getVideoTracks().forEach((t) => { t.enabled = on; }); },
      async switchCamera() {
        const vt = local.getVideoTracks()[0];
        if (!vt) return false;
        const cur = vt.getSettings().facingMode === 'environment' ? 'user' : 'environment';
        try {
          const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: cur }, audio: false });
          const nt = s.getVideoTracks()[0];
          const sender = pc.getSenders().find((x) => x.track && x.track.kind === 'video');
          if (sender) await sender.replaceTrack(nt);
          vt.stop();
          local.removeTrack(vt);
          local.addTrack(nt);
          return true;
        } catch (e) { return false; }
      },
      hangup(removeRoom) {
        // Beri tahu lawan bicara SECARA EKSPLISIT bahwa panggilan diakhiri
        // dari sisi ini — supaya layarnya langsung tertutup, bukan menunggu
        // WebRTC "menebak" lewat gejala koneksi terputus (bisa lama/tidak pasti).
        if (channel) {
          try { channel.send({ type: 'broadcast', event: 'bye', payload: {} }); } catch (e) {}
        }
        offs.forEach((f) => { try { f(); } catch (e) {} });
        try { pc.getSenders().forEach((s) => s.track && s.track.stop()); } catch (e) {}
        try { local.getTracks().forEach((t) => t.stop()); } catch (e) {}
        try { pc.close(); } catch (e) {}
      }
    };
  }

  TC.FB = FB;
  TC.Chat = Chat;
  TC.RTC = RTC;
  TC.ReadingsDB = ReadingsDB;
  TC.CareDB = CareDB;
  TC.FacilityDB = FacilityDB;
  TC.DeteksiDB = DeteksiDB;
  TC.PatientsDB = PatientsDB;
})(window.TC);