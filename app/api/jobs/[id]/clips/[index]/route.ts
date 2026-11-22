import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getJob } from "@/lib/db";
import { jobDir } from "@/lib/pipeline";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; index: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Belum masuk." }, { status: 401 });
  const { id, index } = await params;
  const job = getJob(id);
  if (!job || job.user_id !== session.user.id) {
    return NextResponse.json({ error: "Pekerjaan tidak ditemukan." }, { status: 404 });
  }
  const clip = job.clips.find((item) => item.index === Number(index));
  if (!clip || !/^clip-\d+\.mp4$/.test(clip.file)) {
    return NextResponse.json({ error: "Klip tidak ditemukan." }, { status: 404 });
  }

  const wantsPoster = new URL(request.url).searchParams.get("poster") === "1";
  const fileName = wantsPoster ? clip.file.replace(/\.mp4$/, ".jpg") : clip.file;
  const filePath = path.join(jobDir(id), fileName);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Berkas belum siap." }, { status: 404 });
  }

  const body = fs.readFileSync(filePath);
  const extension = wantsPoster ? "jpg" : "mp4";
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": wantsPoster ? "image/jpeg" : "video/mp4",
      "Content-Disposition": `${wantsPoster ? "inline" : "attachment"}; filename="potong-${id}-${clip.index}.${extension}"`,
      "Content-Length": String(body.length),
    },
  });
}
