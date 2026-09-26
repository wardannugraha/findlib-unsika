// ==============================================================================
// 📚 FINDLIB UNSIKA - SERVER UTAMA (Node.js & Express)
// ==============================================================================
// FindLib UNSIKA (Find your Library) - Sistem Navigasi & Rak Pintar IoT
// ==============================================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mqtt = require('mqtt');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Path file database lokal (sebagai fallback jika offline)
const LOCAL_DB_PATH = path.join(__dirname, 'database', 'local_db.json');

// Kredensial Admin dari .env
const ADMIN_USER = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'adminunsika';

// ==============================================================================
// 1. KONEKSI & INISIALISASI DATABASE (Neon PostgreSQL Cloud)
// ==============================================================================
let pgPool = null;
let isPgConnected = false;

function readLocalDb() {
  try {
    const raw = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('❌ Gagal membaca local_db.json:', err);
    return { categories: [], racks: [], books: [] };
  }
}

function writeLocalDb(data) {
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('❌ Gagal menulis local_db.json:', err);
    return false;
  }
}
const saveLocalDb = writeLocalDb;

// ==============================================================================
// 1.1 APP SETTINGS HELPER (POSTGRESQL & LOCAL DB)
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

async function safePgQuery(query, params = []) {
  if (!isPgConnected || !pgPool) return null;
  try {
    const res = await pgPool.query(query, params);
    return res;
  } catch (err) {
    const errMsg = err.message || (err.errors && err.errors[0] ? err.errors[0].message : String(err));
    console.warn(`⚠️ [DATABASE CLOUD NOTICE] Query dialihkan ke mode lokal:`, errMsg);
    return null;
  }
}

async function getAppSettings() {
  const res = await safePgQuery('SELECT key, value FROM app_settings');
  if (res && res.rows) {
    const settings = { ...DEFAULT_SETTINGS };
    res.rows.forEach(r => {
      settings[r.key] = r.value;
    });
    return settings;
  }
  const localDb = readLocalDb();
  return { ...DEFAULT_SETTINGS, ...(localDb.settings || {}) };
}

async function saveAppSettings(newSettings) {
  if (isPgConnected && pgPool) {
    try {
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
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.warn('⚠️ Gagal simpan app_settings ke PG, menyimpan ke lokal JSON:', err.message);
    }
  }

  const localDb = readLocalDb();
  localDb.settings = { ...(localDb.settings || DEFAULT_SETTINGS), ...newSettings };
  return writeLocalDb(localDb);
}

async function initPostgresDatabase() {
  if (!process.env.DATABASE_URL) return;

  try {
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    pgPool.on('error', () => { });

    const client = await pgPool.connect();
    console.log('✅ [DATABASE] Sukses terhubung ke Neon PostgreSQL Cloud!');
    isPgConnected = true;

    // 1. Pastikan kolom is_demo dan prodi sudah ada di database Neon
    try {
      await client.query(`ALTER TABLE books ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT FALSE;`);
      await client.query(`ALTER TABLE books ADD COLUMN IF NOT EXISTS prodi VARCHAR(100);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_books_is_demo ON books(is_demo);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_books_prodi ON books(prodi);`);
      await client.query(`
        INSERT INTO app_settings (key, value, description)
        VALUES ('demo_mode_enabled', 'false', 'Status aktifasi Mode Demo IoT untuk rak miniatur peraga')
        ON CONFLICT (key) DO NOTHING;
      `);
    } catch (migPreErr) {
      console.warn('⚠️ [DATABASE] Pre-migration books info:', migPreErr.message);
    }

    // 2. Eksekusi skema database
    const schemaSqlPath = path.join(__dirname, 'database', 'schema.sql');
    if (fs.existsSync(schemaSqlPath)) {
      const schemaSql = fs.readFileSync(schemaSqlPath, 'utf-8');
      await client.query(schemaSql);
      console.log('✅ [DATABASE] Struktur tabel terverifikasi (categories, racks, books, study_programs).');
    }

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
    console.warn('⚠️ [DATABASE] Gagal konek ke Neon PostgreSQL. Menggunakan mode database lokal (JSON). Error:', error.message || error);
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

if (process.env.MQTT_USERNAME && process.env.MQTT_PASSWORD) {
  mqttOptions.username = process.env.MQTT_USERNAME;
  mqttOptions.password = process.env.MQTT_PASSWORD;
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
// 4. REST API ENDPOINTS
// ==============================================================================

// Info Status Sistem & Statistik Murni dari Database
app.get('/api/system-status', async (req, res) => {
  let totalTitles = 0;
  let totalCategories = 0;
  let totalStock = 0;
  let availableStock = 0;
  let borrowedCount = 0;
  let demoBooksCount = 0;
  let isDemoModeActive = false;

  try {
    const settings = await getAppSettings();
    isDemoModeActive = settings.demo_mode_enabled === 'true';

    const bRes = await safePgQuery(`
      SELECT 
        COUNT(*) as titles, 
        COALESCE(SUM(total_stock), 0) as total_stock, 
        COALESCE(SUM(available_stock), 0) as available_stock, 
        COALESCE(SUM(borrowed_count), 0) as borrowed_count,
        COUNT(CASE WHEN is_demo = TRUE THEN 1 END) as demo_books_count
      FROM books
    `);
    const cRes = bRes ? await safePgQuery('SELECT COUNT(*) FROM categories') : null;

    if (bRes && bRes.rows && bRes.rows.length > 0 && cRes && cRes.rows) {
      totalTitles = parseInt(bRes.rows[0].titles, 10) || 0;
      totalStock = parseInt(bRes.rows[0].total_stock, 10) || 0;
      availableStock = parseInt(bRes.rows[0].available_stock, 10) || 0;
      borrowedCount = parseInt(bRes.rows[0].borrowed_count, 10) || 0;
      demoBooksCount = parseInt(bRes.rows[0].demo_books_count, 10) || 0;
      totalCategories = parseInt(cRes.rows[0].count, 10) || 0;
    } else {
      const localDb = readLocalDb();
      totalTitles = localDb.books.length;
      totalCategories = localDb.categories.length;
      totalStock = localDb.books.reduce((acc, b) => acc + (parseInt(b.total_stock, 10) || 0), 0);
      availableStock = localDb.books.reduce((acc, b) => acc + (parseInt(b.available_stock, 10) || 0), 0);
      borrowedCount = localDb.books.reduce((acc, b) => acc + (parseInt(b.borrowed_count, 10) || 0), 0);
      demoBooksCount = localDb.books.filter(b => b.is_demo === true).length;
    }
  } catch (e) {
    console.error('Error stats query:', e.message);
  }

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
      mode: isPgConnected ? 'Neon PostgreSQL Cloud' : 'Local JSON Database',
      connected: isPgConnected
    },
    mqtt: {
      broker: MQTT_BROKER_URL,
      topic: MQTT_TOPIC,
      status: isMqttConnected ? 'CONNECTED' : 'DISCONNECTED / LOCAL SIMULATION'
    },
    config: {
      animationDuration: parseInt(process.env.LED_ANIMATION_DURATION || '15', 10)
    }
  });
});

// Ambil Kategori
app.get('/api/categories', async (req, res) => {
  try {
    const result = await safePgQuery('SELECT * FROM categories ORDER BY name ASC');
    if (result && result.rows) {
      return res.json(result.rows);
    }
    const localDb = readLocalDb();
    return res.json(localDb.categories);
  } catch (err) {
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

    if (isPgConnected && pgPool) {
      const result = await safePgQuery(`
        INSERT INTO categories (id, name, color_hex, description)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [id, name, color_hex, description || '']);
      if (result && result.rows && result.rows.length > 0) {
        return res.status(201).json({ success: true, category: result.rows[0] });
      }
    }

    const localDb = readLocalDb();
    const newCat = { id, name, color_hex, description: description || '' };
    localDb.categories.push(newCat);
    writeLocalDb(localDb);
    return res.status(201).json({ success: true, category: newCat });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menambah kategori', details: err.message });
  }
});

// ==============================================================================
// 2.1 PROGRAM STUDI (MASTER & AKTIF)
// ==============================================================================
// Ambil Daftar Program Studi (Master + Aktif yang ada di buku)
// Ambil Daftar Program Studi (Hanya dari yang tercatat pada koleksi buku)
app.get('/api/prodi', async (req, res) => {
  try {
    const activeRes = await safePgQuery("SELECT DISTINCT prodi FROM books WHERE prodi IS NOT NULL AND TRIM(prodi) != '' ORDER BY prodi ASC");

    if (activeRes && activeRes.rows) {
      const prodiList = activeRes.rows.map(r => r.prodi).filter(Boolean);
      return res.json(prodiList);
    }

    const localDb = readLocalDb();
    const activeSet = new Set();
    (localDb.books || []).forEach(b => {
      if (b.prodi && typeof b.prodi === 'string' && b.prodi.trim()) {
        activeSet.add(b.prodi.trim());
      }
    });
    const prodiList = Array.from(activeSet).sort((a, b) => a.localeCompare(b));
    return res.json(prodiList);
  } catch (err) {
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

    if (isPgConnected && pgPool) {
      await safePgQuery(`
        INSERT INTO study_programs (name)
        VALUES ($1)
        ON CONFLICT (name) DO NOTHING
      `, [cleanName]);
    }

    const localDb = readLocalDb();
    if (!localDb.study_programs) localDb.study_programs = [];
    const exists = localDb.study_programs.some(p => p.toLowerCase() === cleanName.toLowerCase());
    if (!exists) {
      localDb.study_programs.push(cleanName);
      localDb.study_programs.sort((a, b) => a.localeCompare(b));
      writeLocalDb(localDb);
    }
    return res.status(201).json({ success: true, name: cleanName });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menambah program studi', details: err.message });
  }
});

// Ambil Rak
app.get('/api/racks', async (req, res) => {
  try {
    const result = await safePgQuery(`
      SELECT r.*, c.name as category_name, c.color_hex
      FROM racks r
      LEFT JOIN categories c ON r.category_id = c.id
      ORDER BY r.level_number ASC
    `);

    if (result && result.rows) {
      return res.json(result.rows);
    }

    const localDb = readLocalDb();
    const racks = localDb.racks.map(rack => {
      const cat = localDb.categories.find(c => c.id === rack.category_id);
      return {
        ...rack,
        category_name: cat ? cat.name : 'Umum',
        color_hex: cat ? cat.color_hex : '#22C55E'
      };
    });
    return res.json(racks);
  } catch (err) {
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

    if (isPgConnected) {
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
      const result = await safePgQuery(query, params);
      if (result && result.rows) {
        return res.json(result.rows);
      }
    }

    const localDb = readLocalDb();
    let books = localDb.books.map(b => {
      const cat = localDb.categories.find(c => c.id === b.category_id);
      const rack = localDb.racks.find(r => r.id === b.rack_id);
      return {
        ...b,
        is_demo: b.is_demo === true,
        category_name: cat ? cat.name : 'Umum',
        color_hex: cat ? cat.color_hex : '#22C55E',
        rack_name: rack ? rack.rack_name : 'Rak A',
        level_number: rack ? rack.level_number : 1,
        led_start_index: rack ? rack.led_start_index : 1,
        led_end_index: rack ? rack.led_end_index : 4
      };
    });

    if (q) {
      const queryLower = q.toLowerCase();
      books = books.filter(b =>
        b.title.toLowerCase().includes(queryLower) ||
        b.author.toLowerCase().includes(queryLower) ||
        b.id.toLowerCase().includes(queryLower) ||
        (b.isbn && b.isbn.toLowerCase().includes(queryLower)) ||
        (b.prodi && b.prodi.toLowerCase().includes(queryLower))
      );
    }

    const nonSkripsiCats = catList.filter(c => !c.toLowerCase().includes('skripsi'));
    if (prodiList.length > 0) {
      if (nonSkripsiCats.length > 0) {
        books = books.filter(b => nonSkripsiCats.includes(b.category_id) || (b.prodi && prodiList.includes(b.prodi)));
      } else {
        books = books.filter(b => b.prodi && prodiList.includes(b.prodi));
      }
    } else if (catList.length > 0) {
      books = books.filter(b => catList.includes(b.category_id));
    }

    if (yFrom) {
      books = books.filter(b => b.publish_year && b.publish_year >= yFrom);
    }

    if (yTo) {
      books = books.filter(b => b.publish_year && b.publish_year <= yTo);
    }

    if (effectiveDemoFilter === 'demo') {
      books = books.filter(b => b.is_demo === true);
    } else if (effectiveDemoFilter === 'general') {
      books = books.filter(b => b.is_demo !== true);
    }

    return res.json(books);
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil data buku', details: err.message });
  }
});

// Ambil Detail 1 Buku
app.get('/api/books/:id', async (req, res) => {
  try {
    const bookId = req.params.id;
    let book = null;

    if (isPgConnected) {
      const result = await pgPool.query(`
        SELECT b.*, c.name as category_name, c.color_hex, 
               r.rack_name, r.level_number, r.led_start_index, r.led_end_index
        FROM books b
        LEFT JOIN categories c ON b.category_id = c.id
        LEFT JOIN racks r ON b.rack_id = r.id
        WHERE b.id = $1
      `, [bookId]);
      if (result.rows.length > 0) book = result.rows[0];
    } else {
      const localDb = readLocalDb();
      const found = localDb.books.find(b => b.id === bookId);
      if (found) {
        const cat = localDb.categories.find(c => c.id === found.category_id);
        const rack = localDb.racks.find(r => r.id === found.rack_id);
        book = {
          ...found,
          is_demo: found.is_demo === true,
          category_name: cat ? cat.name : 'Umum',
          color_hex: cat ? cat.color_hex : '#22C55E',
          rack_name: rack ? rack.rack_name : 'Rak A',
          level_number: rack ? rack.level_number : 1,
          led_start_index: rack ? rack.led_start_index : 1,
          led_end_index: rack ? rack.led_end_index : 4
        };
      }
    }

    if (!book) {
      return res.status(404).json({ error: 'Buku tidak ditemukan' });
    }
    return res.json(book);
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil detail buku', details: err.message });
  }
});

// Tambah Buku Baru
app.post('/api/books', async (req, res) => {
  try {
    const {
      id, isbn, title, author, publisher, publish_year,
      page_count, synopsis, category_id, prodi, rack_id, led_slot,
      is_demo, cover_url, total_stock, available_stock
    } = req.body;

    if (!id || !title || !author || !category_id || !rack_id || !led_slot) {
      return res.status(400).json({
        error: 'Mohon lengkapi data wajib: ID/Barcode, Judul, Penulis, Kategori, Rak, dan Titik LED.'
      });
    }

    const defaultCover = cover_url && cover_url.trim().length > 0
      ? cover_url.trim()
      : 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500&q=80';

    const stockTotal = parseInt(total_stock || 1, 10);
    const stockAvailable = available_stock !== undefined ? parseInt(available_stock, 10) : stockTotal;
    const stockBorrowed = stockTotal - stockAvailable;
    const bookStatus = stockAvailable > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK';
    const isDemoBool = is_demo === true || is_demo === 'true';
    const prodiVal = prodi && prodi.trim().length > 0 ? prodi.trim() : null;

    if (isPgConnected) {
      const result = await pgPool.query(`
        INSERT INTO books (
          id, isbn, title, author, publisher, publish_year, page_count,
          synopsis, category_id, prodi, rack_id, led_slot, is_demo, cover_url,
          total_stock, available_stock, borrowed_count, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING *
      `, [
        id, isbn || null, title, author, publisher || null,
        publish_year ? parseInt(publish_year, 10) : null,
        page_count ? parseInt(page_count, 10) : null,
        synopsis || '', category_id, prodiVal, rack_id, parseInt(led_slot, 10),
        isDemoBool, defaultCover, stockTotal, stockAvailable, stockBorrowed, bookStatus
      ]);
      return res.status(201).json({ success: true, book: result.rows[0] });
    } else {
      const localDb = readLocalDb();
      if (localDb.books.some(b => b.id === id)) {
        return res.status(400).json({ error: `Buku dengan Kode [${id}] sudah ada!` });
      }

      const newBook = {
        id,
        isbn: isbn || '',
        title,
        author,
        publisher: publisher || '',
        publish_year: publish_year ? parseInt(publish_year, 10) : null,
        page_count: page_count ? parseInt(page_count, 10) : null,
        synopsis: synopsis || '',
        category_id,
        prodi: prodiVal,
        rack_id,
        led_slot: parseInt(led_slot, 10),
        is_demo: isDemoBool,
        cover_url: defaultCover,
        total_stock: stockTotal,
        available_stock: stockAvailable,
        borrowed_count: stockBorrowed,
        status: bookStatus
      };

      localDb.books.push(newBook);
      writeLocalDb(localDb);
      return res.status(201).json({ success: true, book: newBook });
    }
  } catch (err) {
    console.error('Error tambah buku:', err);
    res.status(500).json({ error: 'Gagal menambah buku', details: err.message });
  }
});

// Edit Buku
app.put('/api/books/:id', async (req, res) => {
  try {
    const bookId = req.params.id;
    const {
      isbn, title, author, publisher, publish_year,
      page_count, synopsis, category_id, prodi, rack_id, led_slot,
      is_demo, cover_url, total_stock, available_stock
    } = req.body;

    const defaultCover = cover_url && cover_url.trim().length > 0
      ? cover_url.trim()
      : 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500&q=80';

    const stockTotal = parseInt(total_stock || 1, 10);
    const stockAvailable = available_stock !== undefined ? parseInt(available_stock, 10) : stockTotal;
    const stockBorrowed = Math.max(0, stockTotal - stockAvailable);
    const bookStatus = stockAvailable > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK';
    const isDemoBool = is_demo === true || is_demo === 'true';
    const prodiVal = prodi && prodi.trim().length > 0 ? prodi.trim() : null;

    if (isPgConnected) {
      const result = await pgPool.query(`
        UPDATE books SET
          isbn = $1, title = $2, author = $3, publisher = $4,
          publish_year = $5, page_count = $6, synopsis = $7,
          category_id = $8, prodi = $9, rack_id = $10, led_slot = $11,
          is_demo = $12, cover_url = $13, total_stock = $14, available_stock = $15,
          borrowed_count = $16, status = $17, updated_at = CURRENT_TIMESTAMP
        WHERE id = $18
        RETURNING *
      `, [
        isbn || null, title, author, publisher || null,
        publish_year ? parseInt(publish_year, 10) : null,
        page_count ? parseInt(page_count, 10) : null,
        synopsis || '', category_id, prodiVal, rack_id, parseInt(led_slot, 10),
        isDemoBool, defaultCover, stockTotal, stockAvailable, stockBorrowed, bookStatus,
        bookId
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Buku tidak ditemukan' });
      }
      return res.json({ success: true, book: result.rows[0] });
    } else {
      const localDb = readLocalDb();
      const index = localDb.books.findIndex(b => b.id === bookId);
      if (index === -1) {
        return res.status(404).json({ error: 'Buku tidak ditemukan' });
      }

      localDb.books[index] = {
        ...localDb.books[index],
        isbn: isbn || localDb.books[index].isbn,
        title: title || localDb.books[index].title,
        author: author || localDb.books[index].author,
        publisher: publisher || localDb.books[index].publisher,
        publish_year: publish_year ? parseInt(publish_year, 10) : localDb.books[index].publish_year,
        page_count: page_count ? parseInt(page_count, 10) : localDb.books[index].page_count,
        synopsis: synopsis !== undefined ? synopsis : localDb.books[index].synopsis,
        category_id: category_id || localDb.books[index].category_id,
        prodi: prodiVal,
        rack_id: rack_id || localDb.books[index].rack_id,
        led_slot: led_slot ? parseInt(led_slot, 10) : localDb.books[index].led_slot,
        is_demo: is_demo !== undefined ? isDemoBool : localDb.books[index].is_demo,
        cover_url: defaultCover,
        total_stock: stockTotal,
        available_stock: stockAvailable,
        borrowed_count: stockBorrowed,
        status: bookStatus
      };

      writeLocalDb(localDb);
      return res.json({ success: true, book: localDb.books[index] });
    }
  } catch (err) {
    console.error('Error edit buku:', err);
    res.status(500).json({ error: 'Gagal mengupdate buku', details: err.message });
  }
});

// Hapus Buku
app.delete('/api/books/:id', async (req, res) => {
  try {
    const bookId = req.params.id;
    if (isPgConnected) {
      const result = await pgPool.query('DELETE FROM books WHERE id = $1 RETURNING *', [bookId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Buku tidak ditemukan' });
      }
      return res.json({ success: true, message: `Buku [${bookId}] berhasil dihapus.` });
    } else {
      const localDb = readLocalDb();
      const initialLen = localDb.books.length;
      localDb.books = localDb.books.filter(b => b.id !== bookId);
      if (localDb.books.length === initialLen) {
        return res.status(404).json({ error: 'Buku tidak ditemukan' });
      }
      writeLocalDb(localDb);
      return res.json({ success: true, message: `Buku [${bookId}] berhasil dihapus.` });
    }
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus buku', details: err.message });
  }
});

// Trigger Sinyal Lampu Rak LED
app.post('/api/locate/:id', async (req, res) => {
  try {
    const bookId = req.params.id;
    let book = null;

    if (isPgConnected) {
      const result = await pgPool.query(`
        SELECT b.*, c.name as category_name, c.color_hex, 
               r.rack_name, r.level_number, r.led_start_index, r.led_end_index
        FROM books b
        LEFT JOIN categories c ON b.category_id = c.id
        LEFT JOIN racks r ON b.rack_id = r.id
        WHERE b.id = $1
      `, [bookId]);
      if (result.rows.length > 0) book = result.rows[0];
    } else {
      const localDb = readLocalDb();
      const found = localDb.books.find(b => b.id === bookId);
      if (found) {
        const cat = localDb.categories.find(c => c.id === found.category_id);
        const rack = localDb.racks.find(r => r.id === found.rack_id);
        book = {
          ...found,
          category_name: cat ? cat.name : 'Umum',
          color_hex: cat ? cat.color_hex : '#22C55E',
          rack_name: rack ? rack.rack_name : 'Rak Utama',
          level_number: rack ? rack.level_number : 1,
          led_start_index: rack ? rack.led_start_index : 1,
          led_end_index: rack ? rack.led_end_index : 4
        };
      }
    }

    if (!book) {
      return res.status(404).json({ error: `Buku [${bookId}] tidak ditemukan.` });
    }

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
    if (isPgConnected) {
      let query = 'SELECT * FROM members';
      let params = [];
      if (q) {
        query += ' WHERE nim ILIKE $1 OR name ILIKE $1 OR prodi ILIKE $1';
        params.push(`%${q}%`);
      }
      query += ' ORDER BY name ASC';
      const result = await pgPool.query(query, params);
      return res.json(result.rows);
    } else {
      const localDb = readLocalDb();
      let list = localDb.members || [];
      if (q) {
        const queryLower = q.toLowerCase();
        list = list.filter(m =>
          m.nim.toLowerCase().includes(queryLower) ||
          m.name.toLowerCase().includes(queryLower) ||
          m.prodi.toLowerCase().includes(queryLower)
        );
      }
      return res.json(list);
    }
  } catch (err) {
    console.error('Error get members:', err);
    res.status(500).json({ error: 'Gagal mengambil data mahasiswa.' });
  }
});

// Ambil Mahasiswa Spesifik berdasarkan NIM (Untuk Smart Auto-Fill)
app.get('/api/members/:nim', async (req, res) => {
  const { nim } = req.params;

  try {
    if (isPgConnected) {
      const result = await pgPool.query('SELECT * FROM members WHERE nim = $1', [nim]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Mahasiswa belum terdaftar.' });
      }
      return res.json(result.rows[0]);
    } else {
      const localDb = readLocalDb();
      const member = (localDb.members || []).find(m => m.nim === nim);
      if (!member) {
        return res.status(404).json({ error: 'Mahasiswa belum terdaftar.' });
      }
      return res.json(member);
    }
  } catch (err) {
    console.error('Error get member by nim:', err);
    res.status(500).json({ error: 'Gagal mencari mahasiswa.' });
  }
});

// Tambah / Simpan Data Mahasiswa
app.post('/api/members', async (req, res) => {
  const { nim, name, prodi, phone } = req.body;

  if (!nim || !name || !prodi || !phone) {
    return res.status(400).json({ error: 'Field NIM, Nama, Prodi, dan No. HP wajib diisi!' });
  }

  try {
    if (isPgConnected) {
      await pgPool.query(`
        INSERT INTO members (nim, name, prodi, phone)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (nim) DO UPDATE 
        SET name = EXCLUDED.name, prodi = EXCLUDED.prodi, phone = EXCLUDED.phone
      `, [nim, name, prodi, phone]);
      return res.json({ success: true, message: 'Data mahasiswa berhasil disimpan!' });
    } else {
      const localDb = readLocalDb();
      if (!localDb.members) localDb.members = [];
      const idx = localDb.members.findIndex(m => m.nim === nim);
      if (idx !== -1) {
        localDb.members[idx] = { nim, name, prodi, phone };
      } else {
        localDb.members.push({ nim, name, prodi, phone });
      }
      saveLocalDb(localDb);
      return res.json({ success: true, message: 'Data mahasiswa berhasil disimpan (Lokal)!' });
    }
  } catch (err) {
    console.error('Error save member:', err);
    res.status(500).json({ error: 'Gagal menyimpan data mahasiswa.' });
  }
});

// Hapus Data Mahasiswa
app.delete('/api/members/:nim', async (req, res) => {
  const { nim } = req.params;

  try {
    if (isPgConnected) {
      await pgPool.query('DELETE FROM members WHERE nim = $1', [nim]);
      return res.json({ success: true, message: 'Data mahasiswa berhasil dihapus.' });
    } else {
      const localDb = readLocalDb();
      if (localDb.members) {
        localDb.members = localDb.members.filter(m => m.nim !== nim);
        saveLocalDb(localDb);
      }
      return res.json({ success: true, message: 'Data mahasiswa berhasil dihapus (Lokal).' });
    }
  } catch (err) {
    console.error('Error delete member:', err);
    res.status(500).json({ error: 'Gagal menghapus mahasiswa.' });
  }
});

// ==============================================================================
// 6. REST API: PEMINJAMAN BUKU (LOANS)
// ==============================================================================

// Ambil Daftar Peminjaman (dengan kalkulasi keterlambatan & join info buku + mahasiswa)
app.get('/api/loans', async (req, res) => {
  const { status, q } = req.query;

  try {
    if (isPgConnected) {
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

      const result = await safePgQuery(query, params);
      if (result && result.rows) {
        return res.json(result.rows);
      }
      // Fallback to local DB if safePgQuery returns null
      const localDb = readLocalDb();
      const todayStr = new Date().toISOString().split('T')[0];
      const today = new Date(todayStr);

      let list = (localDb.loans || []).map(l => {
        const member = (localDb.members || []).find(m => m.nim === l.member_nim) || {};
        const book = (localDb.books || []).find(b => b.id === l.book_id) || {};
        const rack = (localDb.racks || []).find(r => r.id === book.rack_id) || {};

        const dueDate = new Date(l.due_date);
        const isOverdue = !l.return_date && today > dueDate;
        const diffTime = today - dueDate;
        const daysOverdue = isOverdue ? Math.ceil(diffTime / (1000 * 60 * 60 * 24)) : 0;

        let calcStatus = 'BORROWED';
        if (l.return_date) calcStatus = 'RETURNED';
        else if (isOverdue) calcStatus = 'OVERDUE';
        else if ((l.extension_count || 0) > 0) calcStatus = 'EXTENDED';

        return {
          ...l,
          member_name: member.name || 'Mahasiswa',
          member_prodi: member.prodi || '-',
          member_phone: member.phone || '-',
          book_title: book.title || 'Buku Perpustakaan',
          book_cover: book.cover_url || '',
          rack_name: rack.rack_name || 'Rak Utama',
          level_number: rack.level_number || 1,
          led_slot: book.led_slot || 1,
          calculated_status: calcStatus,
          days_overdue: daysOverdue
        };
      });

      if (status === 'ACTIVE') {
        list = list.filter(l => !l.return_date);
      } else if (status === 'OVERDUE') {
        list = list.filter(l => l.calculated_status === 'OVERDUE');
      } else if (status === 'RETURNED') {
        list = list.filter(l => l.return_date);
      }

      if (q) {
        const qLower = q.toLowerCase();
        list = list.filter(l =>
          l.member_name.toLowerCase().includes(qLower) ||
          l.member_nim.toLowerCase().includes(qLower) ||
          l.book_title.toLowerCase().includes(qLower) ||
          l.id.toLowerCase().includes(qLower)
        );
      }

      return res.json(list);
    }
  } catch (err) {
    console.error('Error get loans:', err);
    res.status(500).json({ error: 'Gagal mengambil data peminjaman.' });
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

    if (isPgConnected) {
      // 1. Cek batas maksimal peminjaman aktif per mahasiswa
      const activeLoansRes = await pgPool.query(`
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
        await pgPool.query(`
          INSERT INTO members (nim, name, prodi, phone)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (nim) DO UPDATE 
          SET name = EXCLUDED.name, prodi = EXCLUDED.prodi, phone = EXCLUDED.phone
        `, [member_nim, member_name, member_prodi, member_phone]);
      }

      // 3. Cek ketersediaan stok buku
      const bookRes = await pgPool.query('SELECT available_stock, title FROM books WHERE id = $1', [book_id]);
      if (bookRes.rows.length === 0) {
        return res.status(404).json({ error: 'Buku tidak ditemukan.' });
      }
      if ((bookRes.rows[0].available_stock || 0) <= 0) {
        return res.status(400).json({ error: `Buku "${bookRes.rows[0].title}" sedang habis dipinjam!` });
      }

      // 4. Buat transaksi peminjaman (Batas dinamis sesuai settings)
      const insertRes = await pgPool.query(`
        INSERT INTO loans (id, member_nim, book_id, borrow_date, due_date, status, notes)
        VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_DATE + ($5 || ' days')::INTERVAL, 'BORROWED', $4)
        RETURNING id, member_nim, book_id, TO_CHAR(borrow_date, 'YYYY-MM-DD') AS borrow_date, TO_CHAR(due_date, 'YYYY-MM-DD') AS due_date, status, notes
      `, [loanId, member_nim, book_id, notes || 'Peminjaman Mahasiswa', loanDays]);

      const loanRow = insertRes.rows[0];

      // 5. Kurangi stok buku
      await pgPool.query(`
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
    } else {
      const localDb = readLocalDb();
      if (!localDb.members) localDb.members = [];
      if (!localDb.loans) localDb.loans = [];

      // Cek batas maksimal buku aktif
      const activeCount = localDb.loans.filter(l => l.member_nim === member_nim && !l.return_date).length;
      if (activeCount >= maxBooks) {
        return res.status(400).json({
          error: `Mahasiswa dengan NIM ${member_nim} telah mencapai batas peminjaman maksimal (${maxBooks} buku aktif).`
        });
      }

      // Auto-register member
      if (member_name) {
        const mIdx = localDb.members.findIndex(m => m.nim === member_nim);
        if (mIdx !== -1) {
          localDb.members[mIdx] = { nim: member_nim, name: member_name, prodi: member_prodi, phone: member_phone };
        } else {
          localDb.members.push({ nim: member_nim, name: member_name, prodi: member_prodi, phone: member_phone });
        }
      }

      // Cek stok buku
      const book = (localDb.books || []).find(b => b.id === book_id);
      if (!book) return res.status(404).json({ error: 'Buku tidak ditemukan.' });
      if ((book.available_stock || 0) <= 0) {
        return res.status(400).json({ error: `Buku "${book.title}" sedang habis!` });
      }

      const today = new Date();
      const due = new Date();
      due.setDate(today.getDate() + loanDays);

      const newLoan = {
        id: loanId,
        member_nim,
        book_id,
        borrow_date: today.toISOString().split('T')[0],
        due_date: due.toISOString().split('T')[0],
        return_date: null,
        extension_count: 0,
        status: 'BORROWED',
        notes: notes || ''
      };

      localDb.loans.push(newLoan);

      // Update stok
      book.available_stock = Math.max(0, (book.available_stock || 1) - 1);
      book.borrowed_count = (book.borrowed_count || 0) + 1;

      saveLocalDb(localDb);
      return res.json({
        success: true,
        message: 'Transaksi peminjaman berhasil (Lokal)!',
        data: {
          loan_id: loanId,
          member_nim: member_nim,
          member_name: member_name || member_nim,
          member_prodi: member_prodi || '',
          book_id: book_id,
          book_title: book.title,
          borrow_date: newLoan.borrow_date,
          due_date: newLoan.due_date,
          loan_days: loanDays,
          status: 'BORROWED'
        }
      });
    }
  } catch (err) {
    console.error('Error create loan:', err);
    res.status(500).json({ error: 'Gagal membuat transaksi peminjaman.' });
  }
});

// Perpanjang Masa Peminjaman (Dinamis sesuai Settings)
app.post('/api/loans/:id/extend', async (req, res) => {
  const { id } = req.params;

  try {
    const settings = await getAppSettings();
    const extensionDays = parseInt(settings.extension_days || '7', 10);
    const maxExtension = parseInt(settings.max_extension_count || '1', 10);

    if (isPgConnected) {
      const loanRes = await pgPool.query(`
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
      const updateRes = await pgPool.query(`
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
    } else {
      const localDb = readLocalDb();
      const loan = (localDb.loans || []).find(l => l.id === id);
      if (!loan) return res.status(404).json({ error: 'Peminjaman tidak ditemukan.' });
      if (loan.return_date) return res.status(400).json({ error: 'Buku sudah dikembalikan.' });
      if ((loan.extension_count || 0) >= maxExtension) {
        return res.status(400).json({ error: `Maksimal perpanjangan ${maxExtension} kali.` });
      }

      const currentDue = new Date(loan.due_date);
      currentDue.setDate(currentDue.getDate() + extensionDays);
      loan.due_date = currentDue.toISOString().split('T')[0];
      loan.extension_count = (loan.extension_count || 0) + 1;
      loan.status = 'EXTENDED';

      const book = (localDb.books || []).find(b => b.id === loan.book_id);
      const member = (localDb.members || []).find(m => m.nim === loan.member_nim);

      saveLocalDb(localDb);
      return res.json({
        success: true,
        message: `Peminjaman berhasil diperpanjang ${extensionDays} hari (Lokal)!`,
        data: {
          loan_id: id,
          book_title: book ? book.title : '',
          member_name: member ? member.name : loan.member_nim,
          extension_days: extensionDays,
          due_date: loan.due_date
        }
      });
    }
  } catch (err) {
    console.error('Error extend loan:', err);
    res.status(500).json({ error: 'Gagal memperpanjang peminjaman.' });
  }
});

// Pengembalian Buku (Return Book & Kembalikan Stok)
app.post('/api/loans/:id/return', async (req, res) => {
  const { id } = req.params;

  try {
    if (isPgConnected) {
      const loanRes = await pgPool.query('SELECT * FROM loans WHERE id = $1', [id]);
      if (loanRes.rows.length === 0) {
        return res.status(404).json({ error: 'Peminjaman tidak ditemukan.' });
      }

      const loan = loanRes.rows[0];
      if (loan.return_date) {
        return res.status(400).json({ error: 'Buku ini sudah tercatat telah dikembalikan.' });
      }

      // 1. Update status peminjaman menjadi RETURNED
      await pgPool.query(`
        UPDATE loans 
        SET return_date = CURRENT_DATE,
            status = 'RETURNED'
        WHERE id = $1
      `, [id]);

      // 2. Kembalikan stok buku
      await pgPool.query(`
        UPDATE books 
        SET available_stock = available_stock + 1,
            borrowed_count = GREATEST(0, borrowed_count - 1)
        WHERE id = $1
      `, [loan.book_id]);

      return res.json({ success: true, message: 'Buku berhasil dikembalikan! Stok rak telah diperbarui.' });
    } else {
      const localDb = readLocalDb();
      const loan = (localDb.loans || []).find(l => l.id === id);
      if (!loan) return res.status(404).json({ error: 'Peminjaman tidak ditemukan.' });
      if (loan.return_date) return res.status(400).json({ error: 'Buku sudah dikembalikan.' });

      loan.return_date = new Date().toISOString().split('T')[0];
      loan.status = 'RETURNED';

      const book = (localDb.books || []).find(b => b.id === loan.book_id);
      if (book) {
        book.available_stock = (book.available_stock || 0) + 1;
        book.borrowed_count = Math.max(0, (book.borrowed_count || 1) - 1);
      }

      saveLocalDb(localDb);
      return res.json({ success: true, message: 'Buku berhasil dikembalikan (Lokal)!' });
    }
  } catch (err) {
    console.error('Error return book:', err);
    res.status(500).json({ error: 'Gagal memproses pengembalian buku.' });
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
    res.status(500).json({ error: 'Gagal mengambil pengaturan perpustakaan.' });
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
    res.status(500).json({ error: 'Gagal menyimpan pengaturan.' });
  }
});

// Reset Pengaturan ke Standar Bawaan
app.post('/api/settings/reset', async (req, res) => {
  try {
    await saveAppSettings(DEFAULT_SETTINGS);
    res.json({ success: true, message: 'Pengaturan berhasil dikembalikan ke standar awal!', settings: DEFAULT_SETTINGS });
  } catch (err) {
    console.error('Error reset settings:', err);
    res.status(500).json({ error: 'Gagal mereset pengaturan.' });
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
    res.status(500).json({ error: 'Gagal mengubah status Mode Demo.' });
  }
});
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
  console.log(`-----------------------------------------------------------------`);
  console.log(`🌐 Portal Publik (Mahasiswa/Umum)  : http://localhost:${PORT}`);
  console.log(`📍 Kiosk On-Site (Di Perpustakaan) : http://localhost:${PORT}/kiosk`);
  console.log(`🔐 Login Admin                     : http://localhost:${PORT}/login`);
  console.log(`⚙️ Dashboard Admin                 : http://localhost:${PORT}/admin`);
  console.log(`=================================================================\n`);
});
