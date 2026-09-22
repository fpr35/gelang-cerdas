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
  const Chat = {
    _joined: Object.create(null),

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
      Chat.join(consultId).then(() => {
        if (stopped) return;
        ch = FB.sb.channel('messages:' + consultId)
          .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'messages',
            filter: 'consult_id=eq.' + consultId
          }, (payload) => {
            const v = payload.new;
            onMessage({ key: v.id, at: new Date(v.at).getTime(), uid: v.uid, from: v.from_role, text: v.text, mid: v.mid });
          })
          .subscribe();
      }).catch((e) => {
        console.warn('[TeleCare] tidak dapat mengikuti percakapan:', e.message);
      });
      return () => { stopped = true; if (ch) FB.sb.removeChannel(ch); };
    },

    /** Mengirim satu pesan (INSERT ke tabel messages). */
    send(consultId, msg) {
      return Chat.join(consultId).then(async () => {
        const { error } = await FB.sb.from('messages').insert({
          consult_id: consultId,
          uid: FB.uid,
          from_role: msg.from,
          text: msg.text,
          mid: msg.mid || null
        });
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
})(window.TC);