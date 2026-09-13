# 📐 KONSEP & PANDUAN PEMETAAN RAK, PRESISI LED, DAN PENATAAN BUKU
> **Dokumen Diskusi Teknis: FindLib UNSIKA**  
> *Solusi Penempatan Buku, Ketebalan Buku (Drift Issue), Visual Shelf Picker, dan Kalibrasi LED*

---

## 🔍 1. Latar Belakang Masalah di Lapangan

Dalam implementasi Smart Library IoT dengan lampu addressable LED (WS2812B):
1. **Ketebalan Buku Bervariasi:**
   * Buku novel tipis (~1 - 1.5 cm)
   * Skripsi / Tugas Akhir (~2 - 2.5 cm)
   * Buku teks tebal / Kamus (~3.5 - 5 cm)
2. **Masalah *Drift Error* (Pergeseran Posisi):**
   * Jika sistem memetakan "1 LED = 1 Buku" secara kaku, maka buku ke-5 dan seterusnya akan bergeser menjauhi posisi lampu LED-nya karena perbedaan ketebalan buku sebelumnya.
3. **Kebutuhan Panduan Admin (Pustakawan):**
   * Pustakawan yang menata buku fisik di rak membutuhkan panduan posisi yang jelas (misal: *"Sebelah mana saya harus meletakkan buku ini?"*).
   * Saat input di web, admin harus tahu slot mana yang masih kosong tanpa harus mengecek fisik ke rak secara manual.

---

## 💡 2. Tiga Pilar Solusi Presisi FindLib UNSIKA

### A. Kalibrasi Fisik: Stiker Penggaris Slot di Rak (*Physical Slot Ruler*)
* Sepanjang jalur LED strip WS2812B di rak fisik (atau miniatur 3 tingkat) ditempeli **stiker nomor slot teratur**:
  ```
  [ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ] [ 6 ] [ 7 ] [ 8 ] [ 9 ] [ 10 ] [ 11 ] [ 12 ]
  ```
* **Kelebihan:**
  * Pengunjung atau pustakawan yang berdiri di depan rak langsung mencocokkan nomor LED yang menyala dengan stiker nomor di rak.
  * Menghilangkan keraguan letak buku di antara deretan buku lainnya.

---

### B. Fitur Web: *Visual Shelf Picker* (Peta Interaktif Slot Rak di Form Admin)
Saat admin menambah atau mengedit buku di Dashboard Admin, web menampilkan **Peta Visual Slot Rak**:

```
+---------------------------------------------------------------------------------------------------+
| TINGKAT 2 (RAK A - TENGAH):                                                                       |
| [Slot 1: BK-003]  [Slot 2: BK-004]  [Slot 3: KOSONG]  [Slot 4: KOSONG]  [Slot 5: BK-007] ...      |
+---------------------------------------------------------------------------------------------------+
  * Kotak Abu-Abu  = Sudah terisi buku (Menampilkan judul saat di-hover).
  * Kotak Hijau    = KOSONG / Tersedia. Cukup KLIK kotak hijau untuk memilih slot secara otomatis.
```

* **Manfaat untuk Admin:**
  * Admin tidak perlu mengingat nomor LED yang masih kosong.
  * Mencegah tumpang tindih (*slot collision*) antara dua buku yang berbeda di titik lampu yang sama.

---

### C. Fitur IoT: *Multi-LED Glow (Span Sorotan Mengikuti Tebal Buku)*
* Lampu LED WS2812B dapat diprogram menyala **1 titik (untuk buku tipis/standar)** atau **2–3 titik berdampingan (untuk buku tebal)**.
* **Format Payload MQTT Tambahan:**
  ```json
  {
    "event": "LOCATE_BOOK",
    "book_id": "BK-004",
    "rack_level": 2,
    "led_target": 6,
    "led_span": 2,
    "led_range_highlight": [6, 7],
    "color_hex": "#EAB308"
  }
  ```
* Saat buku tebal dicari, LED #6 dan #7 menyala bersamaan membentuk sorotan cahaya selebar buku tersebut.

---

## 🗄️ 3. Skema Kolom Database yang Disiapkan

Untuk mendukung pemetaan presisi ini di masa mendatang:

| Kolom Database | Tipe Data | Contoh | Keterangan |
| :--- | :--- | :--- | :--- |
| `rack_id` | `VARCHAR` | `RAK-01-T2` | ID Tingkat Rak |
| `led_slot` | `INT` | `6` | Nomor LED Awal / Utama |
| `led_span` | `INT` | `1` / `2` | Lebar titik lampu (1 titik atau 2 titik untuk buku tebal) |
| `shelf_position_note` | `VARCHAR` | `Sisi Kiri (Slot 6)` | Panduan teks ramah untuk pustakawan |

---

## 📌 Status Dokumen
* **Status:** Disimpan sebagai referensi konsep teknis.
* **Akan dibahas dan dieksekusi:** Pada sesi pembahasan hardware / visual mapper rak berikutnya.
