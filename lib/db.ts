import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { Campaign, Clip, Job, JobStatus, SourceType } from "./types";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

const globalForDb = globalThis as unknown as { __potongDb?: DatabaseSync };

function open(): DatabaseSync {
  const database = new DatabaseSync(path.join(dataDir, "potong.db"));
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      image TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      campaign TEXT NOT NULL DEFAULT '{}',
      clips TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS jobs_user_idx ON jobs(user_id, created_at DESC);
  `);
  const cols = database.prepare("PRAGMA table_info(jobs)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "campaign")) {
    database.exec("ALTER TABLE jobs ADD COLUMN campaign TEXT NOT NULL DEFAULT '{}'");
  }
  return database;
}

export const db = globalForDb.__potongDb ?? (globalForDb.__potongDb = open());

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
}

export function getUserByEmail(email: string): AuthUser | null {
  if (!email) return null;
  const row = db.prepare("SELECT id, email, name, image FROM users WHERE email = ? LIMIT 1").get(email) as AuthUser | undefined;
  return row ?? null;
}

export function upsertUser(user: AuthUser): AuthUser {
  const byEmail = getUserByEmail(user.email);
  if (byEmail) {
    db.prepare("UPDATE users SET name = ?, image = ? WHERE id = ?").run(user.name, user.image, byEmail.id);
    return { ...byEmail, name: user.name, image: user.image };
  }
  db.prepare(
    `INSERT INTO users (id, email, name, image, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, image = excluded.image`,
  ).run(user.id, user.email, user.name, user.image, Date.now());
  return user;
}

const defaultCampaign: Campaign = {
  name: "",
  audience: "",
  tone: "Santai & tajam",
  goal: "Views",
  cta: "",
  platform: "Semua",
};

interface JobRow {
  id: string;
  user_id: string;
  source_type: string;
  source: string;
  status: string;
  progress: number;
  error: string | null;
  campaign: string;
  clips: string;
  created_at: number;
}

function toJob(row: JobRow): Job {
  let clips: Clip[] = [];
  let campaign: Campaign = defaultCampaign;
  try { clips = JSON.parse(row.clips) as Clip[]; } catch { clips = []; }
  try { campaign = { ...defaultCampaign, ...(JSON.parse(row.campaign || "{}") as Partial<Campaign>) }; } catch { campaign = defaultCampaign; }
  clips = clips.map((c) => ({
    ...c,
    score: typeof c.score === "number" ? c.score : 0,
    hook: c.hook || c.title || "Momen menarik",
    captions: Array.isArray(c.captions) && c.captions.length ? c.captions : [{ style: "viral" as const, label: "Viral", text: c.caption || c.title || "" }],
    subtitleStyle: c.subtitleStyle || "karaoke",
  }));
  return {
    id: row.id,
    user_id: row.user_id,
    source_type: row.source_type as SourceType,
    source: row.source,
    status: row.status as JobStatus,
    progress: row.progress,
    error: row.error,
    campaign,
    clips,
    created_at: row.created_at,
  };
}

export function createJob(input: {
  id: string;
  userId: string;
  sourceType: SourceType;
  source: string;
  campaign: Campaign;
}): Job {
  db.prepare(
    `INSERT INTO jobs (id, user_id, source_type, source, status, progress, campaign, created_at)
     VALUES (?, ?, ?, ?, 'queued', 0, ?, ?)`,
  ).run(input.id, input.userId, input.sourceType, input.source, JSON.stringify(input.campaign), Date.now());
  return getJob(input.id)!;
}

export function getJob(id: string): Job | null {
  const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as
    | JobRow
    | undefined;
  return row ? toJob(row) : null;
}

export function listJobs(userId: string): Job[] {
  const rows = db
    .prepare("SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 30")
    .all(userId) as unknown as JobRow[];
  return rows.map(toJob);
}

export function updateJob(
  id: string,
  patch: Partial<Pick<Job, "status" | "progress" | "error" | "clips">>,
): void {
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  for (const key of ["status", "progress", "error", "clips"] as const) {
    if (patch[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(
        key === "clips" ? JSON.stringify(patch.clips) : (patch[key] as string | number | null),
      );
    }
  }
  if (fields.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE jobs SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}
