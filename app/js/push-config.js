/* ============================================================
   TeleCare App — push-config.js
   Konfigurasi notifikasi.

   1. NOTIFIKASI LOKAL — dihitung di perangkat, tidak perlu server.
   2. PUSH DARI SERVER (Web Push standar, BUKAN FCM) — untuk pesan
      yang harus sampai walau aplikasi tertutup total (misal dokter
      memanggil pasien). Dikirim lewat Supabase Edge Function
      `send-push`, dipicu otomatis oleh Database Webhook.
   ============================================================ */
window.TELECARE_PUSH = {

  // Kunci PUBLIK VAPID (aman ditaruh di sini, beda dengan kunci privat
  // yang cuma boleh ada di Secret Supabase). Isi dengan PUBLIC KEY yang
  // sudah Anda generate sebelumnya.
  vapidKey: 'BBb2lPSBbek1fMLdOm4pWIceo_M7tvcDzkJAW9fV8AWH2XOt659jfxw5X7t8TRUn1MxRDcAXRXeEiW0SrDdnsQ8',

  urlBuka: '/app/',
  jedaMenit: 10
};