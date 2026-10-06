/* ============================================================
   TeleCare App — teleband-ble.js
   Protokol BLE khusus TeleBand (ESP32-C6 + MAX30102, firmware tim).

   Terpisah dari ble.js dengan sengaja: ble.js membaca profil standar
   Bluetooth SIG (0x180D, 0x180F, ...) untuk wearable generik, sedangkan
   TeleBand memakai service dan format paket buatan sendiri. Keduanya
   jalur yang berbeda, bukan satu jalur yang ditambal.

   Kontrak protokol: docs/PROTOKOL_BLE.md dan tc_proto.h di repo firmware.
   Pola sambungan mengikuti tools/web-test/index.html di repo yang sama —
   klien referensi yang sudah terbukti jalan dengan alat fisik.

   Hal yang mudah salah dan ditangani di sini:
   - Web Bluetooth menolak dua operasi GATT bersamaan, jadi SEMUA tulisan
     ke KONTROL lewat satu antrean.
   - Metrik bernilai 0 berarti "tidak terukur"; yang menentukan ada/tidaknya
     angka adalah bit flag, bukan nilainya.
   - HASIL baru boleh di-HAPUS dari alat setelah pemanggil menyatakan
     hasil itu benar-benar tersimpan. Tanpa HAPUS, alat mengirim ulang di
     koneksi berikutnya — itu jaring pengaman, bukan bug.
   - Glukosa dan tensi adalah estimasi EKSPERIMENTAL menurut firmware
     sendiri; parser menandainya, tampilan wajib melabelinya.
   ============================================================ */
(function (TC) {
  'use strict';

  /* ============================================================
     1. UUID, opcode, dan konstanta protokol v1
     ============================================================ */
  const SUF = '-5443-4172-652d-54656c654361';
  const UUID = {
    svc:    '7e1e0001' + SUF,
    info:   '7e1e0002' + SUF,   // read
    ctl:    '7e1e0003' + SUF,   // write
    status: '7e1e0004' + SUF,   // read + notify
    live:   '7e1e0005' + SUF,   // notify, tiap ±1 detik selama mengukur
    hasil:  '7e1e0006' + SUF    // notify, satu paket per hasil tersimpan
  };

  const OP = {
    SET_WAKTU: 0x01, MULAI_UKUR: 0x02, STOP_UKUR: 0x03, SINKRON: 0x04,
    HAPUS: 0x05, HAPUS_SEMUA: 0x06, SET_KALIBRASI: 0x07
  };

  const PANJANG = { info: 10, status: 10, live: 14, hasil: 16 };

  // Byte state sensor (LIVE byte 1, STATUS byte 3). 1 = TC_ST_TAK_MENEMPEL di
  // tc_proto.h ("belum ada kulit"): TeleBand dipakai di pergelangan, sensor di
  // titik denyut nadi — BUKAN di jari (firmware disetel untuk pergelangan).
  const STATE = ['sensor mati', 'sensor belum menempel', 'menstabilkan sinyal',
                 'mencari detak', 'stabil', 'sensor tidak terdeteksi'];

  // Flag metrik (LIVE byte 12, HASIL byte 15).
  const F = { BPM: 0x01, SPO2: 0x02, GLUKOSA: 0x04, TENSI: 0x08,
              SEMENTARA: 0x10, CUKUP: 0x20, WAKTU_OK: 0x40 };
  // Flag STATUS byte 1.
  const S = { MENGUKUR: 0x01, MENGISI: 0x02, SENSOR: 0x04, WAKTU: 0x08 };

  const PROTOKOL_DIDUKUNG = 1;

  /* ============================================================
     2. Pembacaan paket — murni, dapat diuji dengan vektor byte
     ============================================================ */
  function asView(data) {
    if (data instanceof DataView) return data;
    if (data instanceof ArrayBuffer) return new DataView(data);
    if (data && data.buffer) return new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (Array.isArray(data)) return new DataView(new Uint8Array(data).buffer);
    return null;
  }

  const hex2 = (b) => b.toString(16).padStart(2, '0').toUpperCase();

  /** Angka hanya dikembalikan bila bit flag-nya menyala DAN bukan 0; selain itu null. */
  const bila = (ada, nilai) => (ada && nilai > 0 ? nilai : null);

  const parse = {

    /** INFO (10 byte): versi protokol & firmware, MAC/serial, nomor unit. */
    info(data) {
      const v = asView(data);
      if (!v || v.byteLength < PANJANG.info) return null;
      let serial = '';
      for (let i = 3; i < 9; i++) serial += hex2(v.getUint8(i));
      return {
        protokol: v.getUint8(0),
        firmware: v.getUint8(1) + '.' + v.getUint8(2),
        serial,
        unit: v.getUint8(9) || null
      };
    },

    /** STATUS (10 byte): dikirim saat berubah dan tiap 10 detik. */
    status(data) {
      const v = asView(data);
      if (!v || v.byteLength < PANJANG.status) return null;
      const bat = v.getUint8(0);
      const f = v.getUint8(1);
      const state = v.getUint8(3);
      return {
        baterai: bat === 255 ? null : bat,          // 255 = belum terbaca
        mengukur: !!(f & S.MENGUKUR),
        mengisi: !!(f & S.MENGISI),
        sensorTerpasang: !!(f & S.SENSOR),
        jamTersetel: !!(f & S.WAKTU),
        tersimpan: v.getUint8(2),
        state,
        stateTeks: STATE[state] || ('state ' + state),
        kemajuan: v.getUint8(4),
        epochAlat: v.getUint32(5, true),
        unit: v.getUint8(9) || null
      };
    },

    /** LIVE (14 byte): angka realtime selama mengukur. */
    live(data) {
      const v = asView(data);
      if (!v || v.byteLength < PANJANG.live) return null;
      const f = v.getUint8(12);
      const state = v.getUint8(1);
      const tensi = !!(f & F.TENSI);
      return {
        urut: v.getUint8(0),
        state,
        stateTeks: STATE[state] || ('state ' + state),
        kemajuan: v.getUint8(2),
        bpm: bila(f & F.BPM, v.getUint8(3)),
        spo2: bila(f & F.SPO2, v.getUint8(4)),
        glukosa: bila(f & F.GLUKOSA, v.getUint16(5, true)),
        sis: bila(tensi, v.getUint8(7)),
        dia: bila(tensi, v.getUint8(8)),
        durasi: v.getUint16(9, true),
        detakTerbaca: v.getUint8(11),
        sementara: !!(f & F.SEMENTARA),   // belum stabil: tampilkan redup
        cukup: !!(f & F.CUKUP),           // data sudah cukup: boleh di-stop
        flag: f
      };
    },

    /** HASIL (16 byte): satu hasil ukur yang tersimpan di alat. */
    hasil(data) {
      const v = asView(data);
      if (!v || v.byteLength < PANJANG.hasil) return null;
      const f = v.getUint8(15);
      const epoch = v.getUint32(2, true);
      const tensi = !!(f & F.TENSI);
      return {
        id: v.getUint16(0, true),
        epoch,                                   // 0 = jam belum tersetel
        waktuValid: !!(f & F.WAKTU_OK) && epoch > 0,
        durasi: v.getUint16(6, true),
        bpm: bila(f & F.BPM, v.getUint8(8)),
        spo2: bila(f & F.SPO2, v.getUint8(9)),
        glukosa: bila(f & F.GLUKOSA, v.getUint16(10, true)),
        sis: bila(tensi, v.getUint8(12)),
        dia: bila(tensi, v.getUint8(13)),
        sumber: v.getUint8(14) === 1 ? 'web' : 'tombol',
        flag: f
      };
    }
  };

  /* ============================================================
     3. Penyusun perintah KONTROL
     ============================================================ */
  const perintah = {
    setWaktu(detikEpoch) {
      const b = new Uint8Array(5);
      b[0] = OP.SET_WAKTU;
      new DataView(b.buffer).setUint32(1, detikEpoch >>> 0, true);
      return b;
    },
    hapus(id) {
      const b = new Uint8Array(3);
      b[0] = OP.HAPUS;
      new DataView(b.buffer).setUint16(1, id, true);
      return b;
    },
    /** Offset per unit: glukosa i16 (mg/dL), sistol i8, diastol i8 (mmHg). */
    kalibrasi(glu, sis, dia) {
      const b = new Uint8Array(5);
      const dv = new DataView(b.buffer);
      b[0] = OP.SET_KALIBRASI;
      dv.setInt16(1, Math.max(-32768, Math.min(32767, Math.round(glu || 0))), true);
      dv.setInt8(3, Math.max(-128, Math.min(127, Math.round(sis || 0))));
      dv.setInt8(4, Math.max(-128, Math.min(127, Math.round(dia || 0))));
      return b;
    },
    op(kode) { return Uint8Array.of(kode); }
  };

  /* ============================================================
     4. Sambungan
     ============================================================ */
  const TeleBand = {
    UUID, OP, F, S, STATE, parse, perintah,

    supported() {
      return !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
    },

    /** Harus dipanggil dari gestur pengguna. Hanya menampilkan unit TeleBand. */
    async requestDevice() {
      if (!TeleBand.supported()) {
        throw new Error('Web Bluetooth tidak tersedia. Pakai Chrome/Edge (desktop atau Android) lewat HTTPS.');
      }
      return navigator.bluetooth.requestDevice({ filters: [{ services: [UUID.svc] }] });
    },

    /**
     * Menyambung dengan urutan wajib dari protokol:
     *   1. baca INFO (memicu dialog pairing OS — perilaku yang diharapkan)
     *   2. langgani STATUS, LIVE, HASIL (alat lalu mengirim hasil tersimpan)
     *   3. tulis SET_WAKTU
     *
     * @param {BluetoothDevice} device
     * @param {object} on {
     *   onInfo(info, nama), onStatus(s), onLive(l),
     *   onHasil(r, info) -> Promise<boolean>  benar = sudah tersimpan, HAPUS dikirim,
     *   onDisconnect(), onLog(teks)
     * }
     */
    async connect(device, on) {
      on = on || {};
      const catat = (m) => { if (on.onLog) on.onLog(m); };

      const server = await device.gatt.connect();
      const svc = await server.getPrimaryService(UUID.svc);

      const info = parse.info(await (await svc.getCharacteristic(UUID.info)).readValue());
      if (!info) throw new Error('Paket INFO tidak dikenali.');
      catat('INFO: protokol v' + info.protokol + ', firmware ' + info.firmware + ', serial ' + info.serial);
      if (info.protokol !== PROTOKOL_DIDUKUNG) {
        // Tetap lanjut, tetapi dicatat: tata letak paket mungkin sudah berubah.
        catat('PERINGATAN: aplikasi ini untuk protokol v' + PROTOKOL_DIDUKUNG +
              ', alat melaporkan v' + info.protokol);
      }
      const nama = device.name || ('TeleCare-' + info.serial.slice(-6));
      // Dipanggil SEBELUM berlangganan: paket HASIL dapat tiba sebelum
      // connect() selesai, dan penerimanya perlu tahu serial alat.
      if (on.onInfo) on.onInfo(info, nama);

      const ctl = await svc.getCharacteristic(UUID.ctl);

      /* Satu antrean untuk semua penulisan. Kegagalan satu perintah tidak
         memutus antrean, tetapi tetap diteruskan ke pemanggilnya. */
      let antre = Promise.resolve();
      function kirim(bytes, nama) {
        const tugas = antre.then(() => ctl.writeValueWithResponse(bytes));
        antre = tugas.then(() => catat('→ ' + nama),
                           (e) => catat('galat ' + nama + ': ' + (e && e.message)));
        return tugas;
      }

      // Hasil yang sudah diproses pada koneksi ini — SINKRON dapat membuat
      // alat mengirim ulang hasil yang HAPUS-nya belum selesai diproses.
      const sedangDiproses = new Set();
      const langganan = [];

      async function langgani(uuid, fn) {
        const c = await svc.getCharacteristic(uuid);
        const h = (ev) => { try { fn(ev.target.value); } catch (e) { catat('galat pembaca: ' + e.message); } };
        c.addEventListener('characteristicvaluechanged', h);
        await c.startNotifications();
        langganan.push(() => {
          c.removeEventListener('characteristicvaluechanged', h);
          if (c.stopNotifications) c.stopNotifications().catch(() => {});
        });
        return c;
      }

      const stChr = await langgani(UUID.status, (v) => {
        const s = parse.status(v);
        if (s && on.onStatus) on.onStatus(s);
      });
      await langgani(UUID.live, (v) => {
        const l = parse.live(v);
        if (l && on.onLive) on.onLive(l);
      });
      await langgani(UUID.hasil, (v) => {
        const r = parse.hasil(v);
        if (!r) return;
        const kunci = r.id + '@' + r.epoch;
        if (sedangDiproses.has(kunci)) return;
        sedangDiproses.add(kunci);
        catat('← HASIL id ' + r.id);
        Promise.resolve(on.onHasil ? on.onHasil(r, info) : false)
          .then((tersimpan) => {
            if (tersimpan) return kirim(perintah.hapus(r.id), 'HAPUS ' + r.id);
            // Tidak di-HAPUS: alat menyimpannya dan mengirim ulang nanti.
            catat('HASIL id ' + r.id + ' belum tersimpan — tetap di alat');
            sedangDiproses.delete(kunci);
            return null;
          })
          .catch((e) => { sedangDiproses.delete(kunci); catat('galat simpan HASIL: ' + e.message); });
      });

      // STATUS awal dibaca langsung, tidak menunggu notifikasi berikutnya.
      const stAwal = parse.status(await stChr.readValue());
      if (stAwal && on.onStatus) on.onStatus(stAwal);

      kirim(perintah.setWaktu(Math.floor(Date.now() / 1000)), 'SET_WAKTU').catch(() => {});

      let aktif = true;
      const onLost = () => {
        aktif = false;
        langganan.length = 0;
        if (on.onDisconnect) on.onDisconnect();
      };
      device.addEventListener('gattserverdisconnected', onLost);

      return {
        info,
        nama,
        get tersambung() { return aktif && device.gatt.connected; },
        mulai: () => kirim(perintah.op(OP.MULAI_UKUR), 'MULAI_UKUR'),
        stop: () => kirim(perintah.op(OP.STOP_UKUR), 'STOP_UKUR'),
        sinkron: () => kirim(perintah.op(OP.SINKRON), 'SINKRON'),
        hapus: (id) => kirim(perintah.hapus(id), 'HAPUS ' + id),
        hapusSemua: () => kirim(perintah.op(OP.HAPUS_SEMUA), 'HAPUS_SEMUA'),
        setKalibrasi: (glu, sis, dia) => kirim(perintah.kalibrasi(glu, sis, dia), 'SET_KALIBRASI'),
        putus() {
          aktif = false;
          device.removeEventListener('gattserverdisconnected', onLost);
          langganan.forEach((f) => { try { f(); } catch (e) { /* abaikan */ } });
          langganan.length = 0;
          try { if (device.gatt.connected) device.gatt.disconnect(); } catch (e) { /* abaikan */ }
        }
      };
    }
  };

  TC.TeleBand = TeleBand;
})(window.TC);
