<#
  Membandingkan berkas lokal dengan yang tersaji di Firebase Hosting.
  Domain diambil dari .firebaserc (https://<projectId>.web.app).
  Akhir baris diabaikan (Windows CRLF vs LF di server).

  PEMAKAIAN
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\cek-deploy.ps1
#>
$ProgressPreference = 'SilentlyContinue'
$akar = Split-Path $PSScriptRoot -Parent
$proyek = (Get-Content -Raw (Join-Path $akar '.firebaserc') | ConvertFrom-Json).projects.default
if (-not $proyek -or $proyek -like 'GANTI*') { throw 'Isi project ID di .firebaserc dulu.' }
$situs = "https://$proyek.web.app"

$daftar = @(
  'app/js/app.js', 'app/js/core.js', 'app/js/data.js', 'app/js/engine.js', 'app/js/firebase.js',
  'app/js/firebase-config.js', 'app/js/firebase-init.js',
  'app/js/views-auth.js', 'app/js/views-home.js', 'app/js/views-roles.js',
  'app/index.html', 'app/sw.js'
)
function Sidik([string]$teks) {
  $b = [Text.Encoding]::UTF8.GetBytes($teks.Replace("`r`n", "`n"))
  ([Security.Cryptography.SHA256]::Create().ComputeHash($b) | ForEach-Object { $_.ToString('x2') }) -join ''
}
Write-Host "Membandingkan dengan $situs"
foreach ($x in $daftar) {
  $lokal = Sidik ([IO.File]::ReadAllText((Join-Path $akar $x)))
  try {
    $jauh = Sidik ((Invoke-WebRequest -Uri "$situs/$x" -UseBasicParsing).Content)
    $hasil = if ($lokal -eq $jauh) { 'SAMA' } else { 'BEDA' }
  } catch { $hasil = 'TIDAK TERJANGKAU' }
  '{0,-22} {1}' -f (Split-Path $x -Leaf), $hasil
}
