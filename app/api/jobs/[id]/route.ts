import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getJob } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Belum masuk." }, { status: 401 });
  const { id } = await params;
  const job = getJob(id);
  if (!job || job.user_id !== session.user.id) {
    return NextResponse.json({ error: "Pekerjaan tidak ditemukan." }, { status: 404 });
  }
  return NextResponse.json({ job });
}
