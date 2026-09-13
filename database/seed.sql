-- ==============================================================================
-- SEED DATA SAMPEL: FINDLIB UNSIKA
-- ==============================================================================

-- 1. Kategori Buku
INSERT INTO categories (id, name, color_hex, description) VALUES
('CAT-FIKSI', 'Fiksi & Sastra', '#22C55E', 'Koleksi novel, sastra Indonesia & dunia, antologi puisi, dan cerpen'),
('CAT-NONFIKSI', 'Teknologi & Sains', '#EAB308', 'Buku teknologi informasi, sains terapan, kecerdasan buatan, dan elektronika'),
('CAT-SKRIPSI', 'Skripsi & Tugas Akhir TI', '#3B82F6', 'Koleksi karya ilmiah, skripsi, dan proyek akhir mahasiswa Fasilkom UNSIKA')
ON CONFLICT (id) DO NOTHING;

-- 2. Tingkat Rak (Miniatur 3 Tingkat)
INSERT INTO racks (id, rack_name, level_number, led_start_index, led_end_index, category_id) VALUES
('RAK-01-T1', 'Rak A - Tingkat 1 (Bawah)', 1, 1, 4, 'CAT-FIKSI'),
('RAK-01-T2', 'Rak A - Tingkat 2 (Tengah)', 2, 5, 8, 'CAT-NONFIKSI'),
('RAK-01-T3', 'Rak A - Tingkat 3 (Atas)', 3, 9, 12, 'CAT-SKRIPSI')
ON CONFLICT (id) DO NOTHING;

-- 3. Buku Contoh dengan Metadata Lengkap (Kombinasi Buku Demo Rak IoT & Koleksi Umum)
INSERT INTO books (id, isbn, title, author, publisher, publish_year, page_count, synopsis, category_id, rack_id, led_slot, is_demo, cover_url, total_stock, available_stock, borrowed_count, status) VALUES
(
  'BK-001',
  '978-602-03-6651-7',
  'Laut Bercerita',
  'Leila S. Chudori',
  'Kepustakaan Populer Gramedia',
  2017,
  379,
  'Novel yang mengangkat kisah aktivis mahasiswa yang hilang pada masa Orde Baru tahun 1998, menceritakan persahabatan, cinta, keluarga, dan perjuangan kebebasan.',
  'CAT-FIKSI',
  'RAK-01-T1',
  3,
  TRUE,
  'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500&q=80',
  3,
  2,
  1,
  'AVAILABLE'
),
(
  'BK-002',
  '978-979-97312-3-4',
  'Bumi Manusia',
  'Pramoedya Ananta Toer',
  'Lentera Dipantara',
  2005,
  535,
  'Roman sejarah berlatar era kolonial Hindia Belanda tentang pergulatan Minke, pemuda pribumi terpelajar yang memperjuangkan martabat bangsanya.',
  'CAT-FIKSI',
  'RAK-01-T1',
  1,
  TRUE,
  'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=500&q=80',
  2,
  2,
  0,
  'AVAILABLE'
),
(
  'BK-003',
  '978-602-412-518-9',
  'Filosofi Teras',
  'Henry Manampiring',
  'Penerbit Buku Kompas',
  2018,
  346,
  'Panduan praktis filsafat Stoa (Stoisisme) kuno yang disesuaikan dengan kehidupan generasi muda masa kini untuk mengendalikan emosi negatif.',
  'CAT-NONFIKSI',
  'RAK-01-T2',
  6,
  TRUE,
  'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=500&q=80',
  4,
  3,
  1,
  'AVAILABLE'
),
(
  'BK-004',
  '978-602-6232-15-2',
  'Dasar Pemrograman Internet of Things (IoT) Berbasis ESP32',
  'Feri Djuandi',
  'Informatika Bandung',
  2022,
  412,
  'Buku ajar komprehensif mengenai konsep sensor, aktuator, mikrokontroler ESP32, protokol MQTT, dan integrasi cloud IoT.',
  'CAT-NONFIKSI',
  'RAK-01-T2',
  7,
  TRUE,
  'https://images.unsplash.com/photo-1518770660439-4636190af475?w=500&q=80',
  5,
  4,
  1,
  'AVAILABLE'
),
(
  'TA-042',
  'SKR-TI-2025-042',
  'Rancang Bangun Sistem Navigasi Rak Buku IoT Berbasis ESP32 dan MQTT',
  'Wardan N. & Tim UNSIKA',
  'Fakultas Ilmu Komputer UNSIKA',
  2025,
  128,
  'Laporan tugas akhir implementasi Virtual Zoning dan Addressable LED WS2812B untuk otomasi penunjuk lokasi fisik koleksi perpustakaan UNSIKA.',
  'CAT-SKRIPSI',
  'RAK-01-T3',
  11,
  TRUE,
  'https://images.unsplash.com/photo-1532012164546-f432f2e372fe?w=500&q=80',
  1,
  1,
  0,
  'AVAILABLE'
),
(
  'BK-005',
  '978-602-06-3317-6',
  'Clean Code: A Handbook of Agile Software Craftsmanship',
  'Robert C. Martin',
  'Prentice Hall',
  2008,
  464,
  'Panduan standar industri tentang penulisan kode yang bersih, mudah dibaca, dan mudah dirawat untuk rekayasa perangkat lunak profesional.',
  'CAT-NONFIKSI',
  'RAK-01-T2',
  8,
  FALSE,
  'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=500&q=80',
  5,
  5,
  0,
  'AVAILABLE'
),
(
  'TA-099',
  'SKR-TI-2024-099',
  'Analisis Sentimen Opini Publik Menggunakan BERT dan Deep Learning',
  'Dina Mariana',
  'Fakultas Ilmu Komputer UNSIKA',
  2024,
  110,
  'Karya ilmiah skripsi pemodelan pemrosesan bahasa alami (NLP) untuk klasifikasi ulasan pengguna sistem informasi kampus.',
  'CAT-SKRIPSI',
  'RAK-01-T3',
  12,
  FALSE,
  'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=500&q=80',
  2,
  2,
  0,
  'AVAILABLE'
)
ON CONFLICT (id) DO NOTHING;

-- 4. Sample Data Mahasiswa (Members)
INSERT INTO members (nim, name, prodi, phone) VALUES
('22416255201101', 'Ahmad Fadhil', 'Informatika', '081234567890'),
('22416255201102', 'Siti Nurhaliza', 'Sistem Informasi', '082198765432'),
('22416255201103', 'Rizky Pratama', 'Teknik Elektro', '085711223344')
ON CONFLICT (nim) DO NOTHING;

-- 5. Sample Data Peminjaman (Loans)
-- Satu pinjaman aktif biasa (+4 hari sisa)
INSERT INTO loans (id, member_nim, book_id, borrow_date, due_date, status, notes) VALUES
('PJ-202608-001', '22416255201101', 'BK-001', CURRENT_DATE - INTERVAL '3 days', CURRENT_DATE + INTERVAL '4 days', 'BORROWED', 'Peminjaman reguler mahasiswa'),
-- Satu pinjaman terlambat (-2 hari lewat jatuh tempo)
('PJ-202608-002', '22416255201102', 'BK-003', CURRENT_DATE - INTERVAL '9 days', CURRENT_DATE - INTERVAL '2 days', 'OVERDUE', 'Terlambat 2 hari - perlu pengingat WA')
ON CONFLICT (id) DO NOTHING;
