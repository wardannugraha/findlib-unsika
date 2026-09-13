# 📚 FindLib UNSIKA
**Find your Library - Universitas Singaperbangsa Karawang**  
*Sistem Informasi & Navigasi Rak Buku Pintar Berbasis Web, IoT, dan Addressable LED WS2812B*

---

## 🏛️ Fitur Utama
1. **🌐 Portal Publik (`/`):** Katalog online untuk mahasiswa mencari buku, membaca sinopsis, dan memeriksa sisa stok (tanpa akses pemicu lampu).
2. **📍 Kiosk Perpustakaan (`/kiosk`):** Terminal on-site di gedung perpustakaan untuk pencarian buku fisik dengan tombol **"Cari & Nyalakan Rak"** serta visualisator rak interaktif.
3. **⚙️ Dashboard Admin (`/admin`):** Panel pustakawan untuk mengelola data buku (CRUD lengkap), live preview cover URL, manajemen stok buku, dan kategori dinamis.
4. **📡 Integrasi IoT (MQTT HiveMQ):** Mengirim payload sinyal penunjuk lokasi rak dan titik slot LED ke mikrokontroler ESP32 secara real-time.
5. **🗄️ Database Cloud (Neon PostgreSQL):** Terhubung langsung ke cloud PostgreSQL dengan skema tabel yang fleksibel.

---

## 🚀 Cara Clone & Menjalankan

```bash
# 1. Clone repository
git clone https://github.com/wardannugraha/findlib-unsika.git
cd findlib-unsika

# 2. Salin template konfigurasi environment
copy .env.example .env     # di Windows
# cp .env.example .env     # di Linux / Mac

# 3. Install dependensi
npm install

# 4. Jalankan server
npm start
```
Buka browser di `http://localhost:3000`.

---

## 📖 Dokumentasi Lengkap
* Blueprint Konsep & Arsitektur: [`PROJECT_BLUEPRINT.md`](./PROJECT_BLUEPRINT.md)
* Panduan Setup & Template Prompt AI: [`PANDUAN_SETUP_DAN_PROMPT.md`](./PANDUAN_SETUP_DAN_PROMPT.md)
