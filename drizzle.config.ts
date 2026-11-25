import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "drizzle-kit";

function resolveSqliteUrl(): string {
  if (process.env.SQLITE_DB_PATH) {
    const dir = path.dirname(process.env.SQLITE_DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return `file:${process.env.SQLITE_DB_PATH}`;
  }

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
  return `file:${path.join(studioDir, "studio.db")}`;
}

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: resolveSqliteUrl(),
  },
});
