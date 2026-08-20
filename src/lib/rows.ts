/** Map DB rows (Date fields) to JSON-safe client types. */
import type { Chunk, GlossaryRow, Project, SubLine } from "./types";
import type * as schema from "@/db/schema";

const iso = (d: Date | string | null | undefined): string | null =>
  d == null ? null : d instanceof Date ? d.toISOString() : d;

export function toProject(p: typeof schema.projects.$inferSelect): Project {
  return {
    id: p.id,
    name: p.name,
    fileName: p.fileName,
    mimeType: p.mimeType,
    durationSec: p.durationSec,
    sizeBytes: p.sizeBytes,
    sourceLang: p.sourceLang,
    targetLang: p.targetLang,
    asrModel: p.asrModel,
    device: p.device,
    computeType: p.computeType,
    workers: p.workers,
    chunkSizeSec: p.chunkSizeSec,
    overlapSec: p.overlapSec,
    mode: p.mode,
    vadEnabled: p.vadEnabled,
    diarization: p.diarization,
    nonSpeechEvents: p.nonSpeechEvents,
    profanityMode: p.profanityMode,
    autoPunctuate: p.autoPunctuate,
    status: p.status as Project["status"],
    stage: p.stage,
    progress: p.progress,
    totalChunks: p.totalChunks,
    completedChunks: p.completedChunks,
    qualityScore: p.qualityScore,
    processingTimeSec: p.processingTimeSec,
    vadJson: p.vadJson,
    engineNote: p.engineNote,
    startedAt: iso(p.startedAt),
    createdAt: iso(p.createdAt) ?? new Date().toISOString(),
    updatedAt: iso(p.updatedAt) ?? new Date().toISOString(),
  };
}

export function toChunk(c: typeof schema.chunks.$inferSelect): Chunk {
  return {
    id: c.id,
    projectId: c.projectId,
    index: c.index,
    startSec: c.startSec,
    endSec: c.endSec,
    status: c.status as Chunk["status"],
    attempts: c.attempts,
    language: c.language,
    confidence: c.confidence,
    overlapRemoved: c.overlapRemoved,
    durationMs: c.durationMs,
  };
}

export function toSub(s: typeof schema.subtitles.$inferSelect): SubLine {
  return {
    id: s.id,
    seq: s.seq,
    startMs: s.startMs,
    endMs: s.endMs,
    speaker: s.speaker,
    original: s.original,
    translation: s.translation,
    confidence: s.confidence,
    kind: s.kind as SubLine["kind"],
  };
}

export function toGlossary(g: typeof schema.glossary.$inferSelect): GlossaryRow {
  return { id: g.id, term: g.term, translation: g.translation };
}
