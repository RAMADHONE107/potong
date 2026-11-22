# Potong

Web app untuk mengubah video panjang menjadi beberapa klip vertikal dengan subtitle karaoke per kata. Gratis, tanpa kredit, tanpa watermark, dan login tanpa formulir pendaftaran.

Ini bukan salinan kode atau aset klipaja.id. Yang ditiru adalah **resep produknya**: satu input → beberapa klip siap unggah, teks yang mengikuti kata, dan friksi masuk serendah mungkin.

## Resep yang dipakai

| Yang ditiru | Yang sengaja tidak dibuat |
| --- | --- |
| Satu link/file → banyak kandidat klip vertikal | Sistem kredit dan top up |
| Subtitle karaoke per kata dengan beberapa gaya | Watermark dan tier berbayar |
| Momen dipilih pakai skor hook/kepadatan | BFF, backend privat, dan Cloudflare yang tidak perlu |
| Brief campaign + beberapa varian caption | Halaman harga dan paywall |

## Cara kerja

```text
link/file + brief campaign
  → FFmpeg/yt-dlp
  → whisper.cpp (kata + waktu)
  → heuristik pemilih momen (3–8 kandidat, skor hook/kepadatan)
  → ASS subtitle (karaoke/bold/minimal/neon)
  → 4 varian caption (viral/story/edukasi/jualan)
  → FFmpeg 1080×1920 → unduhan
```

Route hanya menaruh pekerjaan ke tabel `jobs`. Worker yang mulai otomatis saat server hidup mengambil satu job pada satu waktu; job yang nyangkut karena server mati dikembalikan ke antrean saat restart.

Semua transkripsi berjalan lokal. Tidak ada API berbayar, tidak ada kunci API, tidak ada data yang dikirim ke layanan pihak ketiga untuk diproses.

## Prasyarat

- Node.js 20+ dan npm
- FFmpeg + ffprobe (dengan filter `subtitles`/libass dan encoder `libx264`)
- `yt-dlp`
- `git`, `cmake`, `make`, dan compiler C/C++ (hanya untuk membangun whisper.cpp sekali)

Di Termux: `pkg install nodejs ffmpeg yt-dlp git cmake clang make`

## Pasang dan jalankan

```bash
cd potong
npm install
cp .env.example .env.local
# isi AUTH_SECRET dengan: openssl rand -base64 32
bash scripts/setup.sh     # build whisper.cpp + unduh model ggml-base
npm run dev
```

Buka `http://localhost:3000`.

Model default adalah `ggml-base.bin` (cepat di CPU). Untuk akurasi lebih baik, unduh model `small` lalu aktifkan lewat env:

```bash
curl -fL -o models/ggml-small.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
# lalu isi .env.local: POTONG_WHISPER_MODEL=ggml-small.bin
```

Script npm sengaja memanggil `node ./node_modules/next/dist/bin/next` dan memakai `--webpack`, karena di Termux shebang `/usr/bin/env` tidak ada dan Turbopack tidak punya binding native untuk Android/arm64.

## Login

Secara default aplikasi memakai **akun lokal demo** supaya bisa langsung dicoba.

Untuk mengaktifkan GitHub (tetap tanpa formulir signup):

1. Buat OAuth App di <https://github.com/settings/developers>.
2. Homepage URL: `http://localhost:3000`
3. Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
4. Isi `AUTH_GITHUB_ID` dan `AUTH_GITHUB_SECRET` di `.env.local`.
5. Restart server.

Akun dibuat otomatis saat pertama kali masuk. Untuk mengganti provider, ubah array `providers` di `auth.ts`.

## Pakai

1. Masuk, lalu buka workspace.
2. Tempel alamat video publik atau unggah file (maksimal 200 MB).
3. Isi brief campaign: nama, audiens, platform, tone, goal, CTA.
4. Tunggu status selesai; setiap job menghasilkan beberapa kandidat klip.
5. Pilih gaya subtitle/varian caption, lalu unduh klip atau salin caption.

Gunakan hanya video yang boleh kamu olah. Potong tidak melewati pembatasan akses, paywall, atau DRM.

## Verifikasi yang sudah dijalankan

- `npm run build` — lolos (webpack, Next.js 16.4.6).
- Alur HTTP: landing 200, login 200, dashboard 307 tanpa sesi, `/api/jobs` 401 tanpa sesi, login demo → sesi terbentuk → upload → pekerjaan selesai.
- Pipeline dengan video uji 30 detik: menghasilkan klip H.264 1080×1920 + AAC.
- Pipeline dengan audio bicara sungguhan: 17 kata terbaca dengan timestamp, ASS karaoke terisi (`{\k…}` per kata).
- Endpoint klip: poster `image/jpeg` 200, video `video/mp4` 200.
- Antrean: job baru diambil worker otomatis tanpa diproses di route handler. Job yang statusnya sengaja diubah menjadi `cutting` lalu server di-restart otomatis diproses ulang sampai `done`.
- Dua model diuji pada sampel audio 9,7 detik: `ggml-base` selesai ~24 detik, `ggml-small` ~37 detik di mesin ini. Utilitas CPU juga bisa diatur lewat `POTONG_WHISPER_THREADS`.

Playwright tidak dapat dijalankan di environment Termux/Android (`chromium is not supported`), jadi `tests/ui_smoke.py` ditujukan untuk mesin Linux/macOS normal. Pemeriksaan UI di sini dilakukan lewat HTML yang dirender server dan pengecekan respons.

## Batasan

- Kualitas transkrip mengikuti model `ggml-base`; untuk hasil lebih akurat, ganti ke `ggml-small.bin`/`ggml-base-q5_1.bin` lewat env `POTONG_WHISPER_MODEL`.
- Pemilih momen dan generator caption masih heuristik (kata kunci/kepadatan/hook + template campaign), bukan LLM lokal. Ini disengaja supaya ringan dan gratis.
- Gaya subtitle dirender lewat ASS/libass; di Termux font yang pasti ada adalah DejaVu Sans, jadi perbedaan gaya saat ini fokus pada ukuran/warna/stroke/karaoke timing.
- Worker berjalan di proses Next.js yang sama dan memproses satu job per waktu. Untuk paralelisme tinggi, perlu proses worker terpisah.
- File dan database tersimpan di `data/` (diabaikan git). Tidak ada backup otomatis/penghapusan otomatis file lama.

## Lisensi dan aset

Kode aplikasi ini dibuat untuk dipakai bebas. Dependensi yang dipakai: Next.js (MIT), Auth.js (MIT), whisper.cpp (MIT), yt-dlp (Unlicense), FFmpeg (LGPL 2.1+, atau GPL bila build memakai komponen GPL). Model Whisper mengikuti lisensi weight OpenAI. Remotion sengaja tidak dipakai karena lisensinya membatasi organisasi di atas tiga orang dan melarang penjualan derivat.

Tidak ada logo, teks, atau aset visual dari klipaja.id yang disalin.
