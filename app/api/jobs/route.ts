import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createJob, listJobs } from "@/lib/db";
import { jobDir } from "@/lib/pipeline";
import type { Campaign, SourceType } from "@/lib/types";

export const runtime = "nodejs";

const MAX_UPLOAD = 200 * 1024 * 1024;

function validPublicUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return !(
      host === "localhost" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.startsWith("127.") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("169.254.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.endsWith(".local")
    );
  } catch {
    return false;
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Belum masuk." }, { status: 401 });
  return NextResponse.json({ jobs: listJobs(session.user.id) });
}

function readCampaign(raw: unknown): Campaign {
  const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = (k: string, max = 120) => (typeof c[k] === "string" ? c[k].trim().slice(0, max) : "");
  return {
    name: pick("name", 80),
    audience: pick("audience", 120),
    tone: pick("tone", 40) || "Santai & tajam",
    goal: pick("goal", 40) || "Views",
    cta: pick("cta", 120),
    platform: pick("platform", 40) || "Semua",
  };
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Belum masuk." }, { status: 401 });

  const contentType = request.headers.get("content-type") ?? "";
  const id = randomUUID().slice(0, 8);
  let sourceType: SourceType;
  let source: string;
  let campaign: Campaign = readCampaign(null);

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Pilih file video dulu." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD) {
      return NextResponse.json({ error: "Ukuran file maksimal 200 MB." }, { status: 413 });
    }
    campaign = readCampaign(JSON.parse(String(form.get("campaign") || "{}")));
    const directory = jobDir(id);
    fs.mkdirSync(directory, { recursive: true });
    const target = path.join(directory, "source.mp4");
    fs.writeFileSync(target, Buffer.from(await file.arrayBuffer()));
    sourceType = "upload";
    source = file.name || "video-lokal.mp4";
  } else {
    let body: { source?: unknown; campaign?: unknown };
    try { body = (await request.json()) as { source?: unknown; campaign?: unknown }; }
    catch { return NextResponse.json({ error: "Format permintaan tidak dikenal." }, { status: 400 }); }
    const value = typeof body.source === "string" ? body.source.trim() : "";
    if (!validPublicUrl(value)) {
      return NextResponse.json({ error: "Masukkan alamat video http(s) yang valid." }, { status: 400 });
    }
    campaign = readCampaign(body.campaign);
    sourceType = "url";
    source = value;
  }

  const job = createJob({ id, userId: session.user.id, sourceType, source, campaign });
  return NextResponse.json({ id: job.id }, { status: 202 });
}
