/* ============================================================
   TeleCare App — push-config.js
   Konfigurasi notifikasi LOKAL — dihitung di perangkat, tidak perlu
   server. (Push dari server tidak dipakai: butuh Cloud Functions,
   yang tidak tersedia di paket gratis Firebase.)
   ============================================================ */
window.TELECARE_PUSH = {
  urlBuka: '/app/',   // dibuka saat notifikasi diketuk
  jedaMenit: 10       // satu ukuran tidak diberitahukan ulang sebelum jeda ini
};
