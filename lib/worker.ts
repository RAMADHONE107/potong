import { db, getJob } from "./db";
import { runPipeline } from "./pipeline";
import type { Job } from "./types";

const globalForWorker = globalThis as unknown as { __potongWorker?: boolean };

export function startWorker(): void {
  if (globalForWorker.__potongWorker) return;
  globalForWorker.__potongWorker = true;

  // Job yang sedang berjalan saat server mati tidak bisa dilanjutkan, jadi ulang dari awal.
  db.prepare(
    `UPDATE jobs SET status = 'queued', progress = 0
     WHERE status IN ('downloading', 'transcribing', 'cutting')`,
  ).run();

  let busy = false;

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const next = db
        .prepare("SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1")
        .get() as unknown as { id: string } | undefined;
      if (!next) return;

      const claimed = db
        .prepare("UPDATE jobs SET status = 'downloading', progress = 1 WHERE id = ? AND status = 'queued'")
        .run(next.id);
      if (Number(claimed.changes) !== 1) return;

      const job = getJob(next.id);
      if (job) await runPipeline(job as Job);
    } catch (error) {
      console.error("[potong] worker error", error);
    } finally {
      busy = false;
    }
  };

  setInterval(() => void tick(), 1500);
  void tick();
}
