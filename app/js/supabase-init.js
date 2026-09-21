/* app/js/supabase-init.js */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://txwtsqpeabzvxiecwicg.supabase.co';   // <-- GANTI: Project URL Anda
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4d3RzcXBlYWJ6dnhpZWN3aWNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMjgyMDksImV4cCI6MjEwNDkwNDIwOX0.uAk8n9_Rq3iOfz4jZPq870-fNwVGKQ8cEHQw3S01sKw';  // <-- GANTI: anon public key Anda

  var tag = document.createElement('script');
  tag.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
  tag.onload = function () {
    try {
      window.TELECARE_SB = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
      });
      window.dispatchEvent(new CustomEvent('telecare:sb-ready'));
      console.log('[TeleCare] Supabase siap.');
    } catch (e) {
      window.dispatchEvent(new CustomEvent('telecare:sb-error', { detail: e.message }));
      console.warn('[TeleCare] Gagal membuat Supabase client:', e.message);
    }
  };
  tag.onerror = function () {
    window.dispatchEvent(new CustomEvent('telecare:sb-error', { detail: 'CDN tidak terjangkau' }));
    console.warn('[TeleCare] Gagal memuat SDK Supabase dari CDN.');
  };
  document.head.appendChild(tag);
})();