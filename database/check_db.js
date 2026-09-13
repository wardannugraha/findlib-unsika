const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  try {
    const client = await pool.connect();
    console.log('--- CONNECTED TO NEON ---');

    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('TABLES:', tables.rows);

    const cols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'books'
    `);
    console.log('COLUMNS IN books:', cols.rows);

    const books = await client.query('SELECT * FROM books');
    console.log('BOOKS COUNT:', books.rows.length);
    console.log('BOOKS SAMPLE:', books.rows);

    const categories = await client.query('SELECT * FROM categories');
    console.log('CATEGORIES COUNT:', categories.rows.length);
    console.log('CATEGORIES SAMPLE:', categories.rows);

    const racks = await client.query('SELECT * FROM racks');
    console.log('RACKS COUNT:', racks.rows.length);
    console.log('RACKS SAMPLE:', racks.rows);

    client.release();
    pool.end();
  } catch (err) {
    console.error('ERROR CHECKING DB:', err);
    pool.end();
  }
}

check();
