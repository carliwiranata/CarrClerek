CASH VIEWER V8 - FIX LOGIN / ADMIN

Perubahan:
1. Fitur Cash Viewer/Cek Clerek lama dipertahankan.
2. 9 menu Ayam Panggang Lava tetap diacak sekali saat halaman dibuka/refresh.
3. Kunci verifikasi tetap Pedas + Madu + Keju.
4. Jika verifikasi salah: "Terima kasih - Pesanan sedang dibuat. Terimakasih."
5. Jika benar: lanjut ke Login.
6. User masuk ke Cek Clerek. Admin masuk ke Dashboard Admin.
7. Tambah User tidak lagi memakai auth.signUp() dari browser, sehingga tidak terkena rate limit 43 detik.
8. Tambah User memakai Supabase Edge Function admin-create-user.

PENTING:
Edge Function harus di-deploy ke project Supabase sebelum tombol Tambah User dapat digunakan.
JANGAN memasukkan SUPABASE_SERVICE_ROLE_KEY ke index.html.

File Edge Function:
supabase/functions/admin-create-user/index.ts

Deploy melalui Supabase Dashboard:
1. Buka project Supabase.
2. Pilih Edge Functions.
3. Create a new function dengan nama: admin-create-user
4. Isi kodenya dari index.ts pada folder ini.
5. Deploy.

Setelah deploy, buka ulang aplikasi dan login sebagai admin. Tambah User akan membuat akun Auth + profiles sekaligus.


PERBAIKAN V2:
- Memperbaiki JSZip yang sebelumnya dirujuk sebagai file lokal tetapi tidak ikut dalam ZIP.
- JSZip sekarang dimuat dari CDN sehingga fitur baca database/ZIP kembali bekerja.
- Fitur login role, admin CRUD user, dan masa aktif tetap dipertahankan.


PERBAIKAN V3 - PENGELOLAAN USER:
- Tombol +7 hari dan +30 hari dihapus dari Daftar User.
- Edit user sekarang dapat mengubah email, username, nama lengkap, password (opsional), dan tanggal masa aktif.
- Nonaktifkan/Aktifkan tetap tersedia.
- Hapus user sekarang menghapus akun dari Supabase Auth dan membersihkan profiles.
- Operasi edit/hapus memakai Edge Function admin-manage-user agar service role key tidak pernah masuk ke index.html.
- Cash Viewer, pembacaan database/ZIP, login role, dan admin-create-user tidak diubah.

Edge Function tambahan yang WAJIB di-deploy:
supabase/functions/admin-manage-user/index.ts

Deploy:
1. Buka Supabase > Edge Functions.
2. Buat function bernama: admin-manage-user
3. Masukkan kode dari file index.ts pada folder tersebut.
4. Deploy.
5. Pastikan admin sudah login ulang bila sesi lama sudah kedaluwarsa.

Catatan Edit V4:
- Edit sekarang menggunakan modal/form di dalam halaman, bukan prompt browser.
- Data user langsung terisi ke form saat tombol Edit ditekan.
- Field: Email, Username, Nama lengkap, Password baru (opsional), Masa aktif sampai, dan Status.
- Password boleh dikosongkan jika tidak ingin menggantinya.
- Masa aktif boleh dikosongkan untuk tanpa batas.

Catatan Hapus:
Hapus bersifat permanen dan tidak dapat dibatalkan.


PERBAIKAN V5 - PESAN ERROR EDGE FUNCTION:
- Frontend sekarang membaca response JSON asli dari Edge Function saat status HTTP non-2xx.
- Error validasi seperti "Password minimal 6 karakter." akan ditampilkan langsung kepada admin.
- Error email sudah terdaftar, sesi admin tidak valid, dan error database juga ditampilkan jika dikirim oleh Edge Function.
- Tidak mengubah validasi atau keamanan di admin-create-user.
- Penanganan error admin-manage-user juga dibuat lebih informatif.

[UPDATE] Login menggunakan logo Ayam Panggang Lava (logo saja), bukan poster/full login image. Logo di-embed sebagai WebP base64 di index.html agar tetap berjalan tanpa asset eksternal.


PERBAIKAN V6 - PERATURAN SETELAH LOGIN:
- Setelah login user berhasil dan akun dinyatakan aktif, modal "Peraturan Aplikasi" otomatis muncul.
- Admin tetap langsung masuk ke Dashboard Admin tanpa modal peraturan.
- Peraturan yang sama tetap dapat dibuka manual dari tombol "Peraturan Aplikasi" di halaman Cash Viewer.
