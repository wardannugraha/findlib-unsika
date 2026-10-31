const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🔄 Memulai penyesuaian tabel RACKS (Tabel BOOKS TIDAK disentuh sama sekali)...');

    // 1. Tambah kolom color_hex ke tabel racks jika belum ada
    await client.query(`
      ALTER TABLE racks ADD COLUMN IF NOT EXISTS color_hex VARCHAR(10);
    `);

    // 2. Pastikan category_id di tabel racks boleh bernilai NULL (tidak wajib terikat kategori)
    await client.query(`
      ALTER TABLE racks ALTER COLUMN category_id DROP NOT NULL;
    `);

    // 3. Masukkan / Update 6 Blok Fisik Rak dengan warna tema masing-masing
    // CATATAN: category_id diset NULL agar rak murni menjadi unit fisik independen
    const rackDefs = [
      { id: 'RAK-T1-B1', name: 'Tingkat 1 - Blok Kiri (Slot 1-18)', level: 1, start: 1, end: 18, color: '#22C55E' },
      { id: 'RAK-T1-B2', name: 'Tingkat 1 - Blok Tengah (Slot 19-36)', level: 1, start: 19, end: 36, color: '#EAB308' },
      { id: 'RAK-T1-B3', name: 'Tingkat 1 - Blok Kanan (Slot 37-54)', level: 1, start: 37, end: 54, color: '#3B82F6' },
      { id: 'RAK-T2-B1', name: 'Tingkat 2 - Blok Kiri (Slot 55-72)', level: 2, start: 55, end: 72, color: '#D4FF00' },
      { id: 'RAK-T2-B2', name: 'Tingkat 2 - Blok Tengah (Slot 73-90)', level: 2, start: 73, end: 90, color: '#A855F7' },
      { id: 'RAK-T2-B3', name: 'Tingkat 2 - Blok Kanan (Slot 91-108)', level: 2, start: 91, end: 108, color: '#F97316' }
    ];

    for (const r of rackDefs) {
      await client.query(`
        INSERT INTO racks (id, rack_name, level_number, led_start_index, led_end_index, color_hex, category_id)
        VALUES ($1, $2, $3, $4, $5, $6, NULL)
        ON CONFLICT (id) DO UPDATE SET
          rack_name = EXCLUDED.rack_name,
          level_number = EXCLUDED.level_number,
          led_start_index = EXCLUDED.led_start_index,
          led_end_index = EXCLUDED.led_end_index,
          color_hex = EXCLUDED.color_hex,
          category_id = NULL;
      `, [r.id, r.name, r.level, r.start, r.end, r.color]);
    }

    // PENTING: Tabel 'books' TIDAK disentuh / dimodifikasi / direset sedikitpun!

    await client.query('COMMIT');
    console.log('✅ SUKSES: Tabel racks berhasil diperbarui. Seluruh data buku tetap utuh 100%!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ GAGAL:', err);
  } finally {
    client.release();
    pool.end();
  }
}

migrate();
