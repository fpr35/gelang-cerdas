<#
  Membuat ulang gambar dan PDF panduan penggunaan TeleCare.

  PEMAKAIAN
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\buat-panduan.ps1            # gambar + PDF
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\buat-panduan.ps1 -HanyaPdf  # PDF saja

  Hasil
    panduan/img/*.jpg              tangkapan layar pasien (publik)
    panduan/panduan-telecare.pdf   PDF panduan pasien (publik, tombol "Unduh PDF")
    docs/img/*.jpg                 tangkapan layar admin (tidak ditayangkan)
    build/Panduan-Admin-TeleCare.pdf  PDF panduan admin — bagikan langsung ke admin

  Aman: memakai Edge dengan profil sementara, Firebase produksi DIBLOKIR
  (tidak ada data yang terkirim), data contoh bernama fiktif, dan hanya
  menghentikan proses yang dijalankannya sendiri (lewat PID / profil).
#>
param([switch]$HanyaPdf)
$ErrorActionPreference = 'Continue'
$repo = Split-Path $PSScriptRoot -Parent
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw 'Edge tidak ditemukan.' }

$profil = Join-Path $env:TEMP ("tc-panduan-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$srv = Start-Process -FilePath python -ArgumentList 'tools/serve.py', '8951' -WorkingDirectory $repo -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2
$blokir = 'MAP www.gstatic.com ~NOTFOUND, MAP firestore.googleapis.com ~NOTFOUND, MAP identitytoolkit.googleapis.com ~NOTFOUND, ' +
          'MAP securetoken.googleapis.com ~NOTFOUND, MAP firebasevertexai.googleapis.com ~NOTFOUND, MAP *.firebaseapp.com ~NOTFOUND'
$flag = @('--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-sync',
  "--user-data-dir=$profil", '--remote-debugging-port=9333', "`"--host-resolver-rules=$blokir`"", 'about:blank')
$br = Start-Process -FilePath $edge -ArgumentList $flag -PassThru
Start-Sleep -Seconds 3
try {
  Push-Location $repo
  if (-not $HanyaPdf) { node tools/panduan/ambil-gambar.mjs }
  node tools/panduan/buat-pdf.mjs
} finally {
  Pop-Location
  Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*$profil*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
  Remove-Item $profil -Recurse -Force -ErrorAction SilentlyContinue
}
