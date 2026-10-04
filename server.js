// ==============================================================================
// 📚 FINDLIB UNSIKA - SERVER UTAMA (Node.js & Express)
// ==============================================================================
// FindLib UNSIKA (Find your Library) - Sistem Navigasi & Rak Pintar IoT
// Single Source of Truth: Neon PostgreSQL Cloud & Cloudinary Media Storage
// ==============================================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mqtt = require('mqtt');
const { Pool } = require('pg');
require('dotenv').config();
const { uploadMiddleware, uploadToCloudinary, deleteFromCloudinary } = require('./cloudinary-helper');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Kredensial Admin dari .env
const ADMIN_USER = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'adminunsika';

// ==============================================================================
// 1. KONEKSI & INISIALISASI DATABASE (Neon PostgreSQL Cloud - SINGLE SOURCE OF TRUTH)
// ==============================================================================
if (!process.env.DATABASE_URL) {
  console.error('❌ [FATAL] DATABASE_URL tidak ditemukan di file .env!');
  console.error('Harap masukkan koneksi Neon PostgreSQL Cloud di file .env.');
}

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

let isPgConnected = false;

pgPool.on('error', (err) => {
  console.error('❌ [DATABASE POOL ERROR]:', err.message);
});

// Helper Query PostgreSQL
async function dbQuery(text, params = []) {
  return await pgPool.query(text, params);
}

// ==============================================================================
// 1.1 APP SETTINGS HELPER (POSTGRESQL SINGLE SOURCE OF TRUTH)
// ==============================================================================
const DEFAULT_SETTINGS = {
  default_loan_days: "7",
  extension_days: "7",
  max_extension_count: "1",
  max_books_per_member: "3",
  fine_per_day: "1000",
  demo_mode_enabled: "false",
  wa_overdue_template: 'Halo {nama} (NIM: {nim}), kami dari {nama_perpus} menginformasikan bahwa peminjaman buku "{judul}" telah melewati batas pengembalian pada tanggal {tanggal_tempo} (Terlambat {hari_terlambat} hari). Estimasi denda: {denda}. Layanan sirkulasi buka: {jam_buka}. Mohon segera mengembalikan buku tersebut ke perpustakaan. Terima kasih.',
  wa_loan_receipt_template: 'Halo {nama} (NIM: {nim}), peminjaman buku "{judul}" dengan Kode Transaksi {kode_pinjam} berhasil dicatat pada {tanggal_pinjam}. Batas terakhir pengembalian adalah {tanggal_tempo}. Harap kembalikan tepat waktu ke {nama_perpus}. Terima kasih.',
  library_hotline: '081234567890',
  led_duration_seconds: "15",
  library_name: 'UPT Perpustakaan UNSIKA',
  library_hours: 'Senin - Jumat: 08.00 - 16.00 WIB'
};

async function getAppSettings() {
  try {
    const res = await dbQuery('SELECT key, value FROM app_settings');
    const settings = { ...DEFAULT_SETTINGS };
    if (res && res.rows) {
      res.rows.forEach(r => {
        settings[r.key] = r.value;
      });
    }
    return settings;
  } catch (err) {
    console.error('❌ [SETTINGS ERROR] Gagal membaca app_settings dari PostgreSQL:', err.message);
    return { ...DEFAULT_SETTINGS };
  }
}

async function saveAppSettings(newSettings) {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    for (const [key, value] of Object.entries(newSettings)) {
      await client.query(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
      `, [key, String(value)]);
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ [SETTINGS ERROR] Gagal menyimpan app_settings ke PostgreSQL:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function initPostgresDatabase() {
  if (!process.env.DATABASE_URL) return;

  try {
    const client = await pgPool.connect();
    console.log('✅ [DATABASE] Sukses terhubung ke Neon PostgreSQL Cloud (Single Source of Truth)!');
    isPgConnected = true;

    // 1. Pastikan kolom dan tabel pendukung sudah ada di database Neon
    try {
      await client.query(`ALTER TABLE books ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT FALSE;`);
      await client.query(`ALTER TABLE books ADD COLUMN IF NOT EXISTS prodi VARCHAR(100);`);
      await client.query(`ALTER TABLE books ADD COLUMN IF NOT EXISTS cover_public_id TEXT;`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_books_is_demo ON books(is_demo);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_books_prodi ON books(prodi);`);
      await client.query(`
        INSERT INTO app_settings (key, value, description)
        VALUES ('demo_mode_enabled', 'false', 'Status aktifasi Mode Demo IoT untuk rak miniatur peraga')
        ON CONFLICT (key) DO NOTHING;
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS organization_members (
          id SERIAL PRIMARY KEY,
          name VARCHAR(150) NOT NULL,
          role_title VARCHAR(100) NOT NULL,
          division VARCHAR(100) DEFAULT 'Pengurus',
          photo_url TEXT,
          photo_public_id TEXT,
          bio TEXT,
          display_order INT DEFAULT 0,
          social_links JSONB DEFAULT '{}',
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } catch (migPreErr) {
      console.warn('⚠️ [DATABASE] Pre-migration books/org info:', migPreErr.message);
    }

    // 2. Eksekusi skema database
    const schemaSqlPath = path.join(__dirname, 'database', 'schema.sql');
    if (fs.existsSync(schemaSqlPath)) {
      const schemaSql = fs.readFileSync(schemaSqlPath, 'utf-8');
      await client.query(schemaSql);
      console.log('✅ [DATABASE] Struktur tabel terverifikasi (categories, racks, books, study_programs, members, loans, app_settings, organization_members).');
    }

    // 3. Cek apakah database kosong untuk inisialisasi seed awal
    const checkBooks = await client.query('SELECT COUNT(*) FROM books');
    if (parseInt(checkBooks.rows[0].count, 10) === 0) {
      console.log('ℹ️ [DATABASE] Database masih kosong. Menjalankan seed data sampel awal...');
      const seedSqlPath = path.join(__dirname, 'database', 'seed.sql');
      if (fs.existsSync(seedSqlPath)) {
        const seedSql = fs.readFileSync(seedSqlPath, 'utf-8');
        await client.query(seedSql);
        console.log('✅ [DATABASE] Seed data sampel awal berhasil diisi ke Neon DB!');
      }
    }

    client.release();
  } catch (error) {
    console.error('❌ [DATABASE] Gagal konek ke Neon PostgreSQL:', error.message || error);
    isPgConnected = false;
  }
}

initPostgresDatabase();

// ==============================================================================
// 2. SETUP MQTT BROKER (HiveMQ Cloud Publisher)
// ==============================================================================
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com';
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'libnav/unsika/rak/led';
let isMqttConnected = false;

const mqttOptions = {
  port: parseInt(process.env.MQTT_PORT || '1883', 10),
  reconnectPeriod: 5000,
  connectTimeout: 10000,
};

if (
  process.env.MQTT_USERNAME &&
  process.env.MQTT_PASSWORD &&
  process.env.MQTT_USERNAME.trim() !== '' &&
  process.env.MQTT_USERNAME.trim() !== '-' &&
  process.env.MQTT_USERNAME.trim().toLowerCase() !== 'none'
) {
  mqttOptions.username = process.env.MQTT_USERNAME.trim();
  mqttOptions.password = process.env.MQTT_PASSWORD.trim();
}

const mqttClient = mqtt.connect(MQTT_BROKER_URL, mqttOptions);

mqttClient.on('connect', () => {
  isMqttConnected = true;
  console.log(`✅ [MQTT] Terhubung ke Broker: ${MQTT_BROKER_URL} (Topik: ${MQTT_TOPIC})`);
});

mqttClient.on('error', (err) => {
  isMqttConnected = false;
  console.warn(`⚠️ [MQTT] Koneksi broker gagal (${MQTT_BROKER_URL}):`, err.message);
});

mqttClient.on('offline', () => {
  isMqttConnected = false;
});

function publishLedEvent(payload) {
  return new Promise((resolve) => {
    const payloadString = JSON.stringify(payload);

    if (isMqttConnected) {
      mqttClient.publish(MQTT_TOPIC, payloadString, { qos: 1 }, (err) => {
        if (err) {
          console.error('❌ [MQTT] Gagal publish payload:', err);
          resolve({ sent: false, error: err.message, payload });
        } else {
          console.log(`📡 [MQTT] Payload berhasil dikirim ke topik [${MQTT_TOPIC}]:`, payload);
          resolve({ sent: true, payload });
        }
      });
    } else {
      console.log(`ℹ️ [MQTT SIMULASI] Broker offline/lokal. Log payload:`, payload);
      resolve({ sent: false, note: 'Broker offline, pesan disimulasikan lokal', payload });
    }
  });
}

// ==============================================================================
// 3. AUTHENTICATION (LOGIN ADMIN DENGAN EXPIRATION & REMEMBER ME)
// ==============================================================================
const AUTH_SECRET = 'unsika_libnav_secret_token_key_2026';

app.post('/api/auth/login', (req, res) => {
  const { username, password, rememberMe } = req.body;

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const durationMs = rememberMe ? (7 * 24 * 60 * 60 * 1000) : (24 * 60 * 60 * 1000);
    const expiresAt = Date.now() + durationMs;

    const tokenPayload = `${username}:${expiresAt}:${AUTH_SECRET}`;
    const token = Buffer.from(tokenPayload).toString('base64');

    return res.json({
      success: true,
      message: rememberMe ? 'Login Berhasil! Sesi aktif selama 7 hari.' : 'Login Berhasil! Sesi aktif selama 24 jam.',
      token: token,
      expiresAt: expiresAt,
      rememberMe: !!rememberMe,
      user: { username: ADMIN_USER, role: 'ADMINISTRATOR' }
    });
  } else {
    return res.status(401).json({
      success: false,
      error: 'Username atau Password Admin salah! Periksa kembali file .env Anda.'
    });
  }
});

app.get('/api/auth/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ authenticated: false, reason: 'NO_TOKEN' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [tokenUser, expiresAtStr, secret] = decoded.split(':');

    if (tokenUser === ADMIN_USER && secret === AUTH_SECRET) {
      const expiresAt = parseInt(expiresAtStr, 10);

      if (Date.now() > expiresAt) {
        return res.status(401).json({ authenticated: false, reason: 'TOKEN_EXPIRED' });
      }

      return res.json({
        authenticated: true,
        expiresAt: expiresAt,
        user: { username: ADMIN_USER, role: 'ADMINISTRATOR' }
      });
    }
  } catch (e) { }

  return res.status(401).json({ authenticated: false, reason: 'INVALID_TOKEN' });
});

// ==============================================================================
// 4. REST API ENDPOINTS (POSTGRESQL SINGLE SOURCE OF TRUTH)
// ==============================================================================

// Info Status Sistem & Statistik
app.get('/api/system-status', async (req, res) => {
  try {
    const settings = await getAppSettings();
    const isDemoModeActive = settings.demo_mode_enabled === 'true';

    const bRes = await dbQuery(`
      SELECT 
        COUNT(*) as titles, 
        COALESCE(SUM(total_stock), 0) as total_stock, 
        COALESCE(SUM(available_stock), 0) as available_stock, 
        COALESCE(SUM(borrowed_count), 0) as borrowed_count,
        COUNT(CASE WHEN is_demo = TRUE THEN 1 END) as demo_books_count
      FROM books
    `);
    const cRes = await dbQuery('SELECT COUNT(*) FROM categories');

    const totalTitles = parseInt(bRes.rows[0].titles, 10) || 0;
    const totalStock = parseInt(bRes.rows[0].total_stock, 10) || 0;
    const availableStock = parseInt(bRes.rows[0].available_stock, 10) || 0;
    const borrowedCount = parseInt(bRes.rows[0].borrowed_count, 10) || 0;
    const demoBooksCount = parseInt(bRes.rows[0].demo_books_count, 10) || 0;
    const totalCategories = parseInt(cRes.rows[0].count, 10) || 0;

    res.json({
      appName: 'FindLib UNSIKA (Find your Library)',
      version: '1.0.0',
      stats: {
        totalTitles,
        totalCategories,
        totalStock,
        availableStock,
        borrowedCount,
        demoBooksCount,
        generalBooksCount: Math.max(0, totalTitles - demoBooksCount)
      },
      demoMode: {
        enabled: isDemoModeActive,
        demoBooksCount: demoBooksCount,
        totalBooksCount: totalTitles
      },
      database: {
        mode: 'Neon PostgreSQL Cloud (Single Source of Truth)',
        connected: isPgConnected
      },
      mqtt: {
        broker: MQTT_BROKER_URL,
        topic: MQTT_TOPIC,
        status: isMqttConnected ? 'CONNECTED' : 'DISCONNECTED / LOCAL SIMULATION'
      },
      config: {
        animationDuration: parseInt(settings.led_duration_seconds || process.env.LED_ANIMATION_DURATION || '15', 10)
      }
    });
  } catch (err) {
    console.error('Error stats query:', err.message);
    res.status(500).json({ error: 'Gagal mengambil status sistem dari database', details: err.message });
  }
});

// Ambil Kategori
app.get('/api/categories', async (req, res) => {
  try {
    const result = await dbQuery('SELECT * FROM categories ORDER BY name ASC');
    return res.json(result.rows);
  } catch (err) {
    console.error('Error get categories:', err.message);
    res.status(500).json({ error: 'Gagal mengambil kategori', details: err.message });
  }
});

// Tambah Kategori Baru
app.post('/api/categories', async (req, res) => {
  try {
    const { id, name, color_hex, description } = req.body;
    if (!id || !name || !color_hex) {
      return res.status(400).json({ error: 'ID, Nama Kategori, dan Kode Warna HEX wajib diisi!' });
    }

    const result = await dbQuery(`
      INSERT INTO categories (id, name, color_hex, description)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE 
      SET name = EXCLUDED.name, color_hex = EXCLUDED.color_hex, description = EXCLUDED.description
      RETURNING *
    `, [id, name, color_hex, description || '']);

    return res.status(201).json({ success: true, category: result.rows[0] });
  } catch (err) {
    console.error('Error create category:', err.message);
    res.status(500).json({ error: 'Gagal menambah kategori', details: err.message });
  }
});

// ==============================================================================
// 4.1 PROGRAM STUDI (MASTER & AKTIF)
// ==============================================================================
// Ambil Daftar Program Studi (Hanya dari yang tercatat pada koleksi buku & master)
app.get('/api/prodi', async (req, res) => {
  try {
    const activeRes = await dbQuery("SELECT DISTINCT prodi FROM books WHERE prodi IS NOT NULL AND TRIM(prodi) != '' ORDER BY prodi ASC");
    const prodiList = activeRes.rows.map(r => r.prodi).filter(Boolean);
    return res.json(prodiList);
  } catch (err) {
    console.error('Error get prodi:', err.message);
    res.status(500).json({ error: 'Gagal mengambil daftar prodi', details: err.message });
  }
});

// Tambah Program Studi Baru
app.post('/api/prodi', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nama program studi wajib diisi!' });
    }
    const cleanName = name.trim();

    await dbQuery(`
      INSERT INTO study_programs (name)
      VALUES ($1)
      ON CONFLICT (name) DO NOTHING
    `, [cleanName]);

    return res.status(201).json({ success: true, name: cleanName });
  } catch (err) {
    console.error('Error create prodi:', err.message);
    res.status(500).json({ error: 'Gagal menambah program studi', details: err.message });
  }
});

// Ambil Rak
app.get('/api/racks', async (req, res) => {
  try {
    const result = await dbQuery(`
      SELECT r.*, c.name as category_name, c.color_hex
      FROM racks r
      LEFT JOIN categories c ON r.category_id = c.id
      ORDER BY r.level_number ASC
    `);
    return res.json(result.rows);
  } catch (err) {
    console.error('Error get racks:', err.message);
    res.status(500).json({ error: 'Gagal mengambil rak', details: err.message });
  }
});

// Ambil Daftar Buku (Mendukung Multi Filter Kategori, Prodi, Range Tahun, Mode Demo, & Pencarian)
app.get('/api/books', async (req, res) => {
  try {
    const { q, category, categories, prodi, prodis, year, year_from, year_to, demo_filter, demo_only, all } = req.query;
    const settings = await getAppSettings();
    const isGlobalDemoActive = settings.demo_mode_enabled === 'true';

    let effectiveDemoFilter = 'all';
    if (demo_filter) {
      effectiveDemoFilter = demo_filter; // 'demo', 'general', 'all'
    } else if (demo_only === 'true') {
      effectiveDemoFilter = 'demo';
    } else if (demo_only === 'false') {
      effectiveDemoFilter = 'general';
    } else if (demo_only === 'all' || all === 'true') {
      effectiveDemoFilter = 'all';
    } else if (isGlobalDemoActive) {
      effectiveDemoFilter = 'demo';
    }

    // Parse multi-select filters
    let catList = [];
    if (categories) catList = categories.split(',').map(s => s.trim()).filter(Boolean);
    else if (category && category !== 'ALL') catList = [category.trim()];

    let prodiList = [];
    if (prodis) prodiList = prodis.split(',').map(s => s.trim()).filter(Boolean);
    else if (prodi && prodi !== 'ALL') prodiList = [prodi.trim()];

    const yFrom = year_from ? parseInt(year_from, 10) : (year && year !== 'ALL' ? parseInt(year, 10) : null);
    const yTo = year_to ? parseInt(year_to, 10) : (year && year !== 'ALL' ? parseInt(year, 10) : null);

    let query = `
      SELECT b.*, c.name as category_name, c.color_hex, 
             r.rack_name, r.level_number, r.led_start_index, r.led_end_index
      FROM books b
      LEFT JOIN categories c ON b.category_id = c.id
      LEFT JOIN racks r ON b.rack_id = r.id
      WHERE 1=1
    `;
    const params = [];

    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      query += ` AND (LOWER(b.title) LIKE $${params.length} OR LOWER(b.author) LIKE $${params.length} OR LOWER(b.id) LIKE $${params.length} OR LOWER(COALESCE(b.isbn, '')) LIKE $${params.length} OR LOWER(COALESCE(b.prodi, '')) LIKE $${params.length})`;
    }

    const nonSkripsiCats = catList.filter(c => !c.toLowerCase().includes('skripsi'));

    if (prodiList.length > 0) {
      const prodiPlaceholders = prodiList.map(p => {
        params.push(p);
        return `$${params.length}`;
      }).join(', ');

      if (nonSkripsiCats.length > 0) {
        const catPlaceholders = nonSkripsiCats.map(c => {
          params.push(c);
          return `$${params.length}`;
        }).join(', ');

        // Buku umum yang dipilih ATAU Skripsi dari prodi yang dipilih
        query += ` AND (b.category_id IN (${catPlaceholders}) OR b.prodi IN (${prodiPlaceholders}))`;
      } else {
        // Hanya skripsi dari prodi yang dipilih
        query += ` AND b.prodi IN (${prodiPlaceholders})`;
      }
    } else if (catList.length > 0) {
      const placeholders = catList.map(c => {
        params.push(c);
        return `$${params.length}`;
      }).join(', ');
      query += ` AND b.category_id IN (${placeholders})`;
    }

    if (yFrom) {
      params.push(yFrom);
      query += ` AND b.publish_year >= $${params.length}`;
    }

    if (yTo) {
      params.push(yTo);
      query += ` AND b.publish_year <= $${params.length}`;
    }

    if (effectiveDemoFilter === 'demo') {
      query += ` AND b.is_demo = TRUE`;
    } else if (effectiveDemoFilter === 'general') {
      query += ` AND (b.is_demo = FALSE OR b.is_demo IS NULL)`;
    }

    query += ' ORDER BY b.title ASC';
    const result = await dbQuery(query, params);
    return res.json(result.rows);
  } catch (err) {
    console.error('Error get books:', err.message);
    res.status(500).json({ error: 'Gagal mengambil data buku', details: err.message });
  }
});

// Ambil Detail 1 Buku
app.get('/api/books/:id', async (req, res) => {
  try {
    const bookId = req.params.id;
    const result = await dbQuery(`
      SELECT b.*, c.name as category_name, c.color_hex, 
             r.rack_name, r.level_number, r.led_start_index, r.led_end_index
      FROM books b
      LEFT JOIN categories c ON b.category_id = c.id
      LEFT JOIN racks r ON b.rack_id = r.id
      WHERE b.id = $1
    `, [bookId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Buku tidak ditemukan' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Error get book detail:', err.message);
    res.status(500).json({ error: 'Gagal mengambil detail buku', details: err.message });
  }
});

// ==============================================================================
// 4.2 UNIVERSAL MEDIA UPLOAD & CLEANUP (CLOUDINARY)
// ==============================================================================

// Upload Gambar ke Cloudinary
app.post('/api/upload/image', uploadMiddleware.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Tidak ada file gambar yang diunggah.' });
    }

    const folderParam = req.body.folder || req.query.folder || 'covers';
    const prefixParam = req.body.prefix || req.query.prefix || 'img';

    const allowedFolders = ['covers', 'team', 'organization', 'general', 'banners'];
    const subFolder = allowedFolders.includes(folderParam) ? folderParam : 'general';
    const targetFolder = `findlib-unsika/${subFolder}`;

    const uploadResult = await uploadToCloudinary(req.file.buffer, {
      folder: targetFolder,
      prefix: prefixParam
    });

    return res.json({
      success: true,
      url: uploadResult.url,
      public_id: uploadResult.public_id,
      format: uploadResult.format,
      bytes: uploadResult.bytes
    });
  } catch (err) {
    console.error('❌ Upload Controller Error:', err);
    return res.status(500).json({ error: 'Gagal mengunggah gambar ke Cloudinary', details: err.message });
  }
});

// Hapus Gambar dari Cloudinary
app.post('/api/upload/delete', async (req, res) => {
  try {
    const { public_id } = req.body;
    if (!public_id) {
      return res.status(400).json({ error: 'public_id wajib disertakan.' });
    }
    const isDeleted = await deleteFromCloudinary(public_id);
    return res.json({ success: isDeleted });
  } catch (err) {
    console.error('❌ Delete Image Error:', err);
    return res.status(500).json({ error: 'Gagal menghapus gambar', details: err.message });
  }
});

// Tambah Buku Baru
app.post('/api/books', async (req, res) => {
  try {
    const {
      id, isbn, title, author, publisher, publish_year,
      page_count, synopsis, category_id, prodi, rack_id, led_slot,
      is_demo, cover_url, cover_public_id, total_stock, available_stock
    } = req.body;

    if (!id || !title || !author || !category_id || !rack_id || !led_slot) {
      return res.status(400).json({
        error: 'Mohon lengkapi data wajib: ID/Barcode, Judul, Penulis, Kategori, Rak, dan Titik LED.'
      });
    }

    const defaultCover = cover_url && cover_url.trim().length > 0
      ? cover_url.trim()
      : 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500&q=80';

    const cleanPublicId = cover_public_id && cover_public_id.trim().length > 0
      ? cover_public_id.trim()
      : null;

    const stockTotal = parseInt(total_stock || 1, 10);
    const stockAvailable = available_stock !== undefined ? parseInt(available_stock, 10) : stockTotal;
    const stockBorrowed = stockTotal - stockAvailable;
    const bookStatus = stockAvailable > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK';
    const isDemoBool = is_demo === true || is_demo === 'true';
    const prodiVal = prodi && prodi.trim().length > 0 ? prodi.trim() : null;

    const result = await dbQuery(`
      INSERT INTO books (
        id, isbn, title, author, publisher, publish_year, page_count,
        synopsis, category_id, prodi, rack_id, led_slot, is_demo, cover_url, cover_public_id,
        total_stock, available_stock, borrowed_count, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `, [
      id, isbn || null, title, author, publisher || null,
      publish_year ? parseInt(publish_year, 10) : null,
      page_count ? parseInt(page_count, 10) : null,
      synopsis || '', category_id, prodiVal, rack_id, parseInt(led_slot, 10),
      isDemoBool, defaultCover, cleanPublicId, stockTotal, stockAvailable, stockBorrowed, bookStatus
    ]);

    return res.status(201).json({ success: true, book: result.rows[0] });
  } catch (err) {
    console.error('Error tambah buku:', err);
    if (err.code === '23505') {
      return res.status(400).json({ error: `Buku dengan ID/Barcode [${req.body.id}] sudah ada di database!` });
    }
    res.status(500).json({ error: 'Gagal menambah buku ke database', details: err.message });
  }
});

// Edit Buku
app.put('/api/books/:id', async (req, res) => {
  try {
    const bookId = req.params.id;
    const {
      isbn, title, author, publisher, publish_year,
      page_count, synopsis, category_id, prodi, rack_id, led_slot,
      is_demo, cover_url, cover_public_id, total_stock, available_stock
    } = req.body;

    const defaultCover = cover_url && cover_url.trim().length > 0
      ? cover_url.trim()
      : 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500&q=80';

    const cleanPublicId = cover_public_id && cover_public_id.trim().length > 0
      ? cover_public_id.trim()
      : null;

    const stockTotal = parseInt(total_stock || 1, 10);
    const stockAvailable = available_stock !== undefined ? parseInt(available_stock, 10) : stockTotal;
    const stockBorrowed = Math.max(0, stockTotal - stockAvailable);
    const bookStatus = stockAvailable > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK';
    const isDemoBool = is_demo === true || is_demo === 'true';
    const prodiVal = prodi && prodi.trim().length > 0 ? prodi.trim() : null;

    // Ambil public_id lama untuk pembersihan jika cover diganti
    const oldBookRes = await dbQuery('SELECT cover_public_id FROM books WHERE id = $1', [bookId]);
    const oldPublicId = oldBookRes.rows.length > 0 ? oldBookRes.rows[0].cover_public_id : null;

    const result = await dbQuery(`
      UPDATE books SET
        isbn = $1, title = $2, author = $3, publisher = $4,
        publish_year = $5, page_count = $6, synopsis = $7,
        category_id = $8, prodi = $9, rack_id = $10, led_slot = $11,
        is_demo = $12, cover_url = $13, cover_public_id = $14, total_stock = $15, available_stock = $16,
        borrowed_count = $17, status = $18, updated_at = CURRENT_TIMESTAMP
      WHERE id = $19
      RETURNING *
    `, [
      isbn || null, title, author, publisher || null,
      publish_year ? parseInt(publish_year, 10) : null,
      page_count ? parseInt(page_count, 10) : null,
      synopsis || '', category_id, prodiVal, rack_id, parseInt(led_slot, 10),
      isDemoBool, defaultCover, cleanPublicId, stockTotal, stockAvailable, stockBorrowed, bookStatus,
      bookId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Buku tidak ditemukan' });
    }

    // Bersihkan gambar lama di Cloudinary jika diganti
    if (oldPublicId && cleanPublicId && oldPublicId !== cleanPublicId) {
      deleteFromCloudinary(oldPublicId);
    }

    return res.json({ success: true, book: result.rows[0] });
  } catch (err) {
    console.error('Error edit buku:', err);
    res.status(500).json({ error: 'Gagal mengupdate buku', details: err.message });
  }
});

// Hapus Buku (Beserta file cover di Cloudinary)
app.delete('/api/books/:id', async (req, res) => {
  try {
    const bookId = req.params.id;
    const result = await dbQuery('DELETE FROM books WHERE id = $1 RETURNING *', [bookId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Buku tidak ditemukan' });
    }
    const deletedBook = result.rows[0];
    if (deletedBook.cover_public_id) {
      deleteFromCloudinary(deletedBook.cover_public_id);
    }
    return res.json({ success: true, message: `Buku [${bookId}] berhasil dihapus.` });
  } catch (err) {
    console.error('Error hapus buku:', err.message);
    res.status(500).json({ error: 'Gagal menghapus buku', details: err.message });
  }
});

// ==============================================================================
// 4.3 STRUKTUR ORGANISASI & PROFIL TIM DINAMIS (ABOUT / TEAM)
// ==============================================================================

// Ambil Daftar Anggota / Struktur Organisasi
app.get('/api/organization', async (req, res) => {
  try {
    const result = await dbQuery(`
      SELECT * FROM organization_members 
      ORDER BY display_order ASC, id ASC
    `);
    return res.json(result.rows);
  } catch (err) {
    console.error('Error ambil data organisasi:', err);
    res.status(500).json({ error: 'Gagal mengambil data struktur organisasi', details: err.message });
  }
});

// Tambah Anggota Organisasi Baru
app.post('/api/organization', async (req, res) => {
  try {
    const {
      name, role_title, division, photo_url, photo_public_id,
      bio, display_order, social_links, is_active
    } = req.body;

    if (!name || !role_title) {
      return res.status(400).json({ error: 'Nama dan Jabatan wajib diisi.' });
    }

    const orderNum = parseInt(display_order || 0, 10);
    const activeBool = is_active !== undefined ? Boolean(is_active) : true;
    const divisionVal = division || 'Pengurus';
    const socialVal = social_links || {};

    const result = await dbQuery(`
      INSERT INTO organization_members (
        name, role_title, division, photo_url, photo_public_id,
        bio, display_order, social_links, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      name, role_title, divisionVal, photo_url || null, photo_public_id || null,
      bio || '', orderNum, JSON.stringify(socialVal), activeBool
    ]);
    return res.status(201).json({ success: true, member: result.rows[0] });
  } catch (err) {
    console.error('Error tambah anggota organisasi:', err);
    res.status(500).json({ error: 'Gagal menambah anggota organisasi', details: err.message });
  }
});

// Update Anggota Organisasi
app.put('/api/organization/:id', async (req, res) => {
  try {
    const memberId = parseInt(req.params.id, 10);
    const {
      name, role_title, division, photo_url, photo_public_id,
      bio, display_order, social_links, is_active
    } = req.body;

    const orderNum = parseInt(display_order || 0, 10);
    const activeBool = is_active !== undefined ? Boolean(is_active) : true;
    const divisionVal = division || 'Pengurus';
    const socialVal = social_links || {};

    const oldRes = await dbQuery('SELECT photo_public_id FROM organization_members WHERE id = $1', [memberId]);
    const oldPublicId = oldRes.rows.length > 0 ? oldRes.rows[0].photo_public_id : null;

    const result = await dbQuery(`
      UPDATE organization_members SET
        name = $1, role_title = $2, division = $3, photo_url = $4, photo_public_id = $5,
        bio = $6, display_order = $7, social_links = $8, is_active = $9, updated_at = CURRENT_TIMESTAMP
      WHERE id = $10
      RETURNING *
    `, [
      name, role_title, divisionVal, photo_url || null, photo_public_id || null,
      bio || '', orderNum, JSON.stringify(socialVal), activeBool,
      memberId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Anggota organisasi tidak ditemukan' });
    }

    if (oldPublicId && photo_public_id && oldPublicId !== photo_public_id) {
      deleteFromCloudinary(oldPublicId);
    }

    return res.json({ success: true, member: result.rows[0] });
  } catch (err) {
    console.error('Error update anggota organisasi:', err);
    res.status(500).json({ error: 'Gagal mengupdate data organisasi', details: err.message });
  }
});

// Hapus Anggota Organisasi
app.delete('/api/organization/:id', async (req, res) => {
  try {
    const memberId = parseInt(req.params.id, 10);
    const result = await dbQuery('DELETE FROM organization_members WHERE id = $1 RETURNING *', [memberId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Anggota organisasi tidak ditemukan' });
    }
    const deletedMember = result.rows[0];
    if (deletedMember.photo_public_id) {
      deleteFromCloudinary(deletedMember.photo_public_id);
    }
    return res.json({ success: true, message: 'Anggota organisasi berhasil dihapus' });
  } catch (err) {
    console.error('Error hapus anggota organisasi:', err);
    res.status(500).json({ error: 'Gagal menghapus anggota organisasi', details: err.message });
  }
});

// Trigger Sinyal Lampu Rak LED
app.post('/api/locate/:id', async (req, res) => {
  try {
    const bookId = req.params.id;
    const result = await dbQuery(`
      SELECT b.*, c.name as category_name, c.color_hex, 
             r.rack_name, r.level_number, r.led_start_index, r.led_end_index
      FROM books b
      LEFT JOIN categories c ON b.category_id = c.id
      LEFT JOIN racks r ON b.rack_id = r.id
      WHERE b.id = $1
    `, [bookId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: `Buku [${bookId}] tidak ditemukan.` });
    }

    const book = result.rows[0];
    const settings = await getAppSettings();
    const duration = parseInt(settings.led_duration_seconds || process.env.LED_ANIMATION_DURATION || '15', 10);
    const mqttPayload = {
      event: 'LOCATE_BOOK',
      book_id: book.id,
      title: book.title,
      rack_level: book.level_number || 1,
      led_target: book.led_slot,
      led_range: [book.led_start_index || 1, book.led_end_index || 4],
      color_hex: book.color_hex || '#22C55E',
      category: book.category_name || 'Umum',
      action: 'HIGHLIGHT',
      duration_seconds: duration,
      triggered_at: new Date().toISOString()
    };

    const mqttResult = await publishLedEvent(mqttPayload);

    return res.json({
      success: true,
      message: `Navigasi LED diaktifkan untuk "${book.title}" (Tingkat ${book.level_number}, Slot #${book.led_slot})`,
      book,
      mqtt: mqttResult,
      payload: mqttPayload
    });
  } catch (err) {
    console.error('Error saat melacak buku:', err);
    res.status(500).json({ error: 'Gagal mengirim sinyal navigasi', details: err.message });
  }
});

// ==============================================================================
// 5. REST API: ANGGOTA MAHASISWA (MEMBERS)
// ==============================================================================

// Ambil Semua Mahasiswa / Cari berdasarkan Query
app.get('/api/members', async (req, res) => {
  const { q } = req.query;

  try {
    let query = 'SELECT * FROM members';
    let params = [];
    if (q) {
      query += ' WHERE nim ILIKE $1 OR name ILIKE $1 OR prodi ILIKE $1';
      params.push(`%${q}%`);
    }
    query += ' ORDER BY name ASC';
    const result = await dbQuery(query, params);
    return res.json(result.rows);
  } catch (err) {
    console.error('Error get members:', err);
    res.status(500).json({ error: 'Gagal mengambil data mahasiswa dari database.', details: err.message });
  }
});

// Ambil Mahasiswa Spesifik berdasarkan NIM (Untuk Smart Auto-Fill)
app.get('/api/members/:nim', async (req, res) => {
  const { nim } = req.params;

  try {
    const result = await dbQuery('SELECT * FROM members WHERE nim = $1', [nim]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mahasiswa belum terdaftar.' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Error get member by nim:', err);
    res.status(500).json({ error: 'Gagal mencari mahasiswa.', details: err.message });
  }
});

// Tambah / Simpan Data Mahasiswa
app.post('/api/members', async (req, res) => {
  const { nim, name, prodi, phone } = req.body;

  if (!nim || !name || !prodi || !phone) {
    return res.status(400).json({ error: 'Field NIM, Nama, Prodi, dan No. HP wajib diisi!' });
  }

  try {
    await dbQuery(`
      INSERT INTO members (nim, name, prodi, phone)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (nim) DO UPDATE 
      SET name = EXCLUDED.name, prodi = EXCLUDED.prodi, phone = EXCLUDED.phone
    `, [nim, name, prodi, phone]);
    return res.json({ success: true, message: 'Data mahasiswa berhasil disimpan!' });
  } catch (err) {
    console.error('Error save member:', err);
    res.status(500).json({ error: 'Gagal menyimpan data mahasiswa ke database.', details: err.message });
  }
});

// Hapus Data Mahasiswa
app.delete('/api/members/:nim', async (req, res) => {
  const { nim } = req.params;

  try {
    await dbQuery('DELETE FROM members WHERE nim = $1', [nim]);
    return res.json({ success: true, message: 'Data mahasiswa berhasil dihapus.' });
  } catch (err) {
    console.error('Error delete member:', err);
    res.status(500).json({ error: 'Gagal menghapus mahasiswa dari database.', details: err.message });
  }
});

// ==============================================================================
// 6. REST API: PEMINJAMAN BUKU (LOANS)
// ==============================================================================

// Ambil Daftar Peminjaman (dengan kalkulasi keterlambatan & join info buku + mahasiswa)
app.get('/api/loans', async (req, res) => {
  const { status, q } = req.query;

  try {
    let query = `
      SELECT 
        l.id, 
        l.member_nim, 
        m.name AS member_name, 
        m.prodi AS member_prodi, 
        m.phone AS member_phone,
        l.book_id, 
        b.title AS book_title, 
        b.cover_url AS book_cover, 
        b.rack_id,
        b.led_slot,
        r.rack_name,
        r.level_number,
        TO_CHAR(l.borrow_date, 'YYYY-MM-DD') AS borrow_date, 
        TO_CHAR(l.due_date, 'YYYY-MM-DD') AS due_date, 
        TO_CHAR(l.return_date, 'YYYY-MM-DD') AS return_date, 
        l.extension_count,
        l.notes,
        CASE 
          WHEN l.return_date IS NOT NULL THEN 'RETURNED'
          WHEN CURRENT_DATE > l.due_date THEN 'OVERDUE'
          WHEN l.extension_count > 0 THEN 'EXTENDED'
          ELSE 'BORROWED'
        END AS calculated_status,
        CASE 
          WHEN l.return_date IS NULL AND CURRENT_DATE > l.due_date 
          THEN (CURRENT_DATE - l.due_date) 
          ELSE 0 
        END AS days_overdue
      FROM loans l
      LEFT JOIN members m ON l.member_nim = m.nim
      LEFT JOIN books b ON l.book_id = b.id
      LEFT JOIN racks r ON b.rack_id = r.id
      WHERE 1=1
    `;
    let params = [];

    if (status === 'ACTIVE') {
      query += " AND l.return_date IS NULL";
    } else if (status === 'OVERDUE') {
      query += " AND l.return_date IS NULL AND CURRENT_DATE > l.due_date";
    } else if (status === 'RETURNED') {
      query += " AND l.return_date IS NOT NULL";
    }

    if (q) {
      params.push(`%${q}%`);
      query += ` AND (m.name ILIKE $${params.length} OR m.nim ILIKE $${params.length} OR b.title ILIKE $${params.length} OR l.id ILIKE $${params.length})`;
    }

    query += " ORDER BY CASE WHEN l.return_date IS NULL AND CURRENT_DATE > l.due_date THEN 0 ELSE 1 END, l.due_date ASC";

    const result = await dbQuery(query, params);
    return res.json(result.rows);
  } catch (err) {
    console.error('Error get loans:', err);
    res.status(500).json({ error: 'Gagal mengambil data peminjaman dari database.', details: err.message });
  }
});

// Transaksi Peminjaman Baru (Dinamis sesuai Settings)
app.post('/api/loans', async (req, res) => {
  const { member_nim, member_name, member_prodi, member_phone, book_id, notes } = req.body;

  if (!member_nim || !book_id) {
    return res.status(400).json({ error: 'NIM Mahasiswa dan Buku wajib dipilih!' });
  }

  try {
    const settings = await getAppSettings();
    const loanDays = parseInt(settings.default_loan_days || '7', 10);
    const maxBooks = parseInt(settings.max_books_per_member || '3', 10);
    const loanId = `PJ-${Date.now().toString().slice(-6)}`;

    // 1. Cek batas maksimal peminjaman aktif per mahasiswa
    const activeLoansRes = await dbQuery(`
      SELECT COUNT(*) FROM loans 
      WHERE member_nim = $1 AND return_date IS NULL
    `, [member_nim]);
    const activeCount = parseInt(activeLoansRes.rows[0].count, 10);
    if (activeCount >= maxBooks) {
      return res.status(400).json({
        error: `Mahasiswa dengan NIM ${member_nim} telah mencapai batas peminjaman maksimal (${maxBooks} buku aktif). Harap kembalikan buku sebelumnya terlebih dahulu.`
      });
    }

    // 2. Pastikan mahasiswa tersimpan di tabel members
    if (member_name && member_prodi && member_phone) {
      await dbQuery(`
        INSERT INTO members (nim, name, prodi, phone)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (nim) DO UPDATE 
        SET name = EXCLUDED.name, prodi = EXCLUDED.prodi, phone = EXCLUDED.phone
      `, [member_nim, member_name, member_prodi, member_phone]);
    }

    // 3. Cek ketersediaan stok buku
    const bookRes = await dbQuery('SELECT available_stock, title FROM books WHERE id = $1', [book_id]);
    if (bookRes.rows.length === 0) {
      return res.status(404).json({ error: 'Buku tidak ditemukan.' });
    }
    if ((bookRes.rows[0].available_stock || 0) <= 0) {
      return res.status(400).json({ error: `Buku "${bookRes.rows[0].title}" sedang habis dipinjam!` });
    }

    // 4. Buat transaksi peminjaman (Batas dinamis sesuai settings)
    const insertRes = await dbQuery(`
      INSERT INTO loans (id, member_nim, book_id, borrow_date, due_date, status, notes)
      VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_DATE + ($5 || ' days')::INTERVAL, 'BORROWED', $4)
      RETURNING id, member_nim, book_id, TO_CHAR(borrow_date, 'YYYY-MM-DD') AS borrow_date, TO_CHAR(due_date, 'YYYY-MM-DD') AS due_date, status, notes
    `, [loanId, member_nim, book_id, notes || 'Peminjaman Mahasiswa', loanDays]);

    const loanRow = insertRes.rows[0];

    // 5. Kurangi stok buku
    await dbQuery(`
      UPDATE books 
      SET available_stock = GREATEST(0, available_stock - 1),
          borrowed_count = borrowed_count + 1
      WHERE id = $1
    `, [book_id]);

    return res.json({
      success: true,
      message: 'Transaksi peminjaman berhasil disimpan!',
      data: {
        loan_id: loanId,
        member_nim: member_nim,
        member_name: member_name || member_nim,
        member_prodi: member_prodi || '',
        book_id: book_id,
        book_title: bookRes.rows[0].title,
        borrow_date: loanRow.borrow_date,
        due_date: loanRow.due_date,
        loan_days: loanDays,
        status: 'BORROWED'
      }
    });
  } catch (err) {
    console.error('Error create loan:', err);
    res.status(500).json({ error: 'Gagal membuat transaksi peminjaman.', details: err.message });
  }
});

// Perpanjang Masa Peminjaman (Dinamis sesuai Settings)
app.post('/api/loans/:id/extend', async (req, res) => {
  const { id } = req.params;

  try {
    const settings = await getAppSettings();
    const extensionDays = parseInt(settings.extension_days || '7', 10);
    const maxExtension = parseInt(settings.max_extension_count || '1', 10);

    const loanRes = await dbQuery(`
      SELECT l.*, b.title as book_title, m.name as member_name 
      FROM loans l
      LEFT JOIN books b ON l.book_id = b.id
      LEFT JOIN members m ON l.member_nim = m.nim
      WHERE l.id = $1
    `, [id]);
    if (loanRes.rows.length === 0) {
      return res.status(404).json({ error: 'Data peminjaman tidak ditemukan.' });
    }

    const loan = loanRes.rows[0];
    if (loan.return_date) {
      return res.status(400).json({ error: 'Buku sudah dikembalikan, tidak dapat diperpanjang.' });
    }
    if ((loan.extension_count || 0) >= maxExtension) {
      return res.status(400).json({ error: `Buku ini sudah pernah diperpanjang ${loan.extension_count} kali (Batas maksimal ${maxExtension}x tercapai).` });
    }

    // Tambah batas waktu sesuai extension_days
    const updateRes = await dbQuery(`
      UPDATE loans 
      SET due_date = due_date + ($2 || ' days')::INTERVAL,
          extension_count = extension_count + 1,
          status = 'EXTENDED'
      WHERE id = $1
      RETURNING TO_CHAR(due_date, 'YYYY-MM-DD') AS due_date, extension_count
    `, [id, extensionDays]);

    return res.json({
      success: true,
      message: `Peminjaman berhasil diperpanjang ${extensionDays} hari!`,
      data: {
        loan_id: id,
        book_title: loan.book_title,
        member_name: loan.member_name,
        extension_days: extensionDays,
        due_date: updateRes.rows[0].due_date
      }
    });
  } catch (err) {
    console.error('Error extend loan:', err);
    res.status(500).json({ error: 'Gagal memperpanjang peminjaman.', details: err.message });
  }
});

// Pengembalian Buku (Return Book & Kembalikan Stok)
app.post('/api/loans/:id/return', async (req, res) => {
  const { id } = req.params;

  try {
    const loanRes = await dbQuery('SELECT * FROM loans WHERE id = $1', [id]);
    if (loanRes.rows.length === 0) {
      return res.status(404).json({ error: 'Peminjaman tidak ditemukan.' });
    }

    const loan = loanRes.rows[0];
    if (loan.return_date) {
      return res.status(400).json({ error: 'Buku ini sudah tercatat telah dikembalikan.' });
    }

    // 1. Update status peminjaman menjadi RETURNED
    await dbQuery(`
      UPDATE loans 
      SET return_date = CURRENT_DATE,
          status = 'RETURNED'
      WHERE id = $1
    `, [id]);

    // 2. Kembalikan stok buku
    await dbQuery(`
      UPDATE books 
      SET available_stock = available_stock + 1,
          borrowed_count = GREATEST(0, borrowed_count - 1)
      WHERE id = $1
    `, [loan.book_id]);

    return res.json({ success: true, message: 'Buku berhasil dikembalikan! Stok rak telah diperbarui.' });
  } catch (err) {
    console.error('Error return book:', err);
    res.status(500).json({ error: 'Gagal memproses pengembalian buku.', details: err.message });
  }
});

// ==============================================================================
// 7. REST API: PENGATURAN PERPUSTAKAAN (APP SETTINGS)
// ==============================================================================

// Ambil Seluruh Pengaturan
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await getAppSettings();
    res.json(settings);
  } catch (err) {
    console.error('Error get settings:', err);
    res.status(500).json({ error: 'Gagal mengambil pengaturan perpustakaan.', details: err.message });
  }
});

// Simpan / Perbarui Pengaturan
app.put('/api/settings', async (req, res) => {
  try {
    const newSettings = req.body;
    if (!newSettings || typeof newSettings !== 'object') {
      return res.status(400).json({ error: 'Payload pengaturan tidak valid.' });
    }
    await saveAppSettings(newSettings);
    const updated = await getAppSettings();
    res.json({ success: true, message: 'Pengaturan perpustakaan berhasil disimpan!', settings: updated });
  } catch (err) {
    console.error('Error update settings:', err);
    res.status(500).json({ error: 'Gagal menyimpan pengaturan.', details: err.message });
  }
});

// Reset Pengaturan ke Standar Bawaan
app.post('/api/settings/reset', async (req, res) => {
  try {
    await saveAppSettings(DEFAULT_SETTINGS);
    res.json({ success: true, message: 'Pengaturan berhasil dikembalikan ke standar awal!', settings: DEFAULT_SETTINGS });
  } catch (err) {
    console.error('Error reset settings:', err);
    res.status(500).json({ error: 'Gagal mereset pengaturan.', details: err.message });
  }
});

// Toggle Cepat Status Mode Demo IoT
app.post('/api/settings/toggle-demo-mode', async (req, res) => {
  try {
    const settings = await getAppSettings();
    const current = settings.demo_mode_enabled === 'true';
    const nextState = req.body && req.body.enabled !== undefined ? Boolean(req.body.enabled) : !current;

    await saveAppSettings({ ...settings, demo_mode_enabled: String(nextState) });
    const updated = await getAppSettings();

    console.log(`🔘 [MODE DEMO] Status Mode Demo IoT diubah menjadi: ${nextState ? 'AKTIF (ON)' : 'NONAKTIF (OFF)'}`);

    res.json({
      success: true,
      demo_mode_enabled: nextState,
      message: nextState
        ? 'Mode Demo IoT AKTIF! Hanya buku peraga rak fisik miniatur yang ditampilkan di antarmuka.'
        : 'Mode Demo IoT NONAKTIF. Seluruh katalog koleksi buku perpustakaan kini ditampilkan.',
      settings: updated
    });
  } catch (err) {
    console.error('Error toggle demo mode:', err);
    res.status(500).json({ error: 'Gagal mengubah status Mode Demo.', details: err.message });
  }
});

// ==============================================================================
// 8. STATIC PAGE ROUTES
// ==============================================================================
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/kiosk', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'kiosk.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Jalankan Server
app.listen(PORT, () => {
  console.log(`\n=================================================================`);
  console.log(`🏛️  FINDLIB UNSIKA - Find Your Library (Sistem Rak Pintar IoT)`);
  console.log(`📡 Single Source of Truth: Neon PostgreSQL Cloud`);
  console.log(`-----------------------------------------------------------------`);
  console.log(`🌐 Portal Publik (Mahasiswa/Umum)  : http://localhost:${PORT}`);
  console.log(`📍 Kiosk On-Site (Di Perpustakaan) : http://localhost:${PORT}/kiosk`);
  console.log(`🔐 Login Admin                     : http://localhost:${PORT}/login`);
  console.log(`⚙️ Dashboard Admin                 : http://localhost:${PORT}/admin`);
  console.log(`=================================================================\n`);
});
