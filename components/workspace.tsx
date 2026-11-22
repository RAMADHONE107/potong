"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Campaign, Clip, Job, JobStatus } from "@/lib/types";

const STATUS: Record<JobStatus, string> = {
  queued: "Menunggu giliran",
  downloading: "Mengambil video",
  transcribing: "Mendengar dan menulis teks",
  cutting: "Memotong dan menyusun klip",
  done: "Selesai",
  error: "Gagal",
};

const defaultCampaign: Campaign = {
  name: "", audience: "", tone: "Santai & tajam", goal: "Views", cta: "", platform: "Semua",
};

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(timestamp);
}

export function Workspace({ name }: { name: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"url" | "upload">("url");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<Campaign>(defaultCampaign);
  const [captionPick, setCaptionPick] = useState<Record<number, number>>({});

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      if (res.ok) { const data = (await res.json()) as { jobs: Job[] }; setJobs(data.jobs); }
    } catch {}
  }, []);

  useEffect(() => { void loadJobs(); const fromLink = params.get("job"); if (fromLink) setActiveId(fromLink); }, [loadJobs, params]);

  useEffect(() => {
    if (!activeId) return;
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (stopped) return;
      try {
        const res = await fetch(`/api/jobs/${activeId}`);
        if (res.ok) {
          const data = (await res.json()) as { job: Job };
          setJobs((prev) => prev.map((j) => (j.id === data.job.id ? data.job : j)));
          if (data.job.status === "done" || data.job.status === "error") { stopped = true; return; }
        }
      } catch {}
      if (!stopped) timer = setTimeout(poll, 1800);
    };
    timer = setTimeout(poll, 250);
    return () => { stopped = true; clearTimeout(timer); };
  }, [activeId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const res = mode === "url"
        ? await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: url, campaign }) })
        : await fetch("/api/jobs", { method: "POST", body: (() => { const f = new FormData(); if (file) f.set("file", file); f.set("campaign", JSON.stringify(campaign)); return f; })() });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) { setError(data.error ?? "Video belum bisa diproses."); return; }
      await loadJobs(); setActiveId(data.id); router.replace("/dashboard");
    } catch { setError("Koneksi terputus. Coba lagi."); }
    finally { setBusy(false); }
  }

  async function copy(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); } catch {
      const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove();
    }
    setCopied(key); setTimeout(() => setCopied(null), 1400);
  }

  const active = jobs.find((j) => j.id === activeId) ?? null;
  const ready = active?.status === "done" ? active.clips : [];
  const setC = (k: keyof Campaign, v: string) => setCampaign((c) => ({ ...c, [k]: v }));

  return (
    <div className="p-workspace">
      <header className="p-topbar">
        <Link href="/" className="p-mark"><span className="p-mark-glyph" />POTONG</Link>
        <div className="p-topbar-right">
          <span>{name}</span>
          <button type="button" onClick={() => void signOut({ callbackUrl: "/" })}>Keluar</button>
        </div>
      </header>

      <div className="p-work-grid">
        <aside>
          <section className="p-panel">
            <h2>Buat klip baru</h2>
            <form onSubmit={submit}>
              <div className="p-seg">
                <button type="button" data-active={mode === "url"} onClick={() => setMode("url")}>Tempel link</button>
                <button type="button" data-active={mode === "upload"} onClick={() => setMode("upload")}>Unggah file</button>
              </div>

              {mode === "url" ? (
                <>
                  <label className="p-field-label" htmlFor="video-url">Alamat video publik</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input className="p-work-input" id="video-url" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} required placeholder="https://youtube.com/..." value={url} onChange={(e) => setUrl(e.target.value)} />
                    <button type="button" className="p-btn p-btn-ghost" style={{ padding: "0 14px" }} onClick={async () => { try { const t = await navigator.clipboard.readText(); if (t) setUrl(t.trim()); } catch { setError("Izin clipboard ditolak. Tekan lama di kolom lalu tempel."); } }}>Tempel</button>
                  </div>
                </>
              ) : (
                <>
                  <label className="p-field-label" htmlFor="video-file">File video dari perangkat</label>
                  <input className="p-work-input" id="video-file" type="file" accept="video/*" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </>
              )}

              <div className="p-campaign">
                <div className="p-jobs-head" style={{ marginTop: 18 }}>BRIEF CAMPAIGN</div>
                <label className="p-field-label">Nama campaign</label>
                <input className="p-work-input" value={campaign.name} onChange={(e) => setC("name", e.target.value)} placeholder="Contoh: Launch produk baru" />
                <div className="p-camp-row">
                  <div><label className="p-field-label">Target audiens</label><input className="p-work-input" value={campaign.audience} onChange={(e) => setC("audience", e.target.value)} placeholder="UMKM, mahasiswa..." /></div>
                  <div><label className="p-field-label">Platform</label>
                    <select className="p-work-input" value={campaign.platform} onChange={(e) => setC("platform", e.target.value)}>
                      {["Semua","TikTok","Reels","Shorts"].map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                <div className="p-camp-row">
                  <div><label className="p-field-label">Tone</label>
                    <select className="p-work-input" value={campaign.tone} onChange={(e) => setC("tone", e.target.value)}>
                      {["Santai & tajam","Profesional","Edukasi","Hard sell","Storytelling"].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><label className="p-field-label">Goal</label>
                    <select className="p-work-input" value={campaign.goal} onChange={(e) => setC("goal", e.target.value)}>
                      {["Views","Follow","Klik link","Beli","Lead"].map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                </div>
                <label className="p-field-label">CTA</label>
                <input className="p-work-input" value={campaign.cta} onChange={(e) => setC("cta", e.target.value)} placeholder="Contoh: Link di bio, daftar sekarang" />
              </div>

              <button className="p-btn p-btn-signal p-work-submit" type="submit" disabled={busy}>{busy ? "Memulai…" : "Generate klip"}</button>
              <p className="p-work-hint">Maks 200 MB. Hasil: banyak potongan, 4 gaya subtitle, 4 varian caption per klip.</p>
              {error ? <p className="p-message" style={{ marginTop: 12 }}>{error}</p> : null}
            </form>
          </section>

          <section className="p-panel p-jobs">
            <div className="p-jobs-head">RIWAYAT</div>
            {jobs.length === 0 ? <p className="p-work-hint">Belum ada pekerjaan.</p> : null}
            {jobs.map((job) => (
              <button className="p-job" type="button" key={job.id} data-active={job.id === activeId} onClick={() => setActiveId(job.id)}>
                <span className="p-job-title">{job.source}</span>
                <span className="p-job-meta">{STATUS[job.status]} · {job.clips.length ? `${job.clips.length} klip · ` : ""}{formatDate(job.created_at)}</span>
              </button>
            ))}
          </section>
        </aside>

        <main>
          {active && ["queued","downloading","transcribing","cutting"].includes(active.status) ? (
            <section className="p-panel">
              <p className="p-status">{STATUS[active.status]}</p>
              <div className="p-progress"><span style={{ width: `${active.progress}%` }} /></div>
              <p className="p-work-hint">{active.progress}% — proses berjalan. Video panjang bisa butuh waktu, tapi tidak ada batas durasi.</p>
            </section>
          ) : null}

          {active?.status === "error" ? <p className="p-message">{active.error ?? "Pekerjaan gagal."}</p> : null}

          {ready.length === 0 ? (
            <div className="p-empty"><h2>Belum ada klip.</h2><p>Tempel link atau unggah video, isi brief campaign, lalu generate.</p></div>
          ) : (
            <>
              <div className="p-result-head">
                <div>
                  <h2>{active?.campaign?.name || "Hasil potongan"}</h2>
                  <p className="p-work-hint" style={{ margin: "4px 0 0" }}>{ready.length} klip · 4 gaya subtitle · 4 varian caption · tanpa watermark</p>
                </div>
                {active?.campaign?.audience ? <span className="p-camp-pill">{active.campaign.audience}</span> : null}
              </div>
              <div className="p-grid-clips">
                {ready.map((clip) => {
                  const pick = captionPick[clip.index] ?? 0;
                  const cap = clip.captions?.[pick] ?? { text: clip.caption, label: "Caption", style: "viral" as const };
                  return (
                    <article className="p-clip" key={clip.index}>
                      <div className="p-clip-poster">
                        <img src={`/api/jobs/${active?.id}/clips/${clip.index}?poster=1`} alt="" loading="lazy" />
                        <span className="p-clip-duration">{Math.round(clip.duration)} dtk</span>
                        <span className="p-clip-style">{clip.subtitleStyle}</span>
                      </div>
                      <div className="p-clip-body">
                        <div className="p-clip-score">Skor {Math.round(clip.score || 0)}</div>
                        <h3>{clip.hook || clip.title}</h3>
                        <div className="p-cap-tabs">
                          {(clip.captions?.length ? clip.captions : [{ label: "Caption", text: clip.caption, style: "viral" as const }]).map((c, i) => (
                            <button key={c.style + i} type="button" data-active={pick === i} onClick={() => setCaptionPick((p) => ({ ...p, [clip.index]: i }))}>{c.label}</button>
                          ))}
                        </div>
                        <p className="p-cap-text">{cap.text}</p>
                        <div className="p-clip-actions">
                          <button type="button" onClick={() => void copy(cap.text, `${clip.index}-${pick}`)}>{copied === `${clip.index}-${pick}` ? "Tersalin" : "Salin caption"}</button>
                          <a href={`/api/jobs/${active?.id}/clips/${clip.index}`} download={`potong-${active?.id}-${clip.index}.mp4`}>Unduh</a>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
