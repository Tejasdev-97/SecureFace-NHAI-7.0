/**
 * DatabaseService.js
 * SQLite-backed local storage for SecureFace
 *
 * Tables:
 *   personnel     - Enrolled person records
 *   embeddings    - 128-float face embedding vectors
 *   attendance    - Attendance / auth event logs
 *   sync_log      - Sync status tracking per record
 *
 * All operations are OFFLINE-FIRST. No network calls here.
 */

import SQLite from 'react-native-sqlite-storage';

SQLite.enablePromise(true);

const DB_NAME = 'SecureFace.db';
const DB_VERSION = '1.0';
const DB_DISPLAY_NAME = 'SecureFace Local DB';
const DB_SIZE = 200000; // 200 KB initial pool

let db = null;

// ─── Schema DDL ──────────────────────────────────────────────────────────────
const CREATE_PERSONNEL_TABLE = `
  CREATE TABLE IF NOT EXISTS personnel (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    photo_uri   TEXT,
    synced      INTEGER DEFAULT 0
  );
`;

const CREATE_EMBEDDINGS_TABLE = `
  CREATE TABLE IF NOT EXISTS embeddings (
    id            TEXT PRIMARY KEY,
    personnel_id  TEXT NOT NULL,
    embedding     TEXT NOT NULL,
    captured_at   TEXT NOT NULL,
    FOREIGN KEY(personnel_id) REFERENCES personnel(id)
  );
`;

const CREATE_ATTENDANCE_TABLE = `
  CREATE TABLE IF NOT EXISTS attendance (
    id              TEXT PRIMARY KEY,
    personnel_id    TEXT,
    personnel_name  TEXT,
    timestamp       TEXT NOT NULL,
    confidence      REAL,
    status          TEXT NOT NULL,
    liveness_passed INTEGER DEFAULT 0,
    synced          INTEGER DEFAULT 0
  );
`;

const CREATE_SYNC_LOG_TABLE = `
  CREATE TABLE IF NOT EXISTS sync_log (
    id          TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id   TEXT NOT NULL,
    synced_at   TEXT,
    status      TEXT DEFAULT 'pending'
  );
`;

// ─── Service Object ───────────────────────────────────────────────────────────
export const DatabaseService = {
  /**
   * Initialize DB and run all CREATE TABLE IF NOT EXISTS migrations.
   * Called once on app start from App.js.
   */
  async initialize() {
    db = await SQLite.openDatabase(
      DB_NAME,
      DB_VERSION,
      DB_DISPLAY_NAME,
      DB_SIZE,
    );
    await db.executeSql(CREATE_PERSONNEL_TABLE);
    await db.executeSql(CREATE_EMBEDDINGS_TABLE);
    await db.executeSql(CREATE_ATTENDANCE_TABLE);
    await db.executeSql(CREATE_SYNC_LOG_TABLE);
    console.log('[DB] All tables ready');
    return db;
  },

  getDb() {
    if (!db) {
      throw new Error('Database not initialized. Call DatabaseService.initialize() first.');
    }
    return db;
  },

  // ─── Personnel CRUD ────────────────────────────────────────────────────────

  async insertPersonnel({id, name, photo_uri}) {
    const created_at = new Date().toISOString();
    await this.getDb().executeSql(
      'INSERT INTO personnel (id, name, created_at, photo_uri, synced) VALUES (?, ?, ?, ?, 0)',
      [id, name, created_at, photo_uri || null],
    );
    return {id, name, created_at, photo_uri};
  },

  async getPersonnelById(id) {
    const [results] = await this.getDb().executeSql(
      'SELECT * FROM personnel WHERE id = ?',
      [id],
    );
    if (results.rows.length === 0) {
      return null;
    }
    return results.rows.item(0);
  },

  async getAllPersonnel() {
    const [results] = await this.getDb().executeSql(
      'SELECT * FROM personnel ORDER BY created_at DESC',
    );
    const rows = [];
    for (let i = 0; i < results.rows.length; i++) {
      rows.push(results.rows.item(i));
    }
    return rows;
  },

  async deletePersonnel(id) {
    await this.getDb().executeSql('DELETE FROM embeddings WHERE personnel_id = ?', [id]);
    await this.getDb().executeSql('DELETE FROM personnel WHERE id = ?', [id]);
  },

  async personnelExists(id) {
    const [results] = await this.getDb().executeSql(
      'SELECT id FROM personnel WHERE id = ?',
      [id],
    );
    return results.rows.length > 0;
  },

  async getPersonnelCount() {
    const [results] = await this.getDb().executeSql(
      'SELECT COUNT(*) as count FROM personnel',
    );
    return results.rows.item(0).count;
  },

  // ─── Embeddings CRUD ───────────────────────────────────────────────────────

  /**
   * Store a face embedding as a JSON-stringified float array.
   * @param {string} personnel_id - The personnel ID this belongs to
   * @param {number[]} embedding  - Array of 128 floats
   */
  async insertEmbedding(personnel_id, embedding) {
    const id = `emb_${personnel_id}_${Date.now()}`;
    const captured_at = new Date().toISOString();
    const embeddingStr = JSON.stringify(embedding);
    await this.getDb().executeSql(
      'INSERT INTO embeddings (id, personnel_id, embedding, captured_at) VALUES (?, ?, ?, ?)',
      [id, personnel_id, embeddingStr, captured_at],
    );
    return id;
  },

  /**
   * Load all embeddings from DB as { personnel_id, embedding: number[] }[]
   * Used by FaceRecognitionModule for comparison.
   */
  async getAllEmbeddings() {
    const [results] = await this.getDb().executeSql(
      `SELECT e.id, e.personnel_id, e.embedding, p.name
       FROM embeddings e
       JOIN personnel p ON p.id = e.personnel_id
       ORDER BY e.captured_at DESC`,
    );
    const rows = [];
    for (let i = 0; i < results.rows.length; i++) {
      const row = results.rows.item(i);
      rows.push({
        id: row.id,
        personnel_id: row.personnel_id,
        name: row.name,
        embedding: JSON.parse(row.embedding),
      });
    }
    return rows;
  },

  async getEmbeddingsByPersonnel(personnel_id) {
    const [results] = await this.getDb().executeSql(
      'SELECT * FROM embeddings WHERE personnel_id = ?',
      [personnel_id],
    );
    const rows = [];
    for (let i = 0; i < results.rows.length; i++) {
      const row = results.rows.item(i);
      rows.push({...row, embedding: JSON.parse(row.embedding)});
    }
    return rows;
  },

  // ─── Attendance CRUD ───────────────────────────────────────────────────────

  async insertAttendance({
    id,
    personnel_id,
    personnel_name,
    confidence,
    status,
    liveness_passed,
  }) {
    const timestamp = new Date().toISOString();
    await this.getDb().executeSql(
      `INSERT INTO attendance
        (id, personnel_id, personnel_name, timestamp, confidence, status, liveness_passed, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        id,
        personnel_id || null,
        personnel_name || 'Unknown',
        timestamp,
        confidence || 0,
        status,
        liveness_passed ? 1 : 0,
      ],
    );
    return {id, timestamp};
  },

  async getAllAttendance(limit = 200) {
    const [results] = await this.getDb().executeSql(
      'SELECT * FROM attendance ORDER BY timestamp DESC LIMIT ?',
      [limit],
    );
    const rows = [];
    for (let i = 0; i < results.rows.length; i++) {
      rows.push(results.rows.item(i));
    }
    return rows;
  },

  async getAttendanceCount() {
    const [results] = await this.getDb().executeSql(
      'SELECT COUNT(*) as count FROM attendance',
    );
    return results.rows.item(0).count;
  },

  async getPendingSyncCount() {
    const [results] = await this.getDb().executeSql(
      'SELECT COUNT(*) as count FROM attendance WHERE synced = 0',
    );
    return results.rows.item(0).count;
  },

  async getUnsyncedAttendance() {
    const [results] = await this.getDb().executeSql(
      'SELECT * FROM attendance WHERE synced = 0 ORDER BY timestamp ASC',
    );
    const rows = [];
    for (let i = 0; i < results.rows.length; i++) {
      rows.push(results.rows.item(i));
    }
    return rows;
  },

  async markAttendanceSynced(ids) {
    if (!ids || ids.length === 0) {
      return;
    }
    const placeholders = ids.map(() => '?').join(',');
    await this.getDb().executeSql(
      `UPDATE attendance SET synced = 1 WHERE id IN (${placeholders})`,
      ids,
    );
  },

  async purgeLocalCache(retentionDays) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffStr = cutoff.toISOString();
    await this.getDb().executeSql(
      'DELETE FROM attendance WHERE synced = 1 AND timestamp < ?',
      [cutoffStr],
    );
    console.log(`[DB] Purged synced records older than ${retentionDays} days`);
  },

  // ─── Stats ────────────────────────────────────────────────────────────────

  async getDashboardStats() {
    const [[p], [a], [pending]] = await Promise.all([
      this.getDb().executeSql('SELECT COUNT(*) as count FROM personnel'),
      this.getDb().executeSql('SELECT COUNT(*) as count FROM attendance'),
      this.getDb().executeSql(
        'SELECT COUNT(*) as count FROM attendance WHERE synced = 0',
      ),
    ]);
    return {
      enrolledCount: p.rows.item(0).count,
      totalAttendance: a.rows.item(0).count,
      pendingSync: pending.rows.item(0).count,
    };
  },
};

export default DatabaseService;
