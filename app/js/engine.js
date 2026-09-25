/* ============================================================
   TeleCare App — engine.js
   Mesin simulasi fisiologis, pengelola perangkat AIoT, perekam EKG,
   dan model sesi makan (respons glukosa).

   CATATAN: seluruh nilai fisiologis di sini dibangkitkan secara
   simulatif untuk keperluan purwarupa. Bila perangkat sungguhan
   tersambung lewat Web Bluetooth, nilai dari perangkat itulah yang
   dipakai dan simulasi dimatikan.
   ============================================================ */
(function (TC) {
  'use strict';

  const { clamp, lerp, rnd, rint, pick, uid, Store } = TC;
  const D = TC.DATA;

  /* ============================================================
     0. KALIBRASI SENSOR (alat pengembang)
     ============================================================
     Setiap sensor punya galat sistematisnya sendiri: termistor kulit
     membaca lebih rendah daripada suhu inti, estimasi tekanan darah
     dari gelombang nadi bergeser menurut orang dan letak pemakaian,
     dan oksimeter murah cenderung melaporkan saturasi lebih tinggi.
     Modul ini menyediakan koreksi linear per jenis perangkat:

         nilai = mentah * gain + offset

     lalu dijepit ke rentang yang masih mungkin secara fisiologis agar
     kesalahan kalibrasi tidak menghasilkan angka mustahil.

     Diterapkan HANYA pada nilai yang datang dari perangkat sungguhan
     (`Vitals.ingest`). Nilai simulasi tidak dikalibrasi — mengoreksi
     angka yang dibangkitkan sendiri tidak ada artinya.
     ============================================================ */
  const CAL_PARAMS = [
    { id: 'hr',      label: 'Detak jantung',   unit: 'bpm',   min: 25,  max: 240, cap: 'hr' },
    { id: 'hrv',     label: 'HRV (RMSSD)',     unit: 'ms',    min: 3,   max: 250, cap: 'hr' },
    { id: 'spo2',    label: 'Saturasi oksigen', unit: '%',    min: 60,  max: 100, cap: 'spo2' },
    { id: 'temp',    label: 'Suhu tubuh',      unit: '°C',    min: 28,  max: 44,  cap: 'temp' },
    { id: 'sys',     label: 'Sistolik',        unit: 'mmHg',  min: 50,  max: 280, cap: 'bp' },
    { id: 'dia',     label: 'Diastolik',       unit: 'mmHg',  min: 25,  max: 180, cap: 'bp' },
    { id: 'glucose', label: 'Glukosa',         unit: 'mg/dL', min: 30,  max: 450, cap: 'glucose' }
  ];

  const Calib = {
    PARAMS: CAL_PARAMS,

    param(id) { return CAL_PARAMS.find((p) => p.id === id) || null; },

    /** Parameter yang relevan untuk sebuah jenis perangkat, menurut caps-nya. */
    paramsFor(deviceType) {
      const t = D.deviceType(deviceType);
      const caps = (t && t.caps) || [];
      return CAL_PARAMS.filter((p) => caps.indexOf(p.cap) !== -1);
    },

    /** Menerapkan koreksi satu nilai. Mengembalikan angka, atau null bila tak sah. */
    apply(param, mentah, deviceType) {
      if (typeof mentah !== 'number' || !isFinite(mentah)) return null;
      if (!deviceType || Store.state.sensorCalOn === false) return mentah;
      const c = Store.cal(deviceType, param);
      if (!c.on) return mentah;
      const p = Calib.param(param);
      const out = mentah * c.gain + c.offset;
      if (!isFinite(out)) return mentah;
      return p ? clamp(out, p.min, p.max) : out;
    },

    /** Menerapkan koreksi ke seluruh isi satu paket bacaan. */
    applyAll(v, deviceType) {
      const out = {};
      Object.keys(v || {}).forEach((k) => {
        const p = Calib.param(k);
        out[k] = p ? Calib.apply(k, v[k], deviceType) : v[k];
        if (out[k] == null) out[k] = v[k];
      });
      return out;
    },

    /**
     * Menghitung gain dan offset dari dua pasang pengukuran:
     * (mentah1 → acuan1) dan (mentah2 → acuan2). Inilah cara kalibrasi
     * dua titik yang lazim dipakai di lapangan.
     */
    dariDuaTitik(m1, a1, m2, a2) {
      if ([m1, a1, m2, a2].some((x) => typeof x !== 'number' || !isFinite(x))) return null;
      if (m1 === m2) return null;                 // tanpa rentang, gain tak terhingga
      const gain = (a2 - a1) / (m2 - m1);
      const offset = a1 - gain * m1;
      if (!isFinite(gain) || !isFinite(offset)) return null;
      return { gain: Math.round(gain * 10000) / 10000, offset: Math.round(offset * 100) / 100 };
    }
  };

  /* ============================================================
     1. VITALS — simulasi fisiologis berirama sirkadian
     ============================================================ */
  const Vitals = (function () {
    const HIST = 60;
    // Tanpa simulasi (TC.FITUR.simulasi mati) setiap metrik mulai kosong dan
    // hanya terisi oleh angka dari alat; tampilan menulis "—" untuk null.
    const SIM = () => !!TC.FITUR.simulasi;
    const state = SIM() ? {
      hr: 74, spo2: 98, temp: 36.7, sys: 118, dia: 76,
      stress: 28, steps: 0, glucose: 92, hrv: 46,
      source: 'sim', updatedAt: Date.now()
    } : {
      hr: null, spo2: null, temp: null, sys: null, dia: null,
      stress: null, steps: 0, glucose: null, hrv: null,
      source: 'none', updatedAt: null
    };
    // `dia` ikut direkam supaya grafik tekanan darah menggambar diastolik yang
    // sebenarnya. Sebelumnya riwayat ini tidak ada, dan grafiknya memalsukan
    // garis diastolik dengan mengurangi sistolik sebesar angka bergerigi.
    const hist = { hr: [], spo2: [], temp: [], sys: [], dia: [], glucose: [] };
    // Bacaan mentah terakhir dari perangkat, sebelum kalibrasi diterapkan.
    const raw = {};
    /* Metrik mana yang saat ini berasal dari perangkat sungguhan:
         { hr: { at, jenis, eksperimental }, ... }
       Dilacak per metrik, bukan satu sakelar untuk semua: TeleBand tidak
       punya sensor suhu, jadi suhu tetap disimulasikan (dan dilabeli)
       sementara detak jantung dan SpO₂ berasal dari alat. */
    const dariAlat = {};
    const subs = new Set();
    let timer = null;

    /** Nilai dasar mengikuti jam (bangun, aktivitas siang, istirahat malam). */
    function circadian(h) {
      const day = Math.sin(((h - 8) / 24) * Math.PI * 2);
      return {
        hr: 66 + day * 10,
        temp: 36.55 + day * 0.28,
        sys: 116 + day * 7,
        stress: 26 + Math.max(0, day) * 22
      };
    }

    function step() {
      // Tanpa simulasi tidak ada yang dibangkitkan; riwayat grafik diisi oleh
      // ingest(), satu titik per pembacaan alat.
      if (!SIM()) return;
      const now = new Date();
      const base = circadian(now.getHours() + now.getMinutes() / 60);

      // Hanya metrik yang TIDAK sedang datang dari perangkat yang disimulasikan.
      const sim = (k) => !dariAlat[k];
      if (sim('hr')) state.hr = clamp(lerp(state.hr, base.hr + rnd(-4, 4), 0.14), 48, 132);
      if (sim('spo2')) state.spo2 = clamp(state.spo2 + rnd(-0.3, 0.3), 93, 100);
      if (sim('temp')) state.temp = clamp(lerp(state.temp, base.temp + rnd(-0.08, 0.08), 0.1), 35.9, 37.8);
      if (sim('sys')) state.sys = clamp(lerp(state.sys, base.sys + rnd(-4, 4), 0.1), 100, 145);
      if (sim('dia')) state.dia = clamp(state.dia + rnd(-0.8, 0.8), 62, 94);

      if (sim('stress')) {
        const pp = state.sys - state.dia;
        const target = clamp((state.hr - 54) * 1.25 + (pp - 38) * 0.8 + base.stress * 0.25, 4, 96);
        state.stress = lerp(state.stress, target, 0.05);
      }
      if (sim('hrv')) state.hrv = Math.round(clamp(98 - state.stress * 0.66, 14, 92));

      // langkah bertambah hanya pada jam aktif
      const h = now.getHours();
      if (sim('steps') && h >= 6 && h <= 21 && Math.random() < 0.45) state.steps += rint(0, 14);

      // glukosa mengikuti sesi makan yang sedang berjalan
      if (sim('glucose')) state.glucose = Meals.currentGlucose(state.glucose);

      state.updatedAt = Date.now();
      Object.keys(hist).forEach((k) => {
        hist[k].push(state[k]);
        if (hist[k].length > HIST) hist[k].shift();
      });
      // Diringkas ke agregat harian supaya tren 7 hari punya sumber sungguhan.
      try { catatAgregat(false); } catch (e) { /* jangan hentikan denyut vital */ }
      subs.forEach((fn) => { try { fn(state); } catch (e) { /* abaikan */ } });
    }

    function start() {
      if (timer || !SIM()) return;
      if (!hist.hr.length) for (let i = 0; i < 30; i++) step();
      timer = setInterval(step, 2000);
    }
    function stop() { clearInterval(timer); timer = null; }

    return {
      state, hist, start, stop, step,
      subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
      /**
       * Dipanggil ketika data sungguhan datang dari perangkat. Selama
       * `source` bernilai 'device', step() berhenti membangkitkan angka
       * sehingga nilai perangkat tidak tertimpa simulasi.
       */
      /**
       * @param {object} v            nilai per metrik; yang bukan angka dilewati
       * @param {string} [deviceType] profil kalibrasi; bawaan perangkat aktif
       * @param {object} [opts]       { eksperimental: ['glucose', 'sys', 'dia'] } —
       *   metrik yang merupakan estimasi eksperimental dari perangkat itu.
       *   Tampilan wajib melabelinya dan eskalasi tidak memakainya.
       */
      ingest(v, deviceType, opts) {
        state.source = 'device';
        const eksp = (opts && opts.eksperimental) || [];
        // Jenis perangkat menentukan profil kalibrasi yang dipakai. Bila
        // pemanggil tidak menyebutkannya, dipakai perangkat aktif.
        const jenis = deviceType ||
          ((Store.activeDevice() || {}).type) || null;

        // Nilai mentah disimpan apa adanya supaya layar kalibrasi dapat
        // menunjukkan mentah dan hasil koreksi berdampingan.
        state.rawSource = jenis;
        const dikoreksi = Calib.applyAll(v, jenis);

        const now = Date.now();
        ['hr', 'spo2', 'temp', 'sys', 'dia', 'stress', 'glucose', 'hrv'].forEach((k) => {
          if (typeof v[k] === 'number' && isFinite(v[k])) {
            raw[k] = v[k];
            const nilai = dikoreksi[k];
            state[k] = typeof nilai === 'number' && isFinite(nilai) ? nilai : v[k];
            dariAlat[k] = { at: now, jenis, eksperimental: eksp.indexOf(k) !== -1 };
          }
        });
        state.updatedAt = now;
        if (!SIM()) {
          Object.keys(hist).forEach((k) => {
            if (typeof v[k] !== 'number' || !isFinite(v[k])) return;
            hist[k].push(state[k]);
            if (hist[k].length > HIST) hist[k].shift();
          });
        }
        subs.forEach((fn) => { try { fn(state); } catch (e) { /* abaikan */ } });
      },

      /** 'device' atau 'sim' untuk SATU metrik. 'bp' dibaca dari sistolik. */
      sourceOf(k) { return dariAlat[k === 'bp' ? 'sys' : k] ? 'device' : 'sim'; },

      /** Benar bila metrik itu dari perangkat DAN berupa estimasi eksperimental. */
      eksperimental(k) {
        const d = dariAlat[k === 'bp' ? 'sys' : k];
        return !!(d && d.eksperimental);
      },

      /** Jenis perangkat asal suatu metrik, atau null bila simulasi. */
      jenisAsal(k) {
        const d = dariAlat[k === 'bp' ? 'sys' : k];
        return d ? d.jenis : null;
      },

      /** Nilai mentah terakhir dari perangkat, sebelum kalibrasi. */
      raw() { return Object.assign({}, raw); },

      /**
       * Kembali ke simulasi setelah perangkat sungguhan lepas. Tanpa ini
       * layar vital akan membeku pada angka terakhir dari perangkat dan
       * tampak seolah masih hidup.
       */
      releaseDevice() {
        if (state.source !== 'device') return;
        state.source = SIM() ? 'sim' : 'none';
        // Tanpa simulasi, angka alat tidak dibiarkan membeku di layar setelah
        // alat lepas: vital kembali kosong ("—").
        if (!SIM()) Object.keys(dariAlat).forEach((k) => { state[k] = null; });
        Object.keys(dariAlat).forEach((k) => { delete dariAlat[k]; });
        state.updatedAt = Date.now();
        subs.forEach((fn) => { try { fn(state); } catch (e) { /* abaikan */ } });
      },

      /** 'sim' atau 'device' — dipakai UI untuk menandai asal angka. */
      source() { return state.source; },
      /** Angka bulat per metrik; null bila metrik itu belum terukur. */
      snapshot() {
        const bulat = (x) => (typeof x === 'number' && isFinite(x) ? Math.round(x) : null);
        return {
          hr: bulat(state.hr), spo2: bulat(state.spo2),
          temp: typeof state.temp === 'number' ? +state.temp.toFixed(1) : null,
          sys: bulat(state.sys), dia: bulat(state.dia), stress: bulat(state.stress),
          hrv: state.hrv, glucose: bulat(state.glucose), at: state.updatedAt || Date.now()
        };
      },
      /** Benar bila ada setidaknya satu metrik yang sedang datang dari alat. */
      adaDariAlat() { return Object.keys(dariAlat).length > 0; },
      stressLabel(v) {
        const s = v == null ? state.stress : v;
        if (s >= 66) return { t: 'Tinggi', c: 'r' };
        if (s >= 34) return { t: 'Sedang', c: 'a' };
        return { t: 'Rendah', c: 'g' };
      }
    };
  })();

  /* ============================================================
     2. EKG — bentuk gelombang P-QRS-T sintetis
     ============================================================ */
  function ecgAt(p) {
    const g = (c, w, a) => a * Math.exp(-Math.pow((p - c) / w, 2));
    return g(0.18, 0.035, 0.13) - g(0.36, 0.012, 0.11) + g(0.40, 0.011, 1.0)
         - g(0.44, 0.016, 0.24) + g(0.66, 0.062, 0.29);
  }

  /** Menggambar EKG yang bergulir pada sebuah <canvas>. */
  function EcgRenderer(canvas) {
    let raf = null, buf = [], phase = 0, W = 0, H = 0, ctx = null;
    const SPAN = 3.2; // detik yang terlihat

    function resize() {
      const f = TC.fitCanvas(canvas);
      if (!f) return false;
      ctx = f.ctx; W = f.w; H = f.h;
      const n = Math.max(60, Math.round(W));
      while (buf.length < n) buf.push(0);
      while (buf.length > n) buf.shift();
      return true;
    }

    function draw(dt) {
      if (!ctx && !resize()) return;
      const px = W / SPAN;
      const steps = Math.max(1, Math.round(px * dt));
      const cyc = 60 / clamp(Vitals.state.hr, 35, 200);
      for (let i = 0; i < steps; i++) {
        phase += (dt / steps) / cyc;
        if (phase >= 1) phase -= 1;
        buf.push(ecgAt(phase) + rnd(-0.012, 0.012));
        buf.shift();
      }
      const base = H * 0.66, amp = H * 0.44, n = buf.length;
      ctx.clearRect(0, 0, W, H);
      const path = () => {
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * W, y = base - buf[i] * amp;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
      };
      path(); ctx.strokeStyle = 'rgba(127,184,245,.22)'; ctx.lineWidth = 5;
      ctx.lineJoin = 'round'; ctx.stroke();
      path(); ctx.strokeStyle = '#7FB8F5'; ctx.lineWidth = 1.9;
      ctx.lineCap = 'round'; ctx.stroke();
      ctx.beginPath();
      ctx.arc(W - 1.5, base - buf[n - 1] * amp, 3, 0, 7);
      ctx.fillStyle = '#DCEAFE'; ctx.fill();
    }

    let last = performance.now();
    function loop(now) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      draw(dt);
    }

    const onResize = () => { ctx = null; };
    window.addEventListener('resize', onResize);
    resize();
    raf = requestAnimationFrame(loop);

    return {
      stop() {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', onResize);
      }
    };
  }

  /* ============================================================
     3. PERANGKAT AIoT
     ============================================================ */
  const Devices = (function () {
    let syncTimer = null;

    function makeCode(prefix) {
      const hex = '0123456789ABCDEF';
      let s = '';
      for (let i = 0; i < 4; i++) s += hex[Math.floor(Math.random() * 16)];
      return prefix + '-' + s;
    }

    /** Hasil pemindaian simulatif — memuat semua jenis simulasi yang ditampilkan. */
    function simulateScan() {
      // Jenis `nyata` (TeleBand berprotokol sendiri) hanya lewat Bluetooth sungguhan,
      // dan jenis `tersembunyi` (TeleRing dkk.) sudah tersaring dari D.DEVICE_TYPES.
      // Dulu dua entri pertama diambil lewat indeks tetap; kini bisa tinggal satu.
      const all = D.DEVICE_TYPES.filter((t) => !t.nyata);
      const owned = Store.state.devices.map((d) => d.code);
      const found = all.map((t) => ({
        id: uid('dev'),
        type: t.type,
        name: t.name,
        code: makeCode(t.prefix),
        rssi: rint(1, 4),
        battery: rint(t.battery[0], t.battery[1]),
        supported: true
      })).filter((d) => owned.indexOf(d.code) === -1);
      // satu perangkat asing yang tidak didukung, seperti di lapangan
      found.push({
        id: uid('dev'), type: 'unknown', name: 'Perangkat BLE tidak dikenal',
        code: '—', rssi: rint(1, 2), battery: null, supported: false
      });
      return found.sort((a, b) => b.rssi - a.rssi);
    }

    /** Mencoba pemindaian Web Bluetooth sungguhan bila tersedia. */
    async function realScan() {
      if (!TC.Ble || !TC.Ble.supported()) throw new Error('unsupported');
      const dev = await TC.Ble.requestDevice();
      // Pemilih jalur generik menampilkan SEMUA perangkat, termasuk TeleBand.
      // TeleBand tidak punya profil SIG standar, jadi lewat jalur ini ia
      // tampak "tersambung" tetapi tidak pernah mengirim angka. Tolak di sini.
      if (/^TeleCare-/i.test(dev.name || '')) {
        const e = new Error('Ini TeleBand. Sambungkan lewat layar TeleBand, bukan pemindaian BLE generik.');
        e.name = 'TeleBandSalahJalur';
        throw e;
      }
      return {
        id: uid('dev'),
        type: 'band',
        name: dev.name || 'Perangkat Bluetooth',
        code: (dev.name || 'BLE').toUpperCase().slice(0, 12),
        rssi: 4, battery: null, supported: true, real: true, ref: dev
      };
    }

    /* ---------------- sambungan GATT sungguhan ----------------
       Satu perangkat nyata aktif pada satu waktu; kuncinya adalah id
       perangkat pada store, supaya pemutusan dapat menyasar dengan tepat.
       ------------------------------------------------------- */
    const sesiBle = new Map();

    /**
     * Menyambungkan perangkat BLE sungguhan lalu mengalirkan nilainya ke
     * Vitals. Selama tersambung, simulasi berhenti menimpa angka.
     */
    async function connectReal(dev, ref) {
      if (!TC.Ble || !ref) return null;
      const sesi = await TC.Ble.connect(ref, {
        onData(v) {
          Vitals.ingest(v);
          // Kontak kulit longgar membuat angka tidak dapat dipercaya, jadi
          // pengguna diberi tahu alih-alih dibiarkan menduga.
          if (v.kontakKulit === false) {
            Store.notify('Sensor tidak menempel',
              'Perangkat melaporkan sensor lepas dari kulit — nilai bisa tidak akurat.', 'warn');
          }
        },
        onBattery(p) {
          Store.update((s) => {
            const d = s.devices.find((x) => x.id === dev.id);
            if (d) d.battery = p;
          });
        },
        onDisconnect() {
          sesiBle.delete(dev.id);
          Vitals.releaseDevice();
          Store.update((s) => {
            const d = s.devices.find((x) => x.id === dev.id);
            if (d) d.connected = false;
          });
          Store.notify('Perangkat terputus', dev.name + ' lepas dari Bluetooth.' +
            (TC.FITUR.simulasi ? ' Vital kembali ke simulasi.' : ''), 'warn');
        },
        onLog(m) { console.info('[TeleCare BLE]', m); }
      });

      sesiBle.set(dev.id, sesi);

      Store.update((s) => {
        const d = s.devices.find((x) => x.id === dev.id);
        if (!d) return;
        d.services = sesi.layanan;
        if (sesi.batteryAwal != null) d.battery = sesi.batteryAwal;
      });

      if (!sesi.layanan.length) {
        Store.notify('Tidak ada layanan yang dikenali',
          'Perangkat tersambung tetapi tidak menyediakan profil kesehatan standar. ' +
          'Vital tetap memakai simulasi.', 'warn');
      } else {
        Store.notify('Membaca data perangkat',
          'Layanan aktif: ' + sesi.layanan.join(', '), 'ok');
      }
      return sesi;
    }

    /** Memutus sambungan GATT bila perangkat itu memang perangkat nyata. */
    function stopReal(id) {
      const sesi = sesiBle.get(id);
      if (!sesi) return false;
      sesi.stop();
      sesiBle.delete(id);
      Vitals.releaseDevice();
      return true;
    }

    const isReal = (id) => sesiBle.has(id);

    function pair(found) {
      const t = D.deviceType(found.type);
      const dev = {
        id: found.id, type: found.type, name: found.name, code: found.code,
        battery: found.battery != null ? found.battery : rint(t.battery[0], t.battery[1]),
        connected: true, real: !!found.real,
        pairedAt: Date.now(), lastSync: null, rssi: found.rssi || 4
      };
      Store.update((s) => {
        s.devices = s.devices.filter((d) => d.code !== dev.code);
        s.devices.push(dev);
        s.activeDeviceId = dev.id;
        if (TC.FITUR.simulasi) s.pendingSamples = rint(0, 40);
      });
      Store.notify('Perangkat tersambung', dev.name + ' · ' + dev.code, 'ok');
      startBuffer();

      // Perangkat sungguhan disambungkan ke GATT-nya; kegagalan tidak
      // membatalkan pemasangan, aplikasi hanya kembali memakai simulasi.
      if (found.real && found.ref) {
        connectReal(dev, found.ref).catch((e) => {
          console.warn('[TeleCare] GATT gagal:', e && e.message);
          Store.notify('Gagal membaca perangkat',
            (e && e.message) || 'Sambungan GATT gagal. Vital memakai simulasi.', 'warn');
        });
      }
      return dev;
    }

    /** TeleBand punya sambungannya sendiri (TeleBandLink), bukan lewat ble.js. */
    function stopTeleBand(id) {
      const d = Store.state.devices.find((x) => x.id === id);
      if (d && d.type === 'teleband' && TC.TeleBandLink) TC.TeleBandLink.putus();
    }

    function disconnect(id) {
      stopTeleBand(id);
      stopReal(id);
      Store.update((s) => {
        const d = s.devices.find((x) => x.id === id);
        if (d) d.connected = false;
      });
    }

    function reconnect(id) {
      Store.update((s) => {
        const d = s.devices.find((x) => x.id === id);
        if (d) { d.connected = true; d.rssi = TC.rint(2, 4); }
        s.activeDeviceId = id;
      });
      Store.notify('Tersambung kembali', 'Perangkat berhasil disambungkan ulang.', 'ok');
    }

    function forget(id) {
      stopTeleBand(id);
      stopReal(id);
      Store.update((s) => {
        s.devices = s.devices.filter((d) => d.id !== id);
        if (s.activeDeviceId === id) s.activeDeviceId = s.devices.length ? s.devices[0].id : null;
      });
    }

    /** Buffer jam bertambah selama belum disinkronkan. */
    function startBuffer() {
      // Buffer jam ini buatan (sampel bertambah sendiri); tanpa simulasi tidak ada.
      if (syncTimer || !TC.FITUR.simulasi) return;
      syncTimer = setInterval(() => {
        const s = Store.state;
        // Perangkat sungguhan mengalirkan nilai langsung lewat notifikasi GATT,
        // jadi tidak ada tumpukan yang menunggu disinkronkan. Menambah buffer
        // di sini akan menampilkan antrean yang tidak pernah ada.
        const adaNyataTersambung = s.devices.some((d) =>
          d.connected && (isReal(d.id) || d.type === 'teleband'));
        if (adaNyataTersambung) return;

        if (!s.devices.some((d) => d.connected)) {
          // tetap mengukur meski terputus — persis seperti perangkat asli
          Store.update((st) => { st.pendingSamples += TC.rint(1, 3); });
        } else if (Math.random() < 0.5) {
          Store.update((st) => { st.pendingSamples += 1; });
        }
      }, 12000);
    }

    /** Memindahkan sampel dari buffer perangkat ke aplikasi. */
    function sync() {
      return new Promise((resolve, reject) => {
        const dev = Store.activeDevice();
        if (!dev || !dev.connected) { reject(new Error('Perangkat tidak tersambung')); return; }
        // TeleBand sungguhan: minta alat mengirim ulang hasil yang masih
        // tersimpan (SINKRON); penerimaannya lewat TeleBandLink/Readings.
        if (dev.type === 'teleband') {
          const link = TC.TeleBandLink;
          if (!link || !link.tersambung()) {
            reject(new Error('TeleBand tidak tersambung. Buka layar TeleBand untuk menyambungkan.'));
            return;
          }
          const n0 = (link.status() || {}).tersimpan || 0;
          link.sinkron().then(() => resolve(n0), reject);
          return;
        }
        const n = Store.state.pendingSamples;
        const dur = clamp(600 + n * 22, 700, 3200);
        setTimeout(() => {
          Store.update((s) => {
            s.pendingSamples = 0;
            s.lastSync = Date.now();
            const d = s.devices.find((x) => x.id === dev.id);
            if (d) { d.lastSync = Date.now(); d.battery = clamp(d.battery - TC.rint(0, 1), 5, 100); }
            s.vitalsHistory.push(Vitals.snapshot());
            s.vitalsHistory = s.vitalsHistory.slice(-200);
          });
          resolve(n);
        }, dur);
      });
    }

    function statusText() {
      const dev = Store.activeDevice();
      if (!dev) return { t: 'Belum ada perangkat', on: false };
      if (!dev.connected) return { t: dev.name + ' terputus', on: false };
      return { t: dev.name + ' · baterai ' + (dev.battery != null ? dev.battery + '%' : '—'), on: true };
    }

    return {
      simulateScan, realScan, pair, disconnect, reconnect, forget, sync,
      startBuffer, statusText, makeCode,
      connectReal, stopReal, isReal,
      hasWebBluetooth: () => !!(TC.Ble && TC.Ble.supported())
    };
  })();

  /* ============================================================
     4. SESI MAKAN & RESPONS GLUKOSA
     ============================================================ */
  const Meals = (function () {
    const HOUR = 3600000;

    function mealKind(d) {
      const h = d.getHours();
      for (const k of D.MEAL_KINDS) {
        if (k.from < k.to ? (h >= k.from && h < k.to) : (h >= k.from || h < k.to)) return k;
      }
      return D.MEAL_KINDS[1];
    }

    /** Menjumlahkan gizi dari daftar makanan terpilih. */
    function nutrition(items) {
      const t = { kcal: 0, carb: 0, protein: 0, fat: 0, sugar: 0, fiber: 0 };
      items.forEach((it) => {
        const f = D.food(it.n);
        if (!f) return;
        const q = it.qty || 1;
        t.kcal += f.kcal * q; t.carb += f.c * q; t.protein += f.p * q;
        t.fat += f.f * q; t.sugar += f.sugar * q; t.fiber += f.fiber * q;
      });
      Object.keys(t).forEach((k) => { t[k] = Math.round(t[k] * 10) / 10; });
      t.kcal = Math.round(t.kcal);
      return t;
    }

    /** Perkiraan kenaikan puncak glukosa dari komposisi makanan. */
    function predictDelta(n, items) {
      let giFactor = 1;
      items.forEach((it) => {
        const f = D.food(it.n);
        if (!f) return;
        giFactor += (f.gi === 'tinggi' ? 0.14 : f.gi === 'sedang' ? 0.05 : -0.03);
      });
      const raw = (n.carb * 0.42 + n.sugar * 0.55 - n.fiber * 2.6 - n.protein * 0.18 - n.fat * 0.12);
      return Math.round(clamp(raw * clamp(giFactor, 0.7, 1.6), 8, 78));
    }

    /* ---------------- sesi makan dari pengukuran sungguhan ----------------
       Tanpa simulasi, setiap titik gula darah punya JENDELA waktu, dan hanya
       diisi oleh hasil ukur TeleBand (paket HASIL berisi glukosa) yang selesai
       di dalam jendela itu. Jendela yang lewat tanpa pengukuran ditandai
       `terlewat` — tidak pernah diisi angka karangan. Glukosa TeleBand sendiri
       hanya estimasi eksperimental, jadi seluruh kurva ikut berlabel begitu. */
    const MIN = 60000;
    const TITIK_NYATA = [
      { key: 'baseline', label: 'Sebelum makan', offset: 0,        dari: -30 * MIN, sampai: 15 * MIN },
      { key: 'h1',       label: '+1 jam',        offset: HOUR,     dari: 45 * MIN,  sampai: 80 * MIN },
      { key: 'h2',       label: '+2 jam',        offset: 2 * HOUR, dari: 105 * MIN, sampai: 140 * MIN }
    ];

    /** Glukosa terbaru dari TeleBand yang selesai dalam [t0, t1], atau null. */
    function glukosaAlatAntara(t0, t1) {
      const r = Readings.list().find((x) => {
        const t = x.waktu ? x.waktu + (x.durasi || 0) * 1000 : x.diterima;
        return x.glukosa != null && t >= t0 && t <= t1;
      });
      return r ? r.glukosa : null;
    }

    function createNyata(items, photo) {
      const now = Date.now();
      const meal = {
        id: uid('meal'), v: 2, at: now, photo: photo || null,
        kind: mealKind(new Date(now)).name,
        items, nutrition: nutrition(items), speed: 1,
        baseline: null, status: 'running', sumber: 'teleband',
        points: TITIK_NYATA.map((t) => Object.assign({ value: null, done: false }, t))
      };
      // Pengukuran yang baru saja dilakukan sebelum sesi dibuat ikut dipakai
      // sebagai titik "sebelum makan".
      const awal = glukosaAlatAntara(now + meal.points[0].dari, now);
      if (awal != null) Object.assign(meal.points[0], { value: awal, done: true });
      meal.baseline = meal.points[0].value;
      Store.update((s) => { s.activeMeal = meal; });
      return meal;
    }

    /**
     * Dipanggil TeleBandLink setiap kali hasil ukur berisi glukosa masuk.
     * Mengisi titik sesi berjalan yang jendelanya memuat waktu `t`.
     */
    function isiGlukosa(nilai, t) {
      const m = Store.state.activeMeal;
      if (!m || m.v !== 2 || m.status !== 'running' || nilai == null) return false;
      // Titik yang sempat ditandai terlewat masih boleh terisi selama sesi
      // berjalan: hasil ukur bisa tiba terlambat lewat sinkronisasi alat,
      // tetapi waktunya tetap waktu pengukuran di alat.
      const p = m.points.find((x) => (!x.done || x.terlewat) &&
        t >= m.at + x.dari && t <= m.at + x.sampai);
      if (!p) return false;
      p.value = Math.round(nilai);
      p.done = true;
      p.terlewat = false;
      if (p.key === 'baseline') m.baseline = p.value;
      if (m.points.every((x) => x.done)) finish(m);
      else Store.save();
      return true;
    }

    /** Status satu titik untuk tampilan: 'terisi' | 'terlewat' | 'sekarang' | 'nanti'. */
    function statusTitik(m, p, now) {
      if (p.done) return p.value != null ? 'terisi' : 'terlewat';
      const t = now || Date.now();
      if (m.v !== 2) return 'nanti';
      return t >= m.at + p.dari ? 'sekarang' : 'nanti';
    }

    /** Membuat sesi baru; titik pengukuran dipercepat pada mode demo. */
    function create(items, photo, opts) {
      if (!TC.FITUR.simulasi) return createNyata(items, photo);
      opts = opts || {};
      const now = Date.now();
      const n = nutrition(items);
      const speed = Store.state.settings.fastDemo ? 60 : 1; // 2 jam -> 2 menit
      const baseline = Math.round(clamp(Vitals.state.glucose + rnd(-4, 4), 78, 108));
      const delta = predictDelta(n, items);

      const meal = {
        id: uid('meal'), at: now, photo: photo || null,
        kind: mealKind(new Date(now)).name,
        items, nutrition: n, confidence: opts.confidence || 82,
        speed, baseline, predictedDelta: delta,
        status: 'running',
        points: [
          { key: 'baseline', label: 'Baseline', offset: -300000, value: baseline, done: true },
          { key: 't0', label: 'Selesai makan', offset: 0, value: null, done: false },
          { key: 'h1', label: '+1 jam', offset: HOUR, value: null, done: false },
          { key: 'h2', label: '+2 jam', offset: 2 * HOUR, value: null, done: false }
        ]
      };
      Store.update((s) => { s.activeMeal = meal; });
      tick();
      return meal;
    }

    /** Waktu nyata (ms) sebuah titik akan tiba. */
    function pointDue(meal, p) {
      return meal.at + p.offset / meal.speed;
    }

    /** Nilai glukosa pada sebuah titik, mengikuti kurva respons. */
    function valueAt(meal, offsetMs) {
      const h = offsetMs / HOUR;
      const d = meal.predictedDelta;
      if (h <= 0) return meal.baseline + Math.round(rnd(2, 8));
      // kurva naik cepat lalu turun perlahan (gamma sederhana)
      const shape = Math.pow(h / 1.0, 1.6) * Math.exp(1.6 * (1 - h / 1.0));
      return Math.round(meal.baseline + d * clamp(shape, 0, 1.05) + rnd(-3, 3));
    }

    /** Memperbarui titik yang waktunya sudah lewat. */
    function tick() {
      const m = Store.state.activeMeal;
      if (!m || m.status !== 'running') return;
      let changed = false;
      const now = Date.now();
      if (m.v === 2) {
        // Jendela yang sudah lewat tanpa pengukuran: terlewat, tanpa angka.
        m.points.forEach((p) => {
          if (!p.done && now > m.at + p.sampai) { p.done = true; p.terlewat = true; changed = true; }
        });
        if (changed) {
          if (m.points.every((p) => p.done)) finish(m);
          else Store.save();
        }
        return changed;
      }
      m.points.forEach((p) => {
        if (p.done || p.offset < 0) return;
        if (now >= pointDue(m, p)) {
          p.value = valueAt(m, p.offset);
          p.done = true;
          changed = true;
        }
      });
      if (changed) {
        if (m.points.every((p) => p.done)) finish(m);
        else Store.save();
      }
      return changed;
    }

    function finish(m) {
      if (m.v === 2) return finishNyata(m);
      const measured = m.points.filter((p) => p.done && p.value != null);
      const peakP = measured.reduce((a, b) => (b.value > a.value ? b : a), measured[0]);
      m.peak = peakP.value;
      m.peakAt = peakP.label;
      m.delta = m.peak - m.baseline;
      m.recovery = m.delta > 45 ? 3 : m.delta > 28 ? 2 : 1.5;
      m.category = m.delta > 45 ? 'Tinggi' : m.delta > 28 ? 'Sedang' : 'Landai';
      m.status = 'done';
      m.doneAt = Date.now();
      Store.update((s) => {
        s.meals.unshift(m);
        s.meals = s.meals.slice(0, 60);
        s.activeMeal = null;
      });
      Store.notify('Sesi selesai',
        `${m.kind} · puncak ${m.peak} mg/dL (+${m.delta} dari baseline)`, 'ok');
    }

    /**
     * Ringkasan dari titik yang benar-benar terukur. Kenaikan hanya dihitung
     * bila titik "sebelum makan" DAN minimal satu titik sesudah makan ada;
     * selain itu sesi tetap tersimpan (gizinya nyata) tetapi tanpa angka kurva.
     */
    function finishNyata(m) {
      const base = m.points[0].value;
      const sesudah = m.points.slice(1).filter((p) => p.value != null);
      m.baseline = base;
      if (base != null && sesudah.length) {
        const puncak = sesudah.reduce((a, b) => (b.value > a.value ? b : a));
        m.peak = puncak.value;
        m.peakAt = puncak.label;
        m.delta = m.peak - base;
        m.category = m.delta > 45 ? 'Tinggi' : m.delta > 28 ? 'Sedang' : 'Landai';
        const h2 = m.points[2].value;
        // "Pulih dalam 2 jam" hanya bisa dinilai bila titik +2 jam terukur.
        m.pulih2jam = h2 == null ? null : h2 - base <= 10;
      } else {
        m.peak = null; m.peakAt = null; m.delta = null; m.pulih2jam = null;
        m.category = 'Data kurang';
      }
      m.recovery = null;
      m.status = 'done';
      m.doneAt = Date.now();
      Store.update((s) => {
        s.meals.unshift(m);
        s.meals = s.meals.slice(0, 60);
        s.activeMeal = null;
      });
      Store.notify('Sesi selesai', m.delta != null
        ? `${m.kind} · puncak ${m.peak} mg/dL (+${m.delta} dari sebelum makan) · estimasi TeleBand`
        : `${m.kind} · gizi tercatat; titik gula darah belum cukup untuk menghitung kenaikan`, 'ok');
    }

    function cancel() {
      Store.update((s) => { s.activeMeal = null; });
    }

    /** Glukosa saat ini, dipengaruhi sesi yang sedang berjalan. */
    function currentGlucose(prev) {
      const m = Store.state.activeMeal;
      if (!m) return clamp(lerp(prev, 92 + rnd(-5, 5), 0.06), 72, 130);
      const elapsed = (Date.now() - m.at) * m.speed;
      const target = valueAt(m, Math.max(0, elapsed));
      return clamp(lerp(prev, target, 0.25), 65, 260);
    }

    /** Ringkasan hari ini dari seluruh sesi. */
    /** @param {Array} [meals] @param {object} [aktif]  bawaan: data pengguna ini. */
    function today(meals, aktif) {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      // Sesi yang masih berjalan ikut dihitung: makanannya sudah disantap.
      // Dulu sesi baru masuk hitungan setelah selesai (±2 jam kemudian),
      // sehingga asupan hari ini tampak lebih kecil dari kenyataannya.
      const active = meals ? aktif : Store.state.activeMeal;
      const list = (meals || Store.state.meals).concat(active ? [active] : [])
        .filter((m) => m.at >= start.getTime());
      const t = { kcal: 0, carb: 0, protein: 0, fat: 0, count: list.length };
      list.forEach((m) => {
        t.kcal += m.nutrition.kcal; t.carb += m.nutrition.carb;
        t.protein += m.nutrition.protein; t.fat += m.nutrition.fat;
      });
      Object.keys(t).forEach((k) => { t[k] = Math.round(t[k]); });
      return t;
    }

    /**
     * Capaian target gizi hari ini (Profil → Tujuan Kesehatan).
     * Satu butir per zat gizi: { key, label, unit, nilai, target, pct, status, teks }.
     * status: 'sisa' (< 90% target), 'tercapai' (90–110%), 'lebih' (> 110%).
     * Rentang ±10% dipakai karena porsi rumahan tidak pernah persis.
     */
    const ZAT = [
      { key: 'kcal', label: 'Kalori', unit: 'kkal' },
      { key: 'carb', label: 'Karbohidrat', unit: 'g' },
      { key: 'protein', label: 'Protein', unit: 'g' },
      { key: 'fat', label: 'Lemak', unit: 'g' }
    ];
    /**
     * Tanpa argumen: data pengguna ini. Admin memanggilnya dengan data pasien
     * dari server (riwayat sesi, sesi berjalan, target).
     */
    function progresTarget(meals, aktif, targets) {
      const t = meals ? today(meals, aktif) : today();
      const target = targets || Store.profile().targets;
      const butir = ZAT.map((z) => {
        const nilai = t[z.key], tg = target[z.key] || 0;
        const pct = tg ? nilai / tg : 0;
        const status = pct > 1.1 ? 'lebih' : pct >= 0.9 ? 'tercapai' : 'sisa';
        const teks = status === 'tercapai' ? 'tercapai'
          : status === 'lebih' ? 'lebih ' + Math.round(nilai - tg) + ' ' + z.unit
          : 'sisa ' + Math.round(tg - nilai) + ' ' + z.unit;
        return Object.assign({ nilai, target: tg, pct, status, teks }, z);
      });
      return {
        butir, sesi: t.count,
        tercapai: butir.filter((b) => b.status === 'tercapai').length
      };
    }

    function peakTrend(n) {
      return Store.state.meals.filter((m) => m.status === 'done' && m.peak != null)
        .slice(0, n || 6).map((m) => m.peak).reverse();
    }

    /** Mensimulasikan pengenalan makanan dari sebuah foto. */
    function recognize() {
      const combo = pick(D.FOOD_COMBOS);
      const items = combo.map((n) => {
        const f = D.food(n);
        const qty = Math.random() < 0.75 ? 1 : (Math.random() < 0.5 ? 0.5 : 2);
        return { n, qty, g: Math.round(f.g * qty) };
      });
      const confidence = rint(46, 94);
      return { items, confidence };
    }

    return {
      create, tick, cancel, finish, nutrition, predictDelta, valueAt, isiGlukosa, statusTitik,
      pointDue, currentGlucose, today, progresTarget, peakTrend, recognize, mealKind
    };
  })();

  /* ============================================================
     4b. TARGET GIZI DARI PROFIL
     ============================================================
     Target harian dihitung dari profil pengguna, bukan paket tetap:
       1. Energi basal (BMR) — persamaan Mifflin-St Jeor (1990):
            10·berat(kg) + 6,25·tinggi(cm) − 5·usia + 5   (laki-laki)
            10·berat(kg) + 6,25·tinggi(cm) − 5·usia − 161 (perempuan)
       2. Kebutuhan harian = BMR × faktor aktivitas, lalu disesuaikan
          tujuan (turun berat −500, tambah massa otot +300, bulking +500 kkal).
          Tidak pernah di bawah BMR maupun 1200/1500 kkal (P/L).
       3. Protein per kg berat badan, lemak sebagai persen energi,
          karbohidrat mengisi sisanya (4 kkal/g karbo & protein, 9 kkal/g
          lemak). Hasilnya berada dalam rentang AMDR: karbo 45–65%,
          protein 10–35%, lemak 20–35% energi.
     Bila profil belum lengkap, paket tetap D.GOALS dipakai sebagai cadangan.
     ============================================================ */
  const Gizi = (function () {
    const AKTIVITAS = [
      { id: 'sedentari', nama: 'Jarang bergerak', desc: 'Kerja duduk, hampir tanpa olahraga', f: 1.2 },
      { id: 'ringan', nama: 'Aktivitas ringan', desc: 'Olahraga ringan 1–3 hari per minggu', f: 1.375 },
      { id: 'sedang', nama: 'Aktivitas sedang', desc: 'Olahraga 3–5 hari per minggu', f: 1.55 },
      { id: 'berat', nama: 'Aktivitas berat', desc: 'Olahraga berat 6–7 hari per minggu atau kerja fisik', f: 1.725 }
    ];
    const TUJUAN = {
      'jaga-berat':  { kkal: 0,    proteinPerKg: 0.8, lemakPct: 0.30, teks: 'sesuai kebutuhan harian' },
      'turun-berat': { kkal: -500, proteinPerKg: 1.2, lemakPct: 0.25, teks: 'defisit 500 kkal' },
      'gula-stabil': { kkal: 0,    proteinPerKg: 1.0, lemakPct: 0.35, teks: 'karbohidrat lebih rendah' },
      'naik-massa':  { kkal: 300,  proteinPerKg: 1.6, lemakPct: 0.25, teks: 'surplus 300 kkal' },
      'bulking':     { kkal: 500,  proteinPerKg: 1.8, lemakPct: 0.25, teks: 'surplus 500 kkal' }
    };
    const aktivitas = (id) => AKTIVITAS.find((a) => a.id === id) || null;

    /** Data profil yang masih kurang untuk menghitung, [] bila lengkap. */
    function kurang(p) {
      const k = [];
      if (p.gender !== 'perempuan' && p.gender !== 'laki-laki') k.push('jenis kelamin');
      if (!p.age) k.push('usia');
      if (!p.height) k.push('tinggi badan');
      if (!p.weight) k.push('berat badan');
      if (!aktivitas(p.aktivitas)) k.push('tingkat aktivitas');
      return k;
    }

    /** Target dan rincian hitungannya, atau null bila profil belum lengkap. */
    function hitung(p, goalId) {
      if (kurang(p).length) return null;
      const t = TUJUAN[goalId] || TUJUAN['jaga-berat'];
      const lk = p.gender === 'laki-laki';
      const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (lk ? 5 : -161);
      const akt = aktivitas(p.aktivitas);
      const tdee = bmr * akt.f;
      const lantai = Math.max(bmr, lk ? 1500 : 1200);
      const kcal = Math.round(Math.max(tdee + t.kkal, lantai));
      const protein = Math.round(p.weight * t.proteinPerKg);
      const fat = Math.round((kcal * t.lemakPct) / 9);
      const carb = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
      return {
        targets: { kcal, carb, protein, fat },
        bmr: Math.round(bmr), tdee: Math.round(tdee), aktivitas: akt,
        penyesuaian: t.kkal, dilantai: kcal === Math.round(lantai) && tdee + t.kkal < lantai,
        tujuan: t,
        persen: {
          carb: Math.round((carb * 4 / kcal) * 100),
          protein: Math.round((protein * 4 / kcal) * 100),
          fat: Math.round((fat * 9 / kcal) * 100)
        }
      };
    }

    /** Target untuk profil & tujuan: hasil hitungan, atau paket tetap sebagai cadangan. */
    function targetUntuk(p, goalId) {
      const h = hitung(p, goalId);
      return h ? h.targets : Object.assign({}, D.goal(goalId).targets);
    }

    /**
     * Menulis ulang profile.targets dari profil — kecuali pengguna sedang
     * memakai target yang ia ketik sendiri (targetManual).
     */
    function terapkan(profil, paksa) {
      if (profil.targetManual && !paksa) return false;
      profil.targets = targetUntuk(profil, profil.goal);
      if (paksa) profil.targetManual = false;
      return true;
    }

    return { AKTIVITAS, TUJUAN, aktivitas, kurang, hitung, targetUntuk, terapkan };
  })();

  /* ============================================================
     5. KONSULTASI — pesan disinkronkan lewat Supabase (tabel messages)
     ============================================================
     Sumber kebenaran percakapan adalah Supabase bila
     tersambung; salinan lokal tetap disimpan agar riwayat terbaca
     saat luring dan agar pesan tidak hilang bila jaringan putus.
     ============================================================ */
  const Consult = (function () {

    function record(id) { return Store.state.consults.find((c) => c.id === id) || null; }

    /**
     * Percakapan contoh milik akun tamu hanya ada di perangkat ini. Dulu
     * ID-nya tetap ('cs-demo') dan sama untuk SEMUA tamu, sehingga begitu
     * ikut dikirim ke server, tamu-tamu berbagi satu percakapan dan satu
     * ruang panggilan. Percakapan seperti itu tidak pernah menyentuh server.
     * 'cs-demo' dikenali juga untuk data lama di localStorage.
     */
    function isLocal(idOrC) {
      const c = typeof idOrC === 'string' ? record(idOrC) : idOrC;
      if (c) return !!c.local || c.id === 'cs-demo';
      return idOrC === 'cs-demo';
    }
    const online = (id) => TC.FB && TC.FB.ready && !isLocal(id);

    /**
     * Ringkasan terbaca untuk pesan kartu (vital / sesi makan). Disimpan di
     * `text` supaya pesan tetap bermakna di perangkat lain, notifikasi, atau
     * ketika kolom kind/data belum ada di server.
     */
    function cardText(kind, data) {
      const d = data || {};
      if (kind === 'vitals') {
        return `Ringkasan vital: detak jantung ${d.hr} bpm · SpO₂ ${d.spo2}% · ` +
               `suhu ${d.temp} °C · tekanan darah ${d.sys}/${d.dia} mmHg`;
      }
      if (kind === 'meal') {
        return `Sesi makan: ${(d.items || []).join(', ') || '—'} · puncak ${d.peak} mg/dL ` +
               `(+${d.delta}) · karbohidrat ${d.carb} g · ${d.kcal} kkal`;
      }
      return '';
    }

    /**
     * Data kartu sesi makan dibawa utuh, bukan hanya id-nya: dokter di
     * perangkat lain tidak memiliki riwayat makan pasien di localStorage.
     */
    function mealCard(meal) {
      return {
        id: meal.id, at: meal.at, items: meal.items.map((i) => i.n),
        peak: meal.peak, delta: meal.delta,
        carb: meal.nutrition.carb, kcal: meal.nutrition.kcal
      };
    }

    /**
     * @param {string} doctorId
     * @param {string} mode      'chat' | 'audio' | 'video'
     * @param {string} [patientId]  diisi bila percakapan dibuka dokter dari
     *   halaman pasien, supaya riwayat konsultasi pasien itu dapat dikumpulkan.
     *   Hanya disimpan lokal; tabel consults di Supabase tidak memiliki kolomnya.
     */
      function start(doctorId, mode, patientId) {
      const doc = D.doctor(doctorId);

      // Lanjutkan percakapan aktif yang sudah ada dengan dokter ini,
      // daripada selalu membuat sesi baru setiap kali "Mulai Chat" diklik.
      const existing = Store.state.consults.find((c) =>
        c.doctorId === doctorId && c.status === 'active' && !isLocal(c) &&
        (patientId ? c.patientId === patientId : true)
      );
      if (existing) return existing;

      // ID konsultasi sekaligus menjadi ID ruang panggilan dan dibagikan lewat
      // tautan undangan, sehingga ikut menentukan hak akses — pakai pembangkit
      // kriptografis, bukan uid() yang berbasis Math.random.
      const id = TC.secureId('cs');
      const c = {
        id, doctorId, mode: mode || 'chat',
        startedAt: Date.now(), status: 'active', messages: []
      };
      if (patientId) c.patientId = patientId;
      Store.update((s) => { s.consults.unshift(c); });

      if (TC.FB && TC.FB.ready) TC.Chat.ensure(id, c);

      push(id, { from: 'sys', text: 'Konsultasi dimulai. Sampaikan keluhan Anda selengkap mungkin.' });
      push(id, {
        from: 'doc',
        text: `Selamat datang, saya ${doc.name}. Ada yang bisa saya bantu hari ini? ` +
              'Silakan ceritakan keluhan yang Anda rasakan.'
      });
      return c;
    }

    /** Menyimpan pesan ke salinan lokal bila belum ada (dedup lewat mid). */
    function mirror(id, msg) {
      let added = false;
      Store.update((s) => {
        const c = s.consults.find((x) => x.id === id);
        if (!c) return;
        if (msg.mid && c.messages.some((m) => m.mid === msg.mid)) return;
        c.messages.push(msg);
        c.messages.sort((a, b) => (a.at || 0) - (b.at || 0));
        added = true;
      });
      return added;
    }

    /**
     * Mengirim pesan. Salinan lokal selalu ditulis; bila Supabase siap dan
     * percakapannya bukan percakapan contoh, pesan juga di-INSERT ke server.
     */
    function push(id, msg) {
      const m = Object.assign({ mid: uid('m'), at: Date.now() }, msg);
      if (m.kind && !m.text) m.text = cardText(m.kind, m.data);
      // Salinan lokal ditulis lebih dulu agar pesan tetap muncul walau
      // jaringan lambat; pendengar postgres_changes menyaringnya lewat mid.
      mirror(id, m);
      if (online(id)) TC.Chat.send(id, m).catch(() => {});
      return m;
    }

    /**
     * Membuat catatan lokal untuk percakapan yang sudah ada di server —
     * dipakai ketika tautan undangan dibuka di perangkat lain.
     */
    function adopt(id) {
      if (record(id)) return Promise.resolve(record(id));
      if (!(TC.FB && TC.FB.ready)) return Promise.resolve(null);
      return TC.Chat.meta(id).then((meta) => {
        if (!meta) return null;
        const c = {
          id, doctorId: meta.doctorId, mode: meta.mode || 'chat',
          startedAt: meta.startedAt || Date.now(),
          status: meta.status || 'active', messages: []
        };
        Store.update((s) => { s.consults.unshift(c); });
        return c;
      });
    }

    /** Berlangganan pesan dari server; mengembalikan pemutus langganan. */
    function subscribe(id, onChange) {
      if (!online(id)) return () => {};
      return TC.Chat.subscribe(id, (m) => {
        if (mirror(id, m) && onChange) onChange(m);
      });
    }

    function replyTo(text) {
      const t = String(text || '').toLowerCase();
      for (const rule of D.REPLY_RULES) {
        if (rule.k.some((k) => t.indexOf(k) !== -1)) return rule.r;
      }
      return pick(D.REPLY_FALLBACK);
    }

    function end(id, note) {
      Store.update((s) => {
        const c = s.consults.find((x) => x.id === id);
        if (!c) return;
        c.status = 'done';
        c.endedAt = Date.now();
        c.note = note || null;
      });
      if (TC.FB && TC.FB.online && !isLocal(id)) TC.Chat.setStatus(id, 'done');
    }

    /**
     * Konsultasi yang tercatat untuk seorang pasien, terbaru lebih dulu.
     * `consults` disusun dengan unshift sehingga indeks kecil berarti lebih
     * baru; indeks itu dipakai sebagai pemecah seri ketika `startedAt` sama.
     */
    function forPatient(patientId) {
      if (!patientId) return [];
      return Store.state.consults
        .map((c, i) => ({ c, i }))
        .filter((x) => x.c.patientId === patientId)
        .sort((a, b) => ((b.c.startedAt || 0) - (a.c.startedAt || 0)) || (a.i - b.i))
        .map((x) => x.c);
    }

    /**
     * Menyamakan daftar konsultasi lokal dengan yang tercatat di server —
     * supaya percakapan yang dimulai dari sisi lain (dokter atau pasien,
     * lewat cara apa pun, bukan cuma lewat panggilan) ikut kelihatan.
     */
    async function syncFromServer() {
      if (!(TC.FB && TC.FB.ready)) return;
      try {
        const user = await TC.FB.ensureAuth();
        const idsSet = new Set();

        // Jalur 1: percakapan yang saya sudah resmi jadi anggotanya
        // (biasanya sisi Pasien, atau sisi Dokter yang pernah ikut call).
        const { data: viaMember } = await TC.FB.sb.from('consult_members').select('consult_id').eq('user_id', user.id);
        (viaMember || []).forEach((r) => idsSet.add(r.consult_id));

        // Jalur 2: percakapan yang ditujukan ke SAYA sebagai dokter,
        // walau saya belum resmi jadi anggota (kasus: chat murni tanpa call).
        const u = TC.Store.user();
        if (u && u.doctorId) {
          const { data: viaDoctor } = await TC.FB.sb.from('consults').select('id').eq('doctor_id', u.doctorId);
          (viaDoctor || []).forEach((r) => idsSet.add(r.id));
        }

        for (const id of idsSet) {
          if (record(id)) continue;
          const c = await adopt(id);
          if (!c) continue;
          const { data: pesan } = await TC.FB.sb.from('messages').select('*').eq('consult_id', id).order('at', { ascending: true });
          (pesan || []).forEach((v) => mirror(id, TC.Chat.dariBaris(v)));
        }
      } catch (e) {
        console.warn('[TeleCare] gagal sinkron daftar konsultasi:', e.message);
      }
    }

    return {
      start, get: record, adopt, push, mirror, subscribe, replyTo, end, forPatient, syncFromServer,
      isLocal, cardText, mealCard
    };
  })();

  /* ============================================================
     5b. CATATAN KLINIS
     ============================================================
     Catatan dokter pada seorang pasien. Bersifat tambah-saja pada
     tiap butirnya: teks yang sudah tersimpan tidak dapat diubah,
     hanya dihapus seluruhnya, supaya isi catatan tidak berubah
     diam-diam setelah dijadikan rujukan.

     Seperti data lain di purwarupa ini, catatan tersimpan di
     localStorage perangkat itu saja — belum ada penyimpanan bersama
     antar-dokter.
     ============================================================ */
  const Notes = (function () {

    /**
     * Terbaru lebih dulu. Indeks penyisipan dipakai sebagai pemecah seri:
     * dua catatan dapat memiliki `at` yang sama persis bila ditulis dalam
     * milidetik yang sama, dan tanpa pemecah itu urutannya bergantung pada
     * kestabilan sort — yang justru menampilkan yang terlama di atas.
     */
    function list(patientId) {
      const all = Store.state.clinicalNotes || {};
      const arr = all[patientId] || [];
      return arr
        .map((n, i) => ({ n, i }))
        .sort((a, b) => ((b.n.at || 0) - (a.n.at || 0)) || (b.i - a.i))
        .map((x) => x.n);
    }

    function add(patientId, text, author, role) {
      const isi = String(text || '').trim();
      if (!patientId || !isi) return null;
      const note = {
        id: uid('cn'),
        at: Date.now(),
        author: author || 'Tidak diketahui',
        role: role || null,
        text: isi.slice(0, 4000)
      };
      Store.update((s) => {
        if (!s.clinicalNotes) s.clinicalNotes = {};
        if (!s.clinicalNotes[patientId]) s.clinicalNotes[patientId] = [];
        s.clinicalNotes[patientId].push(note);
      });
      return note;
    }

    function remove(patientId, noteId) {
      let ok = false;
      Store.update((s) => {
        const arr = s.clinicalNotes && s.clinicalNotes[patientId];
        if (!arr) return;
        const n = arr.length;
        s.clinicalNotes[patientId] = arr.filter((x) => x.id !== noteId);
        ok = s.clinicalNotes[patientId].length !== n;
      });
      return ok;
    }

    function count(patientId) { return list(patientId).length; }

    return { list, add, remove, count };
  })();

  /* ============================================================
     5c. HASIL UKUR PERANGKAT (TeleBand, paket HASIL)
     ============================================================
     Satu hasil = satu sesi ukur diskrit. Disimpan dua kali:
       - salinan lokal (Store.state.readings) segera, supaya tidak hilang;
       - tabel Supabase `device_readings`, sumber kebenaran.

     Alat baru boleh menghapus hasilnya (HAPUS) setelah SERVER mengonfirmasi.
     Salinan lokal saja tidak cukup: peramban bisa dibersihkan. Hasil yang
     gagal terkirim tetap ada di alat dan dikirim ulang di koneksi berikut;
     kunci serial + id + epoch membuat pengiriman ulang itu tidak berganda.
     ============================================================ */
  const Readings = (function () {
    const MAKS_LOKAL = 300;
    let mengirim = false;

    const kunci = (serial, id, epoch) => serial + ':' + id + ':' + epoch;
    const semua = () => Store.state.readings || [];
    const cari = (k) => semua().find((x) => x.kunci === k) || null;

    /** Terbaru lebih dulu; hasil tanpa stempel waktu valid memakai waktu diterima. */
    function list() {
      return semua().slice().sort((a, b) => (b.waktu || b.diterima) - (a.waktu || a.diterima));
    }

    function tandai(k, patch) {
      Store.update((s) => {
        const x = (s.readings || []).find((r) => r.kunci === k);
        if (x) Object.assign(x, patch);
      });
    }

    /** Bentuk baris tabel device_readings. */
    function keBaris(x) {
      return {
        device_serial: x.serial,
        device_unit: x.unit,
        firmware: x.firmware,
        device_result_id: x.idAlat,
        device_epoch: x.epoch,
        measured_at: x.waktuValid ? new Date(x.epoch * 1000).toISOString() : null,
        time_valid: x.waktuValid,
        duration_s: x.durasi,
        bpm: x.bpm, spo2: x.spo2,
        glucose_est: x.glukosa, sys_est: x.sis, dia_est: x.dia,
        source: x.sumber,
        flags: x.flag
      };
    }

    async function kirim(x) {
      if (!TC.FB || !TC.FB.ready || !TC.ReadingsDB) throw new Error('Server belum siap.');
      await TC.ReadingsDB.simpan(keBaris(x));
      tandai(x.kunci, { tersinkron: true, galat: null, tersinkronAt: Date.now() });
      return true;
    }

    /**
     * Menerima satu paket HASIL. Mengembalikan benar HANYA bila hasil itu
     * sudah ada di server — pemanggil memakainya untuk memutuskan HAPUS.
     */
    async function terima(r, info) {
      const k = kunci(info.serial, r.id, r.epoch);
      let x = cari(k);
      if (x && x.tersinkron) return true;          // kiriman ulang dari alat

      if (!x) {
        x = {
          kunci: k, serial: info.serial, unit: info.unit, firmware: info.firmware,
          idAlat: r.id, epoch: r.epoch, waktuValid: r.waktuValid,
          waktu: r.waktuValid ? r.epoch * 1000 : null,
          durasi: r.durasi, bpm: r.bpm, spo2: r.spo2,
          glukosa: r.glukosa, sis: r.sis, dia: r.dia,
          sumber: r.sumber, flag: r.flag,
          diterima: Date.now(), tersinkron: false, galat: null
        };
        Store.update((s) => {
          s.readings = (s.readings || []).concat([x]);
          // Pangkas yang sudah aman di server lebih dulu; yang belum terkirim
          // tidak pernah dibuang.
          if (s.readings.length > MAKS_LOKAL) {
            const lebih = s.readings.length - MAKS_LOKAL;
            let dibuang = 0;
            s.readings = s.readings.filter((y) => {
              if (dibuang < lebih && y.tersinkron) { dibuang++; return false; }
              return true;
            });
          }
        });
      }

      try {
        return await kirim(x);
      } catch (e) {
        const pesan = (e && e.message) || 'gagal';
        console.warn('[TeleCare] hasil ukur belum tersimpan di server:', pesan);
        tandai(k, { galat: pesan });
        return false;
      }
    }

    /** Mengirim ulang salinan lokal yang belum sampai ke server. */
    async function kirimTertunda() {
      if (mengirim) return 0;
      mengirim = true;
      let n = 0;
      try {
        for (const x of semua().filter((y) => !y.tersinkron)) {
          try { await kirim(x); n++; }
          catch (e) { tandai(x.kunci, { galat: (e && e.message) || 'gagal' }); break; }
        }
      } finally { mengirim = false; }
      return n;
    }

    const belumTerkirim = () => semua().filter((x) => !x.tersinkron).length;

    return { list, terima, kirimTertunda, belumTerkirim, keBaris, kunci };
  })();

  /* ============================================================
     5d. TELEBAND — sambungan alat sungguhan
     ============================================================
     Perekat antara TC.TeleBand (protokol, teleband-ble.js), Vitals, hub
     perangkat, dan Readings. Satu alat pada satu waktu; sambungan bertahan
     antar-layar karena aplikasi tidak pernah memuat ulang halaman.

     Keputusan tim (dokumen konteks, butir 4):
       A. LIVE hanya pratinjau; yang stabil (bukan "sementara") ikut mengisi
          Vitals. HASIL yang disimpan permanen.
       B. Glukosa disimpan dan ditampilkan dengan label eksperimental.
       C. Suhu tetap simulasi (berlabel) — alat tidak punya sensor suhu.
       D. HASIL ke Supabase; HAPUS setelah server mengonfirmasi.
     ============================================================ */
  const TeleBandLink = (function () {
    const EKSPERIMENTAL = ['glucose', 'sys', 'dia'];
    let sesi = null, info = null, nama = null, status = null, live = null;
    let devId = null, menyambung = false;
    const log = [];
    const subs = new Set();

    function emit() { subs.forEach((fn) => { try { fn(); } catch (e) { /* abaikan */ } }); }

    function catat(m) {
      log.unshift(TC.hhmm(new Date()) + '  ' + m);
      if (log.length > 60) log.length = 60;
      console.info('[TeleBand]', m);
      emit();
    }

    function ubahPerangkat(patch) {
      if (!devId) return;
      Store.update((s) => {
        const d = s.devices.find((x) => x.id === devId);
        if (d) Object.assign(d, patch);
      });
    }

    function onInfo(i, n) {
      info = i; nama = n;
      Store.update((s) => {
        let d = s.devices.find((x) => x.type === 'teleband' && x.code === i.serial);
        if (!d) {
          d = {
            id: uid('dev'), type: 'teleband', name: n, code: i.serial,
            battery: null, connected: true, real: true,
            pairedAt: Date.now(), lastSync: null, rssi: 4
          };
          s.devices.push(d);
        }
        d.name = n;
        d.firmware = i.firmware;
        d.unit = i.unit;
        d.connected = true;
        s.activeDeviceId = d.id;
        devId = d.id;
      });
    }

    function onStatus(s) {
      status = s;
      if (s.baterai != null) ubahPerangkat({ battery: s.baterai });
      // Pengukuran selesai: pratinjau dibekukan sebagai angka terakhir.
      if (!s.mengukur && live && !live.berhenti) live = Object.assign({}, live, { berhenti: true });
      emit();
    }

    function onLive(l) {
      live = l;
      // Angka yang masih "sementara" belum stabil: tampil redup di layar
      // pengukuran, tetapi tidak dimasukkan ke Vitals — beranda, tren, dan
      // eskalasi hanya menerima angka yang sudah stabil.
      if (!l.sementara) {
        const v = {};
        if (l.bpm != null) v.hr = l.bpm;
        if (l.spo2 != null) v.spo2 = l.spo2;
        if (l.glukosa != null) v.glucose = l.glukosa;
        if (l.sis != null && l.dia != null) { v.sys = l.sis; v.dia = l.dia; }
        if (Object.keys(v).length) Vitals.ingest(v, 'teleband', { eksperimental: EKSPERIMENTAL });
      }
      emit();
    }

    async function onHasil(r, i) {
      // Hasil yang baru saja selesai diukur juga mengisi Vitals — pengukuran
      // singkat bisa selesai sebelum LIVE sempat stabil. Hasil lama dari
      // antrean alat tidak dipakai: angka kemarin bukan "vital terkini".
      const selesai = (r.epoch + r.durasi) * 1000;
      if (r.waktuValid && Date.now() - selesai < 10 * 60000) {
        const v = {};
        if (r.bpm != null) v.hr = r.bpm;
        if (r.spo2 != null) v.spo2 = r.spo2;
        if (r.glukosa != null) v.glucose = r.glukosa;
        if (r.sis != null && r.dia != null) { v.sys = r.sis; v.dia = r.dia; }
        if (Object.keys(v).length) Vitals.ingest(v, 'teleband', { eksperimental: EKSPERIMENTAL });
      }
      const ok = await Readings.terima(r, i || info);
      if (ok) ubahPerangkat({ lastSync: Date.now() });
      // Glukosa hasil ukur mengisi titik sesi makan yang sedang berjalan.
      if (r.glukosa != null) {
        Meals.isiGlukosa(r.glukosa, r.waktuValid ? (r.epoch + r.durasi) * 1000 : Date.now());
      }
      emit();
      return ok;
    }

    function bersihkan(diputusPengguna) {
      sesi = null;
      live = null;
      status = null;
      ubahPerangkat({ connected: false });
      Vitals.releaseDevice();
      if (!diputusPengguna) {
        Store.notify('TeleBand terputus', (nama || 'TeleBand') + ' lepas dari Bluetooth.' +
          (TC.FITUR.simulasi ? ' Vital kembali ke simulasi.' : ''), 'warn');
      }
      emit();
    }

    /** Harus dipanggil dari gestur pengguna (klik), syarat Web Bluetooth. */
    async function sambung() {
      if (sesi && sesi.tersambung) return sesi;
      if (menyambung) throw new Error('Sedang menyambungkan.');
      menyambung = true;
      emit();
      try {
        const device = await TC.TeleBand.requestDevice();
        catat('menyambung ke ' + (device.name || 'TeleBand') + '…');
        sesi = await TC.TeleBand.connect(device, {
          onInfo, onStatus, onLive, onHasil,
          onDisconnect() { catat('terputus'); bersihkan(false); },
          onLog: catat
        });
        Store.notify('TeleBand tersambung', nama + ' · firmware ' + info.firmware, 'ok');
        // Hasil yang dulu gagal terkirim dicoba lagi selagi ada sambungan.
        Readings.kirimTertunda().then(() => emit());
        return sesi;
      } catch (e) {
        // INFO mungkin sudah terbaca (perangkat tercatat tersambung) sebelum
        // langkah berikutnya gagal.
        if (sesi) { try { sesi.putus(); } catch (x) { /* abaikan */ } }
        sesi = null;
        ubahPerangkat({ connected: false });
        if (e && e.name !== 'NotFoundError') catat('gagal menyambung: ' + e.message);
        throw e;
      } finally {
        menyambung = false;
        emit();
      }
    }

    function putus() {
      if (sesi) { try { sesi.putus(); } catch (e) { /* abaikan */ } }
      catat('diputus pengguna');
      bersihkan(true);
    }

    function wajibSesi() {
      if (!sesi || !sesi.tersambung) throw new Error('TeleBand belum tersambung.');
      return sesi;
    }

    /** Status tersambung dari sesi sebelumnya tidak berlaku setelah halaman dimuat ulang. */
    function pulihkan() {
      Store.update((s) => {
        s.devices.forEach((d) => { if (d.type === 'teleband') d.connected = false; });
      });
    }

    return {
      EKSPERIMENTAL,
      sambung, putus, pulihkan,
      mulai: () => wajibSesi().mulai(),
      stop: () => wajibSesi().stop(),
      sinkron: () => wajibSesi().sinkron(),
      hapusSemua: () => wajibSesi().hapusSemua(),
      tersambung: () => !!(sesi && sesi.tersambung),
      menyambung: () => menyambung,
      info: () => info,
      nama: () => nama,
      status: () => status,
      live: () => live,
      log: () => log.slice(),
      subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
    };
  })();

  /* ============================================================
     6. TREN 7 HARI — dihitung dari vital yang sungguh berjalan
     ============================================================
     Sebelumnya bagian ini membangkitkan angka acak (`rnd`/`rint`)
     lalu membekukannya per tanggal, sehingga tren yang ditampilkan
     pada layar Analisis sama sekali tidak berhubungan dengan apa
     pun yang terjadi di perangkat. Kini setiap pembacaan diringkas
     ke `Store.state.dailyVitals`, dan hari tanpa pemakaian benar-benar
     tampil kosong alih-alih diisi angka karangan.

     Tidur tidak ikut dihitung: tidak ada jalur yang mengukurnya.
     TeleRing mencantumkan kemampuan 'sleep' pada katalog perangkat,
     tetapi app/js/ble.js tidak pernah membacanya — jadi layar Analisis
     menyatakan datanya belum tersedia, bukan menampilkan grafik palsu.
     ============================================================ */

  const AGG_JEDA_MS = 60000;   // seberapa sering agregat ditulis ke penyimpanan
  let aggBerikut = 0;
  let langkahTerakhir = 0;

  function kunciHari(t) {
    const d = new Date(t);
    return d.getFullYear() + '-' + TC.pad2(d.getMonth() + 1) + '-' + TC.pad2(d.getDate());
  }

  /**
   * Meringkas keadaan vital saat ini ke agregat hari ini.
   * Ditulis berkala, bukan setiap pembacaan, supaya tidak menyentuh
   * localStorage tiap dua detik.
   */
  function catatAgregat(paksa) {
    const now = Date.now();
    if (!paksa && now < aggBerikut) return;
    aggBerikut = now + AGG_JEDA_MS;

    const k = kunciHari(now);
    const hr = Vitals.state.hr;
    const spo2 = Vitals.state.spo2;
    const stres = Vitals.state.stress;
    // Langkah bersifat menumpuk sejak aplikasi dibuka; yang dicatat adalah
    // pertambahannya, supaya angka harian tidak ikut ter-reset saat memuat ulang.
    const langkah = Vitals.state.steps;
    const delta = Math.max(0, langkah - langkahTerakhir);
    langkahTerakhir = langkah;

    Store.update((s) => {
      if (!s.dailyVitals) s.dailyVitals = {};
      const r = s.dailyVitals[k] || {
        n: 0, hrSum: 0, hrMin: null, stressSum: 0, spo2Min: null, steps: 0, sumber: 'sim'
      };
      r.n += 1;
      r.hrSum += hr;
      r.hrMin = r.hrMin == null ? hr : Math.min(r.hrMin, hr);
      r.stressSum += stres;
      r.spo2Min = r.spo2Min == null ? spo2 : Math.min(r.spo2Min, spo2);
      r.steps += delta;
      // Sekali saja sebuah hari memuat data sensor, hari itu ditandai 'device'.
      if (Vitals.state.source === 'device') r.sumber = 'device';
      s.dailyVitals[k] = r;

      // Simpan 30 hari terakhir saja.
      const kunci = Object.keys(s.dailyVitals).sort();
      if (kunci.length > 30) {
        kunci.slice(0, kunci.length - 30).forEach((x) => { delete s.dailyVitals[x]; });
      }
    });
  }

  /**
   * Tujuh hari terakhir. Hari tanpa pemakaian mengembalikan null pada
   * ukurannya, dan `ada: false` — pemanggil wajib menanganinya, bukan
   * menggantinya dengan angka.
   */
  /**
   * Tren 7 hari dari daftar hasil ukur: [{ t, bpm, spo2 }].
   * Detak istirahat didekati dengan bpm terendah hari itu, saturasi dengan
   * SpO₂ terendah. Hari tanpa hasil ukur: `ada: false`, nilai null.
   * Dipakai layar Analisis pasien dan layar dokter (hasil dari server).
   */
  function trenDariHasil(hasil) {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const t0 = d.getTime(), t1 = t0 + 86400000;
      const hari = (hasil || []).filter((x) => x.t >= t0 && x.t < t1);
      const bpm = hari.map((x) => x.bpm).filter((v) => typeof v === 'number');
      const spo2 = hari.map((x) => x.spo2).filter((v) => typeof v === 'number');
      out.push({
        label: TC.DAYS[d.getDay()].slice(0, 3),
        ada: bpm.length + spo2.length > 0,
        n: hari.length,
        rhr: bpm.length ? Math.min.apply(null, bpm) : null,
        spo2: spo2.length ? Math.min.apply(null, spo2) : null,
        stress: null, steps: 0,
        sumber: hari.length ? 'device' : null
      });
    }
    return out;
  }

  /** Hasil ukur lokal (TeleBand) dalam bentuk { t, bpm, spo2, ... }. */
  function hasilLokal() {
    return Readings.list().map((x) => ({
      t: x.waktu || x.diterima, bpm: x.bpm, spo2: x.spo2,
      glukosa: x.glukosa, sis: x.sis, dia: x.dia
    }));
  }

  /** Baris tabel device_readings (server) dalam bentuk yang sama. */
  function hasilDariBaris(rows) {
    return (rows || []).map((r) => ({
      t: new Date(r.measured_at || r.received_at).getTime(),
      bpm: r.bpm, spo2: r.spo2, glukosa: r.glucose_est, sis: r.sys_est, dia: r.dia_est
    })).sort((a, b) => b.t - a.t);
  }

  /**
   * Status triase satu hasil ukur, memakai ambang yang sama dengan
   * eskalasi (push.js). Tensi dan glukosa TeleBand tidak dipakai: keduanya
   * estimasi eksperimental.
   */
  function statusHasil(x) {
    if (!x || (x.bpm == null && x.spo2 == null)) return 'none';
    const hr = x.bpm, sp = x.spo2;
    if ((sp != null && sp < 90) || (hr != null && (hr > 130 || hr < 45))) return 'crit';
    if ((sp != null && sp < 94) || (hr != null && (hr > 110 || hr < 50))) return 'warn';
    return 'ok';
  }

  function weekTrend() {
    if (!TC.FITUR.simulasi) return trenDariHasil(hasilLokal());
    const dv = Store.state.dailyVitals || {};
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const r = dv[kunciHari(d.getTime())];
      const ada = !!(r && r.n);
      out.push({
        label: TC.DAYS[d.getDay()].slice(0, 3),
        ada,
        // Detak jantung istirahat didekati dengan nilai terendah hari itu.
        rhr: ada ? Math.round(r.hrMin) : null,
        stress: ada ? Math.round(r.stressSum / r.n) : null,
        spo2: ada && r.spo2Min != null ? Math.round(r.spo2Min) : null,
        steps: r ? Math.round(r.steps) : 0,
        sumber: r ? r.sumber : null
      });
    }
    return out;
  }

  // Agregat hari ini ikut ditulis saat tab ditinggalkan, supaya pembacaan
  // sejak penulisan terakhir tidak hilang.
  window.addEventListener('pagehide', () => {
    try { catatAgregat(true); } catch (e) { /* abaikan */ }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { try { catatAgregat(true); } catch (e) { /* abaikan */ } }
  });

  TC.Vitals = Vitals;
  TC.Devices = Devices;
  TC.Meals = Meals;
  TC.Gizi = Gizi;
  TC.Consult = Consult;
  TC.Notes = Notes;
  TC.Readings = Readings;
  TC.TeleBandLink = TeleBandLink;
  TC.Calib = Calib;
  TC.EcgRenderer = EcgRenderer;
  TC.ecgAt = ecgAt;
  TC.weekTrend = weekTrend;
  TC.trenDariHasil = trenDariHasil;
  TC.hasilLokal = hasilLokal;
  TC.hasilDariBaris = hasilDariBaris;
  TC.statusHasil = statusHasil;
})(window.TC);
