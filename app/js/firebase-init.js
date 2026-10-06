/* ============================================================
   TeleCare App — firebase-init.js
   Memuat Firebase JS SDK (modular, dari CDN resmi gstatic) lalu
   membuat app, Auth, Firestore, dan AI Logic. Hasilnya di
   window.TELECARE_FB, diumumkan lewat event `telecare:fb-ready`
   (gagal: `telecare:fb-error`). firebase.js menunggu event itu.

   Skrip ini klasik (bukan type="module") supaya urutan <script> di
   app/index.html tetap menentukan urutan muat; SDK diambil lewat
   import() dinamis. Versi dikunci — SDK ikut tersimpan service worker,
   jadi aplikasi tetap terbuka saat luring.
   ============================================================ */
(function () {
  'use strict';

  var VERSI = '12.10.0';
  var CDN = 'https://www.gstatic.com/firebasejs/' + VERSI + '/';
  var cfg = window.TELECARE_FIREBASE || {};

  function gagal(pesan) {
    window.TELECARE_FB_ERROR = pesan;
    window.dispatchEvent(new CustomEvent('telecare:fb-error', { detail: pesan }));
    console.warn('[TeleCare] ' + pesan);
  }

  if (!cfg.apiKey || /GANTI/.test(JSON.stringify(cfg))) {
    gagal('Konfigurasi Firebase belum diisi (app/js/firebase-config.js).');
    return;
  }

  var MODUL = ['firebase-app', 'firebase-auth', 'firebase-firestore', 'firebase-ai'];
  Promise.all(MODUL.map(function (m) { return import(CDN + m + '.js'); }))
    .then(function (m) {
      var appM = m[0], authM = m[1], fsM = m[2], aiM = m[3];
      var app = appM.initializeApp(cfg);
      var auth = authM.getAuth(app);
      // Field bernilai undefined dilewati, bukan ditolak (Firestore menolaknya bawaan).
      var db = fsM.initializeFirestore(app, { ignoreUndefinedProperties: true });
      var ai = aiM.getAI(app, { backend: new aiM.GoogleAIBackend() });

      // Emulator Firebase — HANYA untuk pengujian di komputer pengembang:
      // localhost + localStorage 'tc.emulator' = '1'. Tidak pernah aktif di situs.
      var emulator = false;
      try {
        emulator = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) &&
          localStorage.getItem('tc.emulator') === '1';
      } catch (e) { /* penyimpanan diblokir */ }
      if (emulator) {
        authM.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
        fsM.connectFirestoreEmulator(db, '127.0.0.1', 8080);
        console.info('[TeleCare] memakai Firebase Emulator');
      }

      window.TELECARE_FB = { app: app, auth: auth, db: db, ai: ai, emulator: emulator,
                             authM: authM, fsM: fsM, aiM: aiM };
      window.dispatchEvent(new CustomEvent('telecare:fb-ready'));
    })
    .catch(function (e) { gagal('SDK Firebase gagal dimuat: ' + ((e && e.message) || e)); });
})();
