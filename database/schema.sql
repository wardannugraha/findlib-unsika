-- ==============================================================================
-- SCHEMA DATABASE: FINDLIB UNSIKA (Neon PostgreSQL Cloud)
-- ==============================================================================
-- Skema lengkap untuk sistem perpustakaan pintar UNSIKA:
-- Kategori, Rak & LED, serta Koleksi Buku dengan metadata lengkap & stok.
-- ==============================================================================

-- 1. TABEL KATEGORI BUKU
CREATE TABLE IF NOT EXISTS categories (
    id VARCHAR(50) PRIMARY KEY,           -- ID unik (contoh: 'CAT-FIKSI', 'CAT-SKRIPSI')
    name VARCHAR(100) NOT NULL,           -- Nama Kategori (contoh: 'Fiksi & Sastra')
    color_hex VARCHAR(10) NOT NULL,       -- Kode Warna Lampu LED (contoh: '#22C55E')
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABEL RAK & ZONING LED
CREATE TABLE IF NOT EXISTS racks (
    id VARCHAR(50) PRIMARY KEY,           -- ID Rak (contoh: 'RAK-01-T1')
    rack_name VARCHAR(100) NOT NULL,      -- Nama Rak (contoh: 'Rak A - Tingkat 1 (Bawah)')
    level_number INT NOT NULL,            -- Tingkat Rak (1, 2, 3, dst.)
    led_start_index INT NOT NULL,         -- Titik awal LED di tingkat ini
    led_end_index INT NOT NULL,           -- Titik akhir LED di tingkat ini
    category_id VARCHAR(50) REFERENCES categories(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABEL KOLEKSI BUKU (METADATA LENGKAP & STOK)
CREATE TABLE IF NOT EXISTS books (
    id VARCHAR(50) PRIMARY KEY,           -- Kode Buku / Barcode (contoh: 'BK-001')
    isbn VARCHAR(50),                     -- Nomor ISBN (contoh: '978-602-03-6651-7')
    title VARCHAR(255) NOT NULL,          -- Judul Buku
    author VARCHAR(255) NOT NULL,         -- Penulis / Pengarang
    publisher VARCHAR(255),               -- Penerbit
    publish_year INT,                     -- Tahun Terbit (contoh: 2023)
    page_count INT,                       -- Jumlah Halaman (contoh: 376)
    synopsis TEXT,                        -- Sinopsis / Ringkasan Buku
    category_id VARCHAR(50) REFERENCES categories(id) ON DELETE RESTRICT,
    rack_id VARCHAR(50) REFERENCES racks(id) ON DELETE CASCADE,
    led_slot INT NOT NULL,                -- Titik spesifik lampu LED WS2812B
    cover_url TEXT,                       -- Link URL Gambar Sampul
    total_stock INT DEFAULT 1,            -- Total Buku Fisik
    available_stock INT DEFAULT 1,        -- Jumlah Buku yang Tersedia
    borrowed_count INT DEFAULT 0,         -- Jumlah Buku yang Sedang Dipinjam
    is_demo BOOLEAN DEFAULT FALSE,        -- Penanda buku khusus peraga demonstrasi rak miniatur IoT
    status VARCHAR(20) DEFAULT 'AVAILABLE', -- 'AVAILABLE' / 'OUT_OF_STOCK'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index untuk mempercepat query pencarian buku
CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
CREATE INDEX IF NOT EXISTS idx_books_author ON books(author);
CREATE INDEX IF NOT EXISTS idx_books_category ON books(category_id);
CREATE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn);
CREATE INDEX IF NOT EXISTS idx_books_is_demo ON books(is_demo);

-- 4. TABEL DATA MAHASISWA / ANGGOTA PERPUSTAKAAN
CREATE TABLE IF NOT EXISTS members (
    nim VARCHAR(50) PRIMARY KEY,           -- Nomor Induk Mahasiswa (contoh: '22416255201101')
    name VARCHAR(150) NOT NULL,          -- Nama Lengkap Mahasiswa
    prodi VARCHAR(100) NOT NULL,         -- Program Studi / Jurusan
    phone VARCHAR(30) NOT NULL,          -- Nomor WhatsApp / HP
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. TABEL TRANSAKSI PEMINJAMAN BUKU (LOANS)
CREATE TABLE IF NOT EXISTS loans (
    id VARCHAR(50) PRIMARY KEY,           -- Kode Transaksi (contoh: 'PJ-001')
    member_nim VARCHAR(50) REFERENCES members(nim) ON DELETE CASCADE,
    book_id VARCHAR(50) REFERENCES books(id) ON DELETE CASCADE,
    borrow_date DATE DEFAULT CURRENT_DATE,
    due_date DATE DEFAULT (CURRENT_DATE + INTERVAL '7 days'),
    return_date DATE,
    extension_count INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'BORROWED', -- 'BORROWED', 'EXTENDED', 'RETURNED', 'OVERDUE'
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_loans_member ON loans(member_nim);
CREATE INDEX IF NOT EXISTS idx_loans_book ON loans(book_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);

-- 6. TABEL PENGATURAN SISTEM PERPUSTAKAAN (APP SETTINGS)
CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed Data Pengaturan Default
INSERT INTO app_settings (key, value, description) VALUES
    ('default_loan_days', '7', 'Durasi standar peminjaman buku (hari)'),
    ('extension_days', '7', 'Durasi tambahan perpanjangan masa pinjam (hari)'),
    ('max_extension_count', '1', 'Batas maksimal perpanjangan buku'),
    ('max_books_per_member', '3', 'Batas maksimal buku aktif yang boleh dipinjam per mahasiswa'),
    ('fine_per_day', '1000', 'Estimasi denda keterlambatan per hari (Rp)'),
    ('wa_overdue_template', 'Halo {nama} (NIM: {nim}), kami dari {nama_perpus} menginformasikan bahwa peminjaman buku "{judul}" telah melewati batas pengembalian pada tanggal {tanggal_tempo} (Terlambat {hari_terlambat} hari). Estimasi denda: {denda}. Layanan sirkulasi buka: {jam_buka}. Mohon segera mengembalikan buku tersebut ke perpustakaan. Terima kasih.', 'Template pesan WhatsApp pengingat keterlambatan'),
    ('wa_loan_receipt_template', 'Halo {nama} (NIM: {nim}), peminjaman buku "{judul}" dengan Kode Transaksi {kode_pinjam} berhasil dicatat pada {tanggal_pinjam}. Batas terakhir pengembalian adalah {tanggal_tempo}. Harap kembalikan tepat waktu ke {nama_perpus}. Terima kasih.', 'Template pesan WhatsApp bukti peminjaman buku'),
    ('library_hotline', '081234567890', 'Nomor WhatsApp / kontak hotline perpustakaan'),
    ('led_duration_seconds', '15', 'Durasi lampu LED menyala di rak fisik (detik)'),
    ('demo_mode_enabled', 'false', 'Status aktifasi Mode Demo IoT untuk rak miniatur peraga'),
    ('library_name', 'UPT Perpustakaan UNSIKA', 'Nama resmi institusi perpustakaan'),
    ('library_hours', 'Senin - Jumat: 08.00 - 16.00 WIB', 'Jam operasional layanan sirkulasi perpustakaan')
ON CONFLICT (key) DO NOTHING;

