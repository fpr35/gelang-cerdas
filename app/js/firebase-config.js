/* ============================================================
   TeleCare App — firebase-config.js
   Konfigurasi project Firebase. Isi bagian bertanda GANTI dengan
   nilai dari Firebase Console → Project settings → Your apps → Web app
   → "SDK setup and configuration" → Config. Langkahnya ada di
   PANDUAN-FIREBASE.md (akar repo).

   Nilai-nilai ini MEMANG publik (ikut terkirim ke peramban siapa pun).
   Keamanan data bertumpu pada aturan Firestore (firestore.rules),
   bukan pada kerahasiaan apiKey.
   ============================================================ */
window.TELECARE_FIREBASE = {
  apiKey: 'AIzaSyCd1Evu4fEd8SZoiEdwxzCJ_FXyQVAfjcQ',
  authDomain: 'app-telecare.firebaseapp.com',
  projectId: 'app-telecare',
  storageBucket: 'app-telecare.firebasestorage.app',
  messagingSenderId: '239030031105',
  appId: '1:239030031105:web:edd79244ba66276ebf4100'
};

/* Model Gemini untuk deteksi makanan & Wawasan TeleCare AI (Firebase AI
   Logic, Gemini Developer API — paket gratis). Dicoba berurutan: bila satu
   model tidak tersedia (Google berkala mempensiunkan model) atau sedang
   sibuk, model berikutnya dipakai. "*-latest" adalah alias Google yang
   selalu menunjuk ke versi flash terbaru. */
window.TELECARE_AI = {
  models: ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.5-flash']
};
