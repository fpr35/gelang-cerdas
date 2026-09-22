/* ============================================================
   TeleCare App — ring.js
   Panggilan masuk: dokter berdering ketika pasien memanggil.

   ARSITEKTUR (Supabase):
   - "Dokter sedang jaga" ditandai lewat Realtime PRESENCE pada
     kanal `duty:{doctorId}` — begitu koneksi dokter putus (tab
     ditutup, sinyal hilang), status itu otomatis hilang tanpa
     perlu kode pembersih manual.
   - Kotak masuk panggilan memakai tabel `inbox` (Postgres),
     didengarkan lewat `postgres_changes` — setara `child_added`
     di Realtime Database dulu.

   KENAPA KOTAK MASUK DIKUNCI PER USER ID
   Entri panggilan memuat `consultId`, dan siapa pun yang memegang
   consultId dapat bergabung ke percakapan itu. Dengan mengunci
   baris `inbox` per `to_uid` lewat RLS (`auth.uid() = to_uid`),
   cuma pemilik akun itu yang bisa membacanya.
   ============================================================ */
(function (TC) {
  'use strict';

  const FB = TC.FB;

  // Berapa lama panggilan berdering sebelum dianggap tidak dijawab.
  const TIMEOUT_MS = 45000;
  // Entri yang lebih tua dari ini diabaikan: sisa sesi lama yang belum
  // terbersihkan tidak boleh membuat perangkat berdering saat dibuka.
  const KEDALUWARSA_MS = 60000;

  /** Menunggu sesi & SDK Supabase siap, lalu kembalikan client-nya. */
  async function sbReady() {
    await FB.ensureAuth();
    return FB.sb;
  }

  /* ============================================================
     1. NADA DERING
     (tidak berubah sama sekali dari versi sebelumnya)
     ============================================================ */
  const nada = {
    ctx: null,
    timer: null,
    aktif: false,
    diblokir: false,

    _ctxBaru() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!nada.ctx) nada.ctx = new AC();
      return nada.ctx;
    },

    _ketuk(mulaiDetik) {
      const ctx = nada.ctx;
      if (!ctx) return;
      const t = ctx.currentTime + mulaiDetik;
      const durasi = 0.32;
      const g = ctx.createGain();
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.02);
      g.gain.setValueAtTime(0.22, t + durasi - 0.06);
      g.gain.linearRampToValueAtTime(0, t + durasi);

      [440, 554.37].forEach((hz) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(hz, t);
        o.connect(g);
        o.start(t);
        o.stop(t + durasi);
      });
    },

    _pola() {
      nada._ketuk(0);
      nada._ketuk(0.42);
      if (navigator.vibrate) {
        try { navigator.vibrate([420, 180, 420]); } catch (e) { /* abaikan */ }
      }
    },

    async mulai() {
      if (nada.aktif) return !nada.diblokir;
      const ctx = nada._ctxBaru();
      if (!ctx) { nada.diblokir = true; return false; }
      if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch (e) { /* ditolak peramban */ }
      }
      if (ctx.state !== 'running') {
        nada.diblokir = true;
        console.info('[TeleCare] nada dering diblokir peramban sampai ada interaksi.');
        if (navigator.vibrate) { try { navigator.vibrate([420, 180, 420]); } catch (e) {} }
        return false;
      }
      nada.diblokir = false;
      nada.aktif = true;
      nada._pola();
      nada.timer = setInterval(nada._pola, 2600);
      return true;
    },

    berhenti() {
      nada.aktif = false;
      if (nada.timer) { clearInterval(nada.timer); nada.timer = null; }
      if (navigator.vibrate) { try { navigator.vibrate(0); } catch (e) { /* abaikan */ } }
    },

    siapkanIzin() {
      const buka = () => {
        const ctx = nada._ctxBaru();
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      };
      ['pointerdown', 'keydown'].forEach((ev) => {
        window.addEventListener(ev, buka, { once: true, passive: true });
      });
    }
  };

  /* ============================================================
     2. KANAL PANGGILAN
     ============================================================ */
  const Ring = {
    nada,
    TIMEOUT_MS,

    tersedia() { return !!FB; },

    /* ---------------- sisi dokter ---------------- */

    _dutyChannel: null,

    /** Mendaftarkan diri sebagai dokter yang sedang menerima panggilan. */
    async mulaiJaga(doctorId, nama) {
      if (!Ring.tersedia() || !doctorId) return false;
      try {
        const user = await FB.ensureAuth();
        const sb = await sbReady();
        const ch = sb.channel('duty:' + doctorId, {
          config: { presence: { key: user.id } }
        });
        await new Promise((resolve) => {
          ch.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              await ch.track({ uid: user.id, name: String(nama || 'Dokter').slice(0, 80), at: Date.now() });
              resolve();
            }
          });
        });
        Ring._dutyChannel = ch;
        return true;
      } catch (e) {
        console.warn('[TeleCare] gagal mendaftar jaga:', e.message);
        return false;
      }
    },

    async berhentiJaga() {
      const ch = Ring._dutyChannel;
      Ring._dutyChannel = null;
      if (!ch) return;
      try { await ch.untrack(); } catch (e) { /* abaikan */ }
      if (FB.sb) FB.sb.removeChannel(ch);
    },

    /**
     * Mendengarkan panggilan masuk untuk pengguna ini.
     * @param {object} on { onMasuk(ring), onBatal(ringId, status) }
     * @returns {Function} pemutus langganan
     */
    dengarkan(on) {
      on = on || {};
      if (!Ring.tersedia()) return () => {};
      let ch = null;
      let stopped = false;

      FB.ensureAuth().then(async (user) => {
        if (stopped) return;
        const sb = await sbReady();

        ch = sb.channel('inbox:' + user.id)
          .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'inbox',
            filter: 'to_uid=eq.' + user.id
          }, (payload) => {
            const v = payload.new;
            if (v.status && v.status !== 'ringing') return;
            const at = new Date(v.at).getTime();
            if (!at || Date.now() - at > KEDALUWARSA_MS) {
              sb.from('inbox').delete().eq('id', v.id).then(() => {});
              return;
            }
            if (on.onMasuk) {
              on.onMasuk({
                ringId: v.id, from: v.from_uid, fromName: v.from_name,
                consultId: v.consult_id, mode: v.mode, at, status: v.status
              });
            }
          })
          .on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'inbox',
            filter: 'to_uid=eq.' + user.id
          }, (payload) => {
            const v = payload.new;
            if (v.status && v.status !== 'ringing' && on.onBatal) on.onBatal(v.id, v.status);
          })
          .on('postgres_changes', {
            event: 'DELETE', schema: 'public', table: 'inbox',
            filter: 'to_uid=eq.' + user.id
          }, (payload) => {
            if (on.onBatal) on.onBatal(payload.old.id, 'removed');
          })
          .subscribe();
      }).catch((e) => console.warn('[TeleCare] gagal mendengarkan panggilan:', e.message));

      return () => { stopped = true; if (ch && FB.sb) FB.sb.removeChannel(ch); };
    },

    /** Menerima panggilan: tandai diterima lalu gabung ke percakapannya. */
    async terima(ring) {
      nada.berhenti();
      if (!ring) return null;
      try {
        const sb = await sbReady();
        await sb.from('inbox')
          .update({ status: 'accepted', answered_at: new Date().toISOString() })
          .eq('id', ring.ringId);
        if (ring.consultId && TC.Chat) await TC.Chat.join(ring.consultId).catch(() => {});
        setTimeout(() => { sb.from('inbox').delete().eq('id', ring.ringId).then(() => {}); }, 4000);
      } catch (e) { /* abaikan */ }
      return ring.consultId || null;
    },

    async tolak(ring) {
      nada.berhenti();
      if (!ring) return;
      try {
        const sb = await sbReady();
        await sb.from('inbox').update({ status: 'declined', answered_at: new Date().toISOString() }).eq('id', ring.ringId);
        setTimeout(() => { sb.from('inbox').delete().eq('id', ring.ringId).then(() => {}); }, 4000);
      } catch (e) { /* abaikan */ }
    },

    /* ---------------- sisi pasien ---------------- */

    /** Apakah dokter itu sedang siap dipanggil? Mengembalikan { uid, name } atau null. */
    async cekJaga(doctorId) {
      if (!Ring.tersedia() || !doctorId) return null;
      try {
        const sb = await sbReady();

        // Kalau tab/klien ini sendiri kebetulan sudah punya channel dengan
        // topik sama (misal dokter mengecek status jaganya sendiri), Supabase
        // mengembalikan channel yang sama itu — baca langsung, jangan subscribe ulang.
        const topikPenuh = 'realtime:duty:' + doctorId;
        const sudahAda = (sb.getChannels() || []).find((c) => c.topic === topikPenuh);
        if (sudahAda) {
          const state = sudahAda.presenceState();
          const entri = Object.values(state).flat().find((e) => e && e.uid);
          return entri ? { uid: entri.uid, name: entri.name } : null;
        }

        return await new Promise((resolve) => {
          const ch = sb.channel('duty:' + doctorId, {
            config: { presence: { key: 'cek-' + Math.random().toString(36).slice(2) } }
          });
          let selesai = false;

          const baca = () => {
            const state = ch.presenceState();
            const entri = Object.values(state).flat().find((e) => e && e.uid);
            return entri ? { uid: entri.uid, name: entri.name } : null;
          };
          const tutup = (val) => { if (!selesai) { selesai = true; resolve(val); } };

          // Kasus channel BARU: event "sync" akan terpicu normal.
          ch.on('presence', { event: 'sync' }, () => tutup(baca()));

          // Kasus channel DAUR ULANG (topik sama sudah lama tersambung, seperti
          // punya dokter sendiri): "sync" mungkin tidak terpicu lagi, jadi baca
          // langsung begitu status SUBSCRIBED, dengan sedikit jeda untuk
          // memastikan datanya benar-benar sudah terisi.
          ch.subscribe((status) => {
            if (status === 'SUBSCRIBED') setTimeout(() => tutup(baca()), 300);
          });

          setTimeout(() => tutup(null), 4000);
        });
      } catch (e) {
        return null;
      }
    },

    /**
     * Memanggil dokter. Mengembalikan null bila dokter itu tidak sedang jaga —
     * pemanggil lalu dapat jatuh ke cara tautan undangan.
     *
     * @param {object} o { doctorId, consultId, mode, fromName }
     * @returns {Promise<object|null>} { ringId, doctorUid, pantau, batalkan }
     */
    async panggil(o) {
      const jaga = await Ring.cekJaga(o.doctorId);
      if (!jaga) return null;

      const user = await FB.ensureAuth();
      const sb = await sbReady();
      const ringId = TC.secureId('r');

      const { error } = await sb.from('inbox').insert({
        id: ringId,
        to_uid: jaga.uid,
        from_uid: user.id,
        from_name: String(o.fromName || 'Pasien').slice(0, 80),
        consult_id: o.consultId,
        mode: o.mode || 'video',
        status: 'ringing'
      });
      if (error) {
        console.warn('[TeleCare] gagal memanggil:', error.message);
        return null;
      }

      let habis = null;
      let ch = null;

      const handle = {
        ringId,
        doctorUid: jaga.uid,
        doctorName: jaga.name,

        /** @param {Function} cb dipanggil dengan 'accepted' | 'declined' | 'missed' */
        pantau(cb) {
          sbReady().then((sbc) => {
            ch = sbc.channel('ring:' + ringId)
              .on('postgres_changes', {
                event: 'UPDATE', schema: 'public', table: 'inbox', filter: 'id=eq.' + ringId
              }, (payload) => {
                const v = payload.new;
                if (v.status && v.status !== 'ringing') cb(v.status);
              })
              .on('postgres_changes', {
                event: 'DELETE', schema: 'public', table: 'inbox', filter: 'id=eq.' + ringId
              }, () => cb('missed'))
              .subscribe();
          });

          habis = setTimeout(async () => {
            const sbc = await sbReady();
            await sbc.from('inbox').update({ status: 'missed' }).eq('id', ringId).catch(() => {});
            cb('missed');
            setTimeout(() => sbc.from('inbox').delete().eq('id', ringId).catch(() => {}), 2000);
          }, TIMEOUT_MS);

          return handle;
        },

        selesai() {
          if (habis) { clearTimeout(habis); habis = null; }
          if (ch && FB.sb) { FB.sb.removeChannel(ch); ch = null; }
        },

        async batalkan() {
          handle.selesai();
          const sbc = await sbReady();
          await sbc.from('inbox').update({ status: 'canceled' }).eq('id', ringId).catch(() => {});
          setTimeout(() => sbc.from('inbox').delete().eq('id', ringId).catch(() => {}), 2000);
        }
      };

      return handle;
    }
  };

  TC.Ring = Ring;
})(window.TC);