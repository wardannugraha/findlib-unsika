const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function updateDb() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // 1. Ensure categories exist
    await client.query(`
      INSERT INTO categories (id, name, color_hex, description) VALUES
      ('CAT-FIKSI', 'Fiksi & Sastra', '#22C55E', 'Koleksi novel, sastra, puisi, dan cerpen'),
      ('CAT-NONFIKSI', 'Teknologi & Sains', '#EAB308', 'Buku teknologi, IT, sains terapan, dan elektronika'),
      ('CAT-SKRIPSI', 'Skripsi & Tugas Akhir', '#3B82F6', 'Koleksi skripsi dan laporan tugas akhir mahasiswa'),
      ('CAT-SelfImprovment', 'Self Improvement & Psikologi', '#D4FF00', 'Buku motivasi, pengembangan diri, dan kepemimpinan'),
      ('CAT-SOSIAL', 'Ilmu Sosial & Hukum', '#A855F7', 'Buku hukum, sosiologi, politik, dan komunikasi'),
      ('CAT-REFERENSI', 'Referensi & Jurnal', '#F97316', 'Koleksi kamus, ensiklopedia, dan publikasi ilmiah')
      ON CONFLICT (id) DO UPDATE 
      SET name = EXCLUDED.name, color_hex = EXCLUDED.color_hex, description = EXCLUDED.description;
    `);

    // 2. Clear and recreate rack zones (6 blocks for 2 levels)
    await client.query('UPDATE books SET rack_id = NULL');
    await client.query('DELETE FROM racks');

    await client.query(`
      INSERT INTO racks (id, rack_name, level_number, led_start_index, led_end_index, category_id) VALUES
      ('RAK-T1-B1', 'Tingkat 1 - Blok Kiri (Slot 1-18)', 1, 1, 18, 'CAT-FIKSI'),
      ('RAK-T1-B2', 'Tingkat 1 - Blok Tengah (Slot 19-36)', 1, 19, 36, 'CAT-NONFIKSI'),
      ('RAK-T1-B3', 'Tingkat 1 - Blok Kanan (Slot 37-54)', 1, 37, 54, 'CAT-SKRIPSI'),
      ('RAK-T2-B1', 'Tingkat 2 - Blok Kiri (Slot 55-72)', 2, 55, 72, 'CAT-SelfImprovment'),
      ('RAK-T2-B2', 'Tingkat 2 - Blok Tengah (Slot 73-90)', 2, 73, 90, 'CAT-SOSIAL'),
      ('RAK-T2-B3', 'Tingkat 2 - Blok Kanan (Slot 91-108)', 2, 91, 108, 'CAT-REFERENSI');
    `);

    // 3. Assign existing books to the new rack zones with properly mapped slots
    // Fiksi -> RAK-T1-B1 (1-18)
    await client.query(`UPDATE books SET rack_id = 'RAK-T1-B1', led_slot = 3 WHERE id = 'BK-001'`);
    await client.query(`UPDATE books SET rack_id = 'RAK-T1-B1', led_slot = 1 WHERE id = 'BK-002'`);
    await client.query(`UPDATE books SET rack_id = 'RAK-T1-B1', led_slot = 7 WHERE id = 'BK-005'`);
    
    // Nonfiksi -> RAK-T1-B2 (19-36)
    await client.query(`UPDATE books SET rack_id = 'RAK-T1-B2', led_slot = 22 WHERE id = 'BK-003'`);
    await client.query(`UPDATE books SET rack_id = 'RAK-T1-B2', led_slot = 25 WHERE id = 'BK-004'`);

    // Skripsi -> RAK-T1-B3 (37-54)
    await client.query(`UPDATE books SET rack_id = 'RAK-T1-B3', led_slot = 42 WHERE id = 'TA-042'`);
    await client.query(`UPDATE books SET rack_id = 'RAK-T1-B3', led_slot = 45 WHERE id = 'TA-043'`);

    await client.query('COMMIT');
    console.log('✅ DATABASE RACK ZONES AND BOOKS SUCCESSFULLY UPDATED!');
  } catch(err) {
    await client.query('ROLLBACK');
    console.error('❌ DB UPDATE ERROR:', err);
  } finally {
    client.release();
    pool.end();
  }
}

updateDb();
