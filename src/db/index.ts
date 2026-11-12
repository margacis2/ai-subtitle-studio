import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

const globalForDb = globalThis as typeof globalThis & {
  __sqliteDbInstance?: ReturnType<typeof drizzle>;
};

function getDbPath(): string {
  if (process.env.SQLITE_DB_PATH) {
    return process.env.SQLITE_DB_PATH;
  }
  // Store in LocalAppData on Windows, or user home directory
  const baseDir =
    process.env.LOCALAPPDATA ||
    process.env.APPDATA ||
    (process.platform === "darwin"
      ? path.join(process.env.HOME || ".", "Library", "Application Support")
      : path.join(process.env.HOME || ".", ".local", "share"));

  const studioDir = path.join(baseDir, "AI Subtitle Studio");
  if (!fs.existsSync(studioDir)) {
    fs.mkdirSync(studioDir, { recursive: true });
  }
  return path.join(studioDir, "studio.db");
}

function initDatabase() {
  const dbFile = getDbPath();
  const sqlite = new Database(dbFile);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  // Create tables if they do not exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'video/mp4',
      duration_sec REAL NOT NULL DEFAULT 0,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      source_lang TEXT NOT NULL DEFAULT 'auto',
      target_lang TEXT NOT NULL DEFAULT 'en',
      asr_model TEXT NOT NULL DEFAULT 'auto',
      device TEXT NOT NULL DEFAULT 'auto',
      compute_type TEXT NOT NULL DEFAULT 'auto',
      workers INTEGER NOT NULL DEFAULT 1,
      chunk_size_sec INTEGER NOT NULL DEFAULT 600,
      overlap_sec INTEGER NOT NULL DEFAULT 3,
      mode TEXT NOT NULL DEFAULT 'balanced',
      vad_enabled INTEGER NOT NULL DEFAULT 1,
      diarization INTEGER NOT NULL DEFAULT 0,
      non_speech_events INTEGER NOT NULL DEFAULT 0,
      profanity_mode TEXT NOT NULL DEFAULT 'preserve',
      auto_punctuate INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pending',
      stage TEXT NOT NULL DEFAULT 'idle',
      progress INTEGER NOT NULL DEFAULT 0,
      total_chunks INTEGER NOT NULL DEFAULT 0,
      completed_chunks INTEGER NOT NULL DEFAULT 0,
      quality_score INTEGER,
      processing_time_sec REAL,
      vad_json TEXT,
      engine_note TEXT,
      started_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      "index" INTEGER NOT NULL,
      start_sec REAL NOT NULL,
      end_sec REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'WAITING',
      attempts INTEGER NOT NULL DEFAULT 0,
      language TEXT,
      confidence REAL,
      overlap_removed INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS chunks_project_idx ON chunks(project_id);

    CREATE TABLE IF NOT EXISTS subtitles (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      start_ms INTEGER NOT NULL,
      end_ms INTEGER NOT NULL,
      speaker TEXT,
      original TEXT NOT NULL DEFAULT '',
      translation TEXT NOT NULL DEFAULT '',
      confidence REAL NOT NULL DEFAULT 0,
      kind TEXT NOT NULL DEFAULT 'speech',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS subtitles_project_idx ON subtitles(project_id, seq);

    CREATE TABLE IF NOT EXISTS glossary (
      id TEXT PRIMARY KEY,
      term TEXT NOT NULL,
      translation TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS batch_jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      duration_sec REAL NOT NULL DEFAULT 0,
      source_lang TEXT NOT NULL DEFAULT 'auto',
      target_lang TEXT NOT NULL DEFAULT 'en',
      asr_model TEXT NOT NULL DEFAULT 'small',
      status TEXT NOT NULL DEFAULT 'pending',
      progress INTEGER NOT NULL DEFAULT 0,
      error_msg TEXT,
      project_id TEXT,
      output_srt_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Safe schema migrations for existing databases
  try { sqlite.exec("ALTER TABLE projects ADD COLUMN asr_time_sec REAL;"); } catch {}
  try { sqlite.exec("ALTER TABLE projects ADD COLUMN translation_time_sec REAL;"); } catch {}
  try { sqlite.exec("ALTER TABLE projects ADD COLUMN translation_model TEXT DEFAULT 'nllb';"); } catch {}
  try { sqlite.exec("ALTER TABLE projects ADD COLUMN pause_before_translate INTEGER DEFAULT 1;"); } catch {}
  try { sqlite.exec("ALTER TABLE projects ADD COLUMN unload_asr_before_translate INTEGER DEFAULT 1;"); } catch {}

  return drizzle(sqlite, { schema });
}

export const db = globalForDb.__sqliteDbInstance ?? initDatabase();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__sqliteDbInstance = db;
}
