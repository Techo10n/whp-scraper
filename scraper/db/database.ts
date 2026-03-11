import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'properties.db');

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS properties (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      source      TEXT NOT NULL,
      address     TEXT NOT NULL,
      price       TEXT,
      beds        TEXT,
      baths       TEXT,
      sqft        TEXT,
      listing_url TEXT UNIQUE NOT NULL,
      description TEXT,
      amenities   TEXT,
      phone       TEXT,
      key_facts   TEXT,
      location    TEXT,
      date_added  DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen   DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_listing_url ON properties(listing_url);
    CREATE INDEX IF NOT EXISTS idx_source ON properties(source);
    CREATE INDEX IF NOT EXISTS idx_date_added ON properties(date_added);
  `);
}

export interface PropertyRecord {
  id?: number;
  source: string;
  address: string;
  price?: string;
  beds?: string;
  baths?: string;
  sqft?: string;
  listing_url: string;
  description?: string;
  amenities?: string[];
  phone?: string;
  key_facts?: string[];
  location?: string;
  date_added?: string;
  last_seen?: string;
}

export interface UpsertResult {
  inserted: number;
  updated: number;
}

// Inline normalization — strips city/state/zip and lowercases so cross-scrape
// address matching works regardless of how the suffix was formatted.
function normalizeStreet(address: string): string {
  return address
    .toLowerCase()
    .replace(/,.*$/, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function upsertProperties(properties: PropertyRecord[]): UpsertResult {
  const db = getDb();
  const result: UpsertResult = { inserted: 0, updated: 0 };

  const checkByUrlStmt = db.prepare('SELECT id FROM properties WHERE listing_url = ?');

  // Secondary check: same source + same normalized street address → treat as repost
  const checkByAddrStmt = db.prepare(`
    SELECT listing_url FROM properties
    WHERE source = @source AND LOWER(address) LIKE @addressPattern
    LIMIT 1
  `);

  const insertStmt = db.prepare(`
    INSERT INTO properties (source, address, price, beds, baths, sqft, listing_url, description, amenities, phone, key_facts, location)
    VALUES (@source, @address, @price, @beds, @baths, @sqft, @listing_url, @description, @amenities, @phone, @key_facts, @location)
  `);
  const updateSeenByUrlStmt = db.prepare(`
    UPDATE properties SET last_seen = CURRENT_TIMESTAMP, price = @price WHERE listing_url = @listing_url
  `);

  const upsertMany = db.transaction((props: PropertyRecord[]) => {
    for (const prop of props) {
      // ── 1. Exact URL match (fast path) ───────────────────────────────
      const byUrl = checkByUrlStmt.get(prop.listing_url);
      if (byUrl) {
        updateSeenByUrlStmt.run({ price: prop.price ?? null, listing_url: prop.listing_url });
        result.updated++;
        continue;
      }

      // ── 2. Address match — catches reposts with a new URL ─────────────
      const street = normalizeStreet(prop.address);
      const canMatchByAddr = street && /\d/.test(street);
      const byAddr = canMatchByAddr
        ? checkByAddrStmt.get({
            source: prop.source,
            addressPattern: street.replace(/[%_]/g, '\\$&') + '%',
          }) as { listing_url: string } | undefined
        : undefined;

      if (byAddr) {
        // Same property reposted with a new URL — update the existing record
        updateSeenByUrlStmt.run({ price: prop.price ?? null, listing_url: byAddr.listing_url });
        result.updated++;
        continue;
      }

      // ── 3. Genuinely new listing ──────────────────────────────────────
      insertStmt.run({
        source: prop.source,
        address: prop.address,
        price: prop.price ?? null,
        beds: prop.beds ?? null,
        baths: prop.baths ?? null,
        sqft: prop.sqft ?? null,
        listing_url: prop.listing_url,
        description: prop.description ?? null,
        phone: prop.phone ?? null,
        location: prop.location ?? null,
        amenities: prop.amenities ? JSON.stringify(prop.amenities) : null,
        key_facts: prop.key_facts ? JSON.stringify(prop.key_facts) : null,
      });
      result.inserted++;
    }
  });

  upsertMany(properties);
  return result;
}

export function getAllProperties(options?: {
  source?: string;
  limit?: number;
  offset?: number;
}): PropertyRecord[] {
  const db = getDb();
  let query = 'SELECT * FROM properties';
  const params: any[] = [];

  if (options?.source) {
    query += ' WHERE source = ?';
    params.push(options.source);
  }
  query += ' ORDER BY date_added DESC';
  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
    if (options.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }
  }

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(row => ({
    ...row,
    amenities: row.amenities ? JSON.parse(row.amenities) : [],
    key_facts: row.key_facts ? JSON.parse(row.key_facts) : [],
  }));
}

export function getStats(): { total: number; bySource: Record<string, number>; newest: string | null } {
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) as count FROM properties').get() as any).count;
  const sourceCounts = db.prepare('SELECT source, COUNT(*) as count FROM properties GROUP BY source').all() as any[];
  const newest = (db.prepare('SELECT date_added FROM properties ORDER BY date_added DESC LIMIT 1').get() as any)?.date_added ?? null;
  const bySource: Record<string, number> = {};
  for (const row of sourceCounts) {
    bySource[row.source] = row.count;
  }
  return { total, bySource, newest };
}

export function deleteProperty(id: number): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM properties WHERE id = ?').run(id);
  return result.changes > 0;
}

// Returns properties missing at least one of beds/baths/sqft that have a
// parseable street address (starts with a digit — vague addresses are skipped)
export function getPropertiesMissingDetails(): PropertyRecord[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM properties
    WHERE (beds IS NULL OR baths IS NULL OR sqft IS NULL)
      AND address GLOB '[0-9]*'
    ORDER BY date_added DESC
  `).all() as any[];
  return rows.map(row => ({
    ...row,
    amenities: row.amenities ? JSON.parse(row.amenities) : [],
    key_facts: row.key_facts ? JSON.parse(row.key_facts) : [],
  }));
}

export function updatePropertyDetails(
  id: number,
  details: { beds?: string; baths?: string; sqft?: string },
): boolean {
  const db = getDb();
  const setParts: string[] = [];
  const params: Record<string, unknown> = { id };

  if (details.beds != null) { setParts.push('beds = @beds'); params.beds = details.beds; }
  if (details.baths != null) { setParts.push('baths = @baths'); params.baths = details.baths; }
  if (details.sqft != null) { setParts.push('sqft = @sqft'); params.sqft = details.sqft; }

  if (setParts.length === 0) return false;
  const result = db.prepare(`UPDATE properties SET ${setParts.join(', ')} WHERE id = @id`).run(params);
  return result.changes > 0;
}
