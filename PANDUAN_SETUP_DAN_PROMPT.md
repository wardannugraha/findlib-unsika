# 📘 PANDUAN LENGKAP & KEAMANAN SISTEM: FINDLIB UNSIKA
> **FindLib UNSIKA (Find your Library) - Universitas Singaperbangsa Karawang**  
> *Panduan Pengoperasian, Pemisahan Akses Kiosk & Admin, Database Neon, dan MQTT*

---

## 🔐 1. Arsitektur Pemisahan Akses & Keamanan Sistem

Sistem FindLib UNSIKA dirancang dengan **3 Lingkungan Terisolasi** agar aman dari otak-atik pengunjung:

| Layar / Perangkat | URL | Karakteristik & Proteksi |
| :--- | :--- | :--- |
| **🌐 1. Portal Publik (Katalog Mahasiswa)** | `http://localhost:3000/` | **Bebas diakses dari HP/Laptop di rumah.** Hanya memuat info judul, penulis, sinopsis, dan ketersediaan stok. Tidak ada menu Admin atau tombol lampu rak. |
| **📍 2. Kiosk On-Site (Komputer Perpustakaan)** | `http://localhost:3000/kiosk` | **Khusus layar sentuh/PC pengunjung di lantai perpustakaan.** Menampilkan pencarian rak + tombol "Cari & Nyalakan Rak" + visualisator rak LED. **Semua menu admin, tombol edit/hapus, dan link navigasi telah dihilangkan total** sehingga pengunjung tidak bisa membuka dashboard admin. |
| **⚙️ 3. Dashboard Admin (Meja Petugas/Pustakawan)** | `http://localhost:3000/admin` | **Wajib Login di `/login`.** Khusus PC petugas perpustakaan di meja sirkulasi untuk menambah/edit/hapus buku, kelola stok, dan mapping kategori. |

---

## 🔑 2. Keamanan & Akun Login Petugas / Admin

Untuk mencegah percobaan *brute force* atau keisengan dari publik, **menu Admin dan menu Kiosk tidak dimunculkan di navbar halaman publik**.

Petugas perpustakaan dapat masuk secara langsung melalui URL login khusus:
* **URL Login:** [http://localhost:3000/login](http://localhost:3000/login)
* **Username Default:** `admin`
* **Password Default:** `adminunsika` *(Dapat diubah di file [`.env`](file:///d:/Coding/libnav-unsika/.env))*

### ⏱️ Pengaturan Masa Aktif Sesi (Nyaman & Aman):
* 🔲 **Login Biasa:** Sesi aktif selama **24 Jam** (setelah 1 hari otomatis meminta login ulang).
* ☑️ **Centang "Ingat Saya (7 Hari)":** Sesi diperpanjang hingga **7 Hari** (selama 1 minggu tidak perlu login ulang).
* 🔴 **Logout Seketika:** Tombol **"Keluar"** di pojok kanan atas untuk mengakhiri sesi seketika.

---

## 🚀 3. Cara Menjalankan Aplikasi

Pastikan laptop terinstall **Node.js**. Buka terminal di folder `libnav-unsika`:

```bash
# Langkah 1: Install semua dependensi (hanya 1x di awal)
npm install

# Langkah 2: Jalankan server
npm start
```

### Skenario Operasional di Perpustakaan UNSIKA:
1. **Di PC/Tablet Stand Kiosk Perpustakaan:** Buka browser dan arahkan ke `http://localhost:3000/kiosk` (Lalu tekan tombol `F11` untuk mode *Fullscreen*). Pengunjung hanya bisa mencari buku dan menyalakan lampu rak tanpa bisa mengotak-atik data.
2. **Di PC Meja Petugas:** Buka `http://localhost:3000/login` untuk mengelola data buku.

---

## 🗄️ 4. Konfigurasi Database Neon PostgreSQL

Tautan database Neon Anda telah aktif di file [`.env`](file:///d:/Coding/libnav-unsika/.env):
```env
DATABASE_URL=postgresql://neondb_owner:npg_wI59MhQuciCA@ep-proud-meadow-aywkm03f-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```
* **Auto-Setup:** Saat `npm start`, tabel `categories`, `racks`, dan `books` dibuat otomatis di database Neon.

---

## 🔄 5. Modul Peminjaman Buku & Data Mahasiswa (Sidebar Terpusat di Admin)

Sistem peminjaman dikelola terpusat di Dashboard Admin melalui **Sidebar Samping Buka-Tutup (*Collapsible Sidebar*)**:
1. **Navigasi Sidebar:**
   * 📚 **Koleksi Buku:** CRUD buku, stok fisik, rak, kategori, dan tes lampu LED.
   * 🔄 **Peminjaman Buku:** Transaksi pinjam kilat, daftar buku yang sedang dipinjam, perpanjang 7 hari, dan pengembalian.
   * 🔴 **Buku Terlambat:** Notifikasi angka merah di sidebar, tabel disorot merah pekat, hitungan hari terlambat, dan tombol chat WhatsApp.
   * 👥 **Data Mahasiswa:** CRUD data master mahasiswa (NIM, Nama, Prodi, No. WhatsApp).
2. **Pencarian Cepat NIM (*Smart Auto-Fill*):** Admin cukup ketik NIM mahasiswa. Jika sudah pernah meminjam, nama, prodi, dan nomor WhatsApp otomatis terisi.
3. **Batas Waktu Otomatis 7 Hari & Perpanjangan 1x:** Batas pengembalian buku diatur otomatis 7 hari dari tanggal pinjam dan dapat diperpanjang maksimal 1 kali.
4. **Otomasi Stok:** Meminjam buku otomatis mengurangi stok tersedia, dan mengembalikan buku otomatis mengembalikan stok di rak.

---

## 🤖 6. Template Prompt AI untuk Teman Anda (Siap Copas ke ChatGPT)

### 📌 Template 1: Ubah Username / Password Admin
> *"Halo AI, di project FindLib UNSIKA saya ingin mengganti password login admin. Bagaimana caranya?"*  
> *(Jawaban: Cukup ubah `ADMIN_USERNAME` dan `ADMIN_PASSWORD` di file `.env`, lalu restart server).*

### 📌 Template 2: Tambah Kolom Baru di Tabel Buku
> *"Halo AI, saya memiliki project sistem perpustakaan FindLib UNSIKA berbasis Express dan PostgreSQL Neon. Saya ingin menambahkan kolom baru [sebutkan nama kolom]. Tolong berikan kode query SQL dan penyesuaian di server.js dan admin.html."*

### 📌 Template 3: Atasi Pesan Error
> *"Halo AI, saat menjalankan `npm start`, muncul error berikut: [paste error]. File server.js saya terhubung ke Neon PostgreSQL dan HiveMQ. Bagaimana solusinya?"*

---

## 📁 6. Struktur Folder Project
```
libnav-unsika/
├── public/                 # Tampilan Web (Frontend)
│   ├── images/             # Folder Gambar & Aset (unsika.png)
│   │   └── unsika.png
│   ├── index.html          # Portal Katalog Publik (Clean UX)
│   ├── kiosk.html          # Terminal Kiosk On-Site Perpustakaan (Terisolasi dari Admin)
│   ├── admin.html          # Dashboard Admin (CRUD & Stok)
│   ├── login.html          # Halaman Login Petugas/Admin
│   ├── css/style.css       # Desain & Styling UNSIKA
│   └── js/
│       ├── public-app.js   # Logika Katalog Publik
│       ├── kiosk-app.js    # Logika Kiosk & Visualisator Rak (Standalone)
│       └── admin-app.js    # Logika Admin Panel (Auth Guard)
├── database/
│   ├── schema.sql          # Struktur Tabel PostgreSQL
│   ├── seed.sql            # Data Sampel Awal
│   └── local_db.json       # Fallback Database Lokal (Offline)
├── server.js               # Backend API & MQTT Publisher
├── .env                    # Konfigurasi Database & MQTT
├── package.json            # Daftar Library Node.js
├── PROJECT_BLUEPRINT.md    # Master Blueprint Konsep Sistem
└── PANDUAN_SETUP_DAN_PROMPT.md # Panduan Ini
```
