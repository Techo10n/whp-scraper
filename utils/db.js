import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: 5432,
  ssl: { rejectUnauthorized: false } // only if connecting over public internet
});

export async function insertListingIfNew({ title, price, location, url }) {
  const check = await pool.query('SELECT id FROM properties WHERE url = $1', [url]);
  if (check.rowCount === 0) {
    await pool.query(
      'INSERT INTO properties (title, price, location, url) VALUES ($1, $2, $3, $4)',
      [title, price, location, url]
    );
    console.log(`Inserted: ${title}`);
  } else {
    console.log(`Already exists: ${url}`);
  }
}