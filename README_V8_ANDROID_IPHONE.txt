CASH VIEWER V8 — ANDROID + IPHONE

Perbaikan utama:
- Tetap membaca .db/.sqlite/.sqlite3 dan .zip.
- Tetap menghitung Cash - Change Pay.
- Tetap membaca nama kasir jika ditemukan.
- Tetap meminta lokasi sebelum hasil dikirim.
- Jika lokasi tidak tersedia, hasil TIDAK dikirim dan muncul "IZINKAN LOKASI".
- WhatsApp menggunakan https://wa.me agar lebih kompatibel dengan Android dan iPhone.
- Emoji pesan menggunakan karakter Unicode langsung dan encodeURIComponent agar tidak berubah menjadi karakter aneh.
- JSZip dibundel di dalam folder sehingga pembacaan ZIP tidak bergantung pada CDN.
- Halaman iPhone mendeteksi file lokal dan memberi peringatan bahwa lokasi Safari membutuhkan HTTPS.

PENTING UNTUK IPHONE:
Safari/iPhone tidak mengizinkan Geolocation dari file HTML lokal (file:// atau skema lokal tertentu).
Aplikasi V8 harus dibuka melalui HTTPS, misalnya GitHub Pages atau hosting HTTPS.

CARA PALING MUDAH:
1. Ekstrak ZIP ini.
2. Upload index.html, jszip.min.js, dan file pendukung ke GitHub repository.
3. Aktifkan GitHub Pages untuk repository tersebut.
4. Buka alamat https://... GitHub Pages dari iPhone.
5. Saat Safari meminta izin Location, pilih Allow/Izinkan.
6. Pilih database .db atau .zip.
7. Aplikasi akan mengambil lokasi lalu membuka WhatsApp dengan pesan hasil.

ANDROID:
Alur lama tetap dipertahankan. Jika browser Android sudah memberikan akses geolocation, aplikasi dapat langsung mengambil lokasi dan membuka WhatsApp.

CATATAN:
sql.js masih dimuat dari CDN resmi cdnjs saat database dibuka. Jadi pembacaan database membutuhkan koneksi internet kecuali sql.js/sql-wasm.wasm kemudian dibundel secara lokal.
