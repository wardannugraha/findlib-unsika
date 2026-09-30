# ☁️ RENCANA & SPESIFIKASI INTEGRASI CLOUDINARY
> **FindLib UNSIKA - Sistem Manajemen Cover Buku Cloudinary**  
> *Panduan Arsitektur Upload, Auto-Rename, dan Penghapusan File Sampah Otomatis (Zero-Orphan Policy)*

---

## 📌 1. Ringkasan & Tujuan
Dokumen ini mencatat rancangan integrasi penyimpanan cover buku ke **Cloudinary** untuk FindLib UNSIKA agar:
1. **Penyimpanan Terstruktur & Rapi:** Setiap file cover buku diberi nama unik dan folder khusus di Cloudinary.
2. **Bebas File Sampah (Zero Orphaned Files):** Ketika buku diedit (cover diganti) atau dihapus dari sistem, file lama di Cloudinary **otomatis dihapus secara permanen via API**.
3. **Aman & Cepat:** Kredensial Cloudinary tersimpan aman di `.env` (backend) dan gambar dilayani melalui CDN Cloudinary berkecepatan tinggi dengan auto-format (WebP/AVIF).

---

## 🗄️ 2. Penyesuaian Struktur Database

Untuk melacak dan menghapus file di Cloudinary, database memerlukan 2 kolom:
1. `cover_url` (TEXT): URL publik gambar Cloudinary untuk ditampilkan di frontend.
2. `cover_public_id` (TEXT): ID unik file di Cloudinary yang digunakan sebagai referensi saat menghapus file (`cloudinary.uploader.destroy`).

### Modifikasi Skema SQL:
```sql
ALTER TABLE books ADD COLUMN IF NOT EXISTS cover_public_id TEXT;
```

---

## 📁 3. Aturan Struktur Folder & Penamaan (Naming Convention)

### A. Struktur Folder Cloudinary
* Folder Root Proyek: `findlib-unsika/`
* Subfolder Cover: `findlib-unsika/covers/`

### B. Format Penamaan File (`public_id`)
File tidak menggunakan nama acak atau nama file asli bawaan perangkat pengguna, melainkan distandarisasi:
* **Format:** `cover_[book_id_or_isbn]_[timestamp]`
* **Contoh:** `findlib-unsika/covers/cover_9786020301234_1711593840`

**Keuntungan:**
* Sangat rapi saat dilihat langsung di Media Library dashboard Cloudinary.
* Menghindari tabrakan nama file (*name collision*) dan masalah caching gambar di browser.

---

## 🔄 4. Siklus Hidup File (Lifecycle Management)

```mermaid
graph TD
    subgraph 1. Tambah Buku / Upload Baru
        A1[Admin Upload File Cover] --> B1[Upload ke Cloudinary: folder & public_id rapi]
        B1 --> C1[Dapatkan cover_url & cover_public_id]
        C1 --> D1[Simpan ke Database]
    end

    subgraph 2. Edit / Ganti Cover
        A2[Admin Upload Cover Baru] --> B2[Upload File Baru ke Cloudinary]
        B2 --> C2{Ada cover_public_id Lama?}
        C2 -- Ya --> D2[Panggil cloudinary.uploader.destroy(old_public_id)]
        C2 -- Tidak / URL Luar --> E2[Lewati Hapus Cloudinary]
        D2 --> F2[Update Database dengan cover_url & cover_public_id Baru]
        E2 --> F2
    end

    subgraph 3. Hapus Buku
        A3[Admin Hapus Buku] --> B3{Buku Punya cover_public_id?}
        B3 -- Ya --> C3[Hapus File di Cloudinary via destroy API]
        B3 -- Tidak --> D3[Hapus Data Buku di Database]
        C3 --> D3
    end
```

---

## ⚙️ 5. Kebutuhan Library & Variabel Lingkungan (`.env`)

### Library Backend (Node.js):
```bash
npm install cloudinary multer
```

### Konfigurasi `.env`:
```env
# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloud_name_here
CLOUDINARY_API_KEY=your_api_key_here
CLOUDINARY_API_SECRET=your_api_secret_here
```

---

## 🛡️ 6. Keamanan & Pencegahan Error

1. **Validasi Tipe & Ukuran File:**
   * Format diizinkan: `image/jpeg`, `image/png`, `image/webp`.
   * Maksimal ukuran: 2 MB per gambar (cukup dan hemat kuota).
2. **Fallback / Toleransi Gambar Eksternal:**
   * Jika user memasukkan link URL manual (Unsplash / Google Images), `cover_public_id` bernilai `null` sehingga sistem tidak akan mencoba menghapus link eksternal.
3. **Non-Blocking Cleanup:**
   * Jika penghapusan gambar di Cloudinary gagal (misal file sudah tidak ada), proses delete/update di database tetap berjalan lancar tanpa membuat sistem crash.

---

## 🚀 7. Rencana Langkah Implementasi (Saat Siap Diterapkan)
1. Pasang package `cloudinary` dan `multer`.
2. Tambahkan variabel `CLOUDINARY_*` di `.env` dan `.env.example`.
3. Buat helper utility `cloudinary-helper.js` untuk upload dan destroy file.
4. Tambahkan endpoint upload cover di `server.js` (`POST /api/upload/cover`).
5. Perbarui endpoint update & delete buku di `server.js` untuk memicu pembersihan file lama.
6. Perbarui modal Form Buku di [admin.html](file:///d:/Coding/findlib-unsika/public/admin.html) dan [admin-app.js](file:///d:/Coding/findlib-unsika/public/js/admin-app.js) dengan input file picker + drag & drop preview.
