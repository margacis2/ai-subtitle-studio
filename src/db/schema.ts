import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull().default("video/mp4"),
  durationSec: real("duration_sec").notNull().default(0),
  sizeBytes: integer("size_bytes").notNull().default(0),
  sourceLang: text("source_lang").notNull().default("auto"),
  targetLang: text("target_lang").notNull().default("en"),
  asrModel: text("asr_model").notNull().default("auto"),
  device: text("device").notNull().default("auto"),
  computeType: text("compute_type").notNull().default("auto"),
  workers: integer("workers").notNull().default(1),
  chunkSizeSec: integer("chunk_size_sec").notNull().default(600),
  overlapSec: integer("overlap_sec").notNull().default(3),
  mode: text("mode").notNull().default("balanced"),
  vadEnabled: boolean("vad_enabled").notNull().default(true),
  diarization: boolean("diarization").notNull().default(false),
  nonSpeechEvents: boolean("non_speech_events").notNull().default(false),
  profanityMode: text("profanity_mode").notNull().default("preserve"),
  autoPunctuate: boolean("auto_punctuate").notNull().default(true),
  status: text("status").notNull().default("pending"),
  stage: text("stage").notNull().default("idle"),
  progress: integer("progress").notNull().default(0),
  totalChunks: integer("total_chunks").notNull().default(0),
  completedChunks: integer("completed_chunks").notNull().default(0),
  qualityScore: integer("quality_score"),
  processingTimeSec: real("processing_time_sec"),
  vadJson: text("vad_json"),
  engineNote: text("engine_note"),
  startedAt: timestamp("started_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const chunks = pgTable(
  "chunks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    index: integer("index").notNull(),
    startSec: real("start_sec").notNull(),
    endSec: real("end_sec").notNull(),
    status: text("status").notNull().default("WAITING"),
    attempts: integer("attempts").notNull().default(0),
    language: text("language"),
    confidence: real("confidence"),
    overlapRemoved: integer("overlap_removed").notNull().default(0),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("chunks_project_idx").on(t.projectId)],
);

export const subtitles = pgTable(
  "subtitles",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    speaker: text("speaker"),
    original: text("original").notNull().default(""),
    translation: text("translation").notNull().default(""),
    confidence: real("confidence").notNull().default(0),
    kind: text("kind").notNull().default("speech"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("subtitles_project_idx").on(t.projectId, t.seq)],
);

export const glossary = pgTable("glossary", {
  id: text("id").primaryKey(),
  term: text("term").notNull(),
  translation: text("translation").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
