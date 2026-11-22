import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { updateJob } from "./db";
import type { Campaign, CaptionStyle, CaptionVariant, Clip, Job, SubtitleStyle } from "./types";

const ROOT = process.cwd();
const WHISPER_CLI = path.join(ROOT, ".tools/whisper.cpp/build/bin/whisper-cli");
const MODEL_NAME = process.env.POTONG_WHISPER_MODEL ?? "ggml-base.bin";
const SAFE_MODEL = /^ggml-[a-z0-9._-]+\.bin$/.test(MODEL_NAME) ? MODEL_NAME : "ggml-base.bin";
const WHISPER_MODEL = path.join(ROOT, "models", SAFE_MODEL);
const THREADS = Number(process.env.POTONG_WHISPER_THREADS ?? 4);
const BEAM = Number(process.env.POTONG_WHISPER_BEAM ?? 1);
const BEST_OF = Number(process.env.POTONG_WHISPER_BEST_OF ?? 1);
const MAX_URL_SECONDS = Number(process.env.POTONG_MAX_URL_SECONDS ?? 0);

export function jobDir(id: string): string {
  return path.join(ROOT, "data/jobs", id);
}

function run(
  command: string,
  args: string[],
): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: ROOT });
    let output = "";
    const collect = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.length > 200_000) output = output.slice(-200_000);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error) => resolve({ code: 1, output: `${output}\n${error.message}` }));
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

interface TimedWord {
  text: string;
  start: number;
  end: number;
}

interface WhisperToken {
  text?: string;
  offsets?: { from: number; to: number };
  timestamps?: { from: string; to: string };
}

function tokenMillis(token: WhisperToken, field: "from" | "to", fallback: number): number {
  const offset = token.offsets?.[field];
  if (typeof offset === "number") return offset;
  const raw = token.timestamps?.[field];
  if (!raw) return fallback;
  const match = raw.match(/(\d+):(\d{2}):(\d{2})[,.](\d+)/);
  if (!match) return fallback;
  return (
    Number(match[1]) * 3_600_000 +
    Number(match[2]) * 60_000 +
    Number(match[3]) * 1000 +
    Number(match[4])
  );
}

interface WhisperSegment {
  offsets?: { from: number; to: number };
  text?: string;
  tokens?: WhisperToken[];
}

interface WhisperJson {
  transcription?: WhisperSegment[];
}

function parseWords(jsonPath: string): TimedWord[] {
  let parsed: WhisperJson;
  try {
    parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as WhisperJson;
  } catch {
    return [];
  }

  const words: TimedWord[] = [];
  for (const segment of parsed.transcription ?? []) {
    const segStart = (segment.offsets?.from ?? 0) / 1000;
    const segEnd = (segment.offsets?.to ?? segStart + 1000) / 1000;
    const chars: { ch: string; at: number }[] = [];
    const tokens = segment.tokens?.length
      ? segment.tokens.filter((token) => !/^\[.*\]$/.test(token.text ?? ""))
      : [{ text: segment.text ?? "" }];

    for (const token of tokens) {
      const text = token.text ?? "";
      const start = tokenMillis(token, "from", segStart * 1000) / 1000;
      const end = tokenMillis(token, "to", segEnd * 1000) / 1000;
      Array.from(text).forEach((ch, index, array) => {
        chars.push({ ch, at: start + ((end - start) * index) / Math.max(array.length, 1) });
      });
    }
    if (chars.length === 0) continue;

    let buffer = "";
    let bufferStart = chars[0].at;
    let bufferEnd = chars[0].at;
    const flush = () => {
      const text = buffer.replace(/\s+/g, " ").trim();
      if (text) words.push({ text, start: bufferStart, end: Math.max(bufferEnd, bufferStart + 0.08) });
      buffer = "";
    };
    for (let i = 0; i < chars.length; i += 1) {
      const { ch, at } = chars[i];
      if (/\s/.test(ch)) {
        flush();
        bufferStart = chars[i + 1]?.at ?? at;
      } else {
        if (!buffer) bufferStart = at;
        buffer += ch;
        bufferEnd = chars[i + 1]?.at ?? at;
      }
    }
    flush();
  }
  return words.filter((word) => word.text.length > 0 && word.start >= 0);
}

interface Window {
  start: number;
  duration: number;
  score: number;
  hook: string;
}

const HOOK_PATTERNS = [
  /kenapa|mengapa|gimana|bagaimana|apa\b/i,
  /cara|tips|trik|langkah|tutorial/i,
  /rahasia|kunci|penting|wajib|harus/i,
  /ternyata|padahal|sebenarnya|faktanya/i,
  /jangan|hindari|stop|berhenti/i,
  /lebih|paling|terbaik|terburuk/i,
  /gratis|murah|mahal|diskon|hemat|cuan|untung/i,
  /sebelum|sesudah|dulu|akhirnya/i,
  /bisa|gampang|mudah|cepat/i,
  /salah|bener|benar|mitos/i,
];

function cleanToken(text: string): string {
  return text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

function hookText(words: TimedWord[], start: number, end = start + 8): string {
  const text = words
    .filter((w) => w.start >= start && w.start < end)
    .slice(0, 10)
    .map((w) => cleanToken(w.text))
    .filter(Boolean)
    .join(" ");
  return text || "Momen menarik";
}

function sentenceBoundaryScore(word: TimedWord, next?: TimedWord): number {
  const text = word.text.trim();
  let score = 0;
  if (/[.!?…]["')\]]?$/.test(text)) score += 2.4;
  else if (/[,;:]["')\]]?$/.test(text)) score += 0.8;
  if (next) {
    const gap = next.start - word.end;
    if (gap >= 0.55) score += 1.6;
    else if (gap >= 0.28) score += 0.7;
  }
  return score;
}

function snapStart(words: TimedWord[], target: number): number {
  let best = Math.max(0, target);
  let bestScore = -Infinity;
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    if (w.start < target - 2.2 || w.start > target + 2.2) continue;
    const prev = words[i - 1];
    const gap = prev ? w.start - prev.end : 1;
    const punct = prev && /[.!?…]["')\]]?$/.test(prev.text.trim()) ? 2.2 : 0;
    const dist = Math.abs(w.start - target);
    const score = (gap >= 0.45 ? 1.8 : gap >= 0.22 ? 0.8 : 0) + punct - dist * 0.9;
    if (score > bestScore) {
      bestScore = score;
      best = Math.max(0, w.start - 0.12);
    }
  }
  return best;
}

function snapEnd(words: TimedWord[], start: number, target: number, durationLimit: number): number {
  const maxEnd = Math.min(durationLimit, start + 58, target + 10);
  const minEnd = Math.max(start + 12, target - 10);
  let best = Math.min(maxEnd, Math.max(minEnd, target));
  let bestScore = -Infinity;
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    const end = w.end + 0.18;
    if (end < minEnd || end > maxEnd) continue;
    const next = words[i + 1];
    const boundary = sentenceBoundaryScore(w, next);
    const dist = Math.abs(end - target);
    const score = boundary * 2 + (next ? Math.min(next.start - w.end, 1.2) : 1.2) - dist * 0.22;
    if (score > bestScore) {
      bestScore = score;
      best = Math.min(durationLimit, end);
    }
  }
  return Math.max(start + 8, best);
}

function pickWindows(words: TimedWord[], duration: number): Window[] {
  const count = duration >= 300 ? 8 : duration >= 180 ? 7 : duration >= 90 ? 6 : duration >= 45 ? 5 : duration >= 20 ? 4 : 3;
  const target = Math.min(45, Math.max(20, Math.round(duration / Math.max(count, 2))));
  const minDur = duration < 16 ? Math.max(6, duration) : 15;
  const maxDur = duration < 16 ? Math.max(8, duration) : 52;

  if (duration < 10) {
    return [{ start: 0, duration: Math.max(4, duration), score: 1, hook: hookText(words, 0, duration) }];
  }

  const candidates: Window[] = [];
  const step = duration > 180 ? 5 : 3;
  for (let rawStart = 0; rawStart < duration - 6; rawStart += step) {
    const start = snapStart(words, rawStart);
    const rawEnd = Math.min(duration, start + target);
    const end = snapEnd(words, start, rawEnd, duration);
    const winDur = end - start;
    if (winDur < minDur || winDur > maxDur) continue;

    const inside = words.filter((w) => w.end > start && w.start < end);
    if (inside.length < 8) continue;

    const text = inside.map((w) => w.text).join(" ");
    const hookHits = HOOK_PATTERNS.reduce((n, p) => n + (p.test(text) ? 1 : 0), 0);
    const earlyHook = HOOK_PATTERNS.reduce(
      (n, p) => n + (inside.some((w) => w.start < start + 6 && p.test(w.text)) ? 1 : 0),
      0,
    );

    let pauseScore = 0;
    for (let i = 1; i < inside.length; i += 1) {
      const gap = inside[i].start - inside[i - 1].end;
      if (gap >= 0.25 && gap <= 1.2) pauseScore += 0.35;
      if (gap > 2.2) pauseScore -= 0.8;
    }

    const density = inside.length / Math.max(winDur, 1); // words/sec
    const densityScore = density >= 1.4 && density <= 3.4 ? 4 : density >= 1 ? 2 : -3;
    const punctScore = inside.filter((w) => /[!?]/.test(w.text)).length * 0.45;
    const numbersScore = inside.filter((w) => /\d/.test(w.text)).length * 0.3;
    const startBoundary = inside[0] && Math.abs(inside[0].start - start) < 0.35 ? 1.2 : 0;
    const last = inside[inside.length - 1];
    const endBoundary = last && /[.!?…]["')\]]?$/.test(last.text.trim()) ? 1.8 : 0;
    const lenPenalty = Math.abs(winDur - target) * 0.08;
    const score =
      hookHits * 2.8 +
      earlyHook * 2.2 +
      densityScore +
      pauseScore +
      punctScore +
      numbersScore +
      startBoundary +
      endBoundary -
      lenPenalty;

    candidates.push({ start, duration: Number(winDur.toFixed(3)), score, hook: hookText(words, start, Math.min(end, start + 8)) });
  }

  if (candidates.length === 0) {
    const fallbackDur = Math.min(Math.max(minDur, target), duration);
    return [{ start: 0, duration: fallbackDur, score: 1, hook: hookText(words, 0, fallbackDur) }];
  }

  const ranked = [...candidates].sort((a, b) => b.score - a.score);
  const chosen: Window[] = [];
  const overlapLimit = target * 0.55;
  for (const c of ranked) {
    if (chosen.length >= count) break;
    if (chosen.some((i) => Math.abs(i.start - c.start) < overlapLimit)) continue;
    chosen.push(c);
  }
  for (const c of ranked) {
    if (chosen.length >= count) break;
    if (chosen.some((i) => Math.abs(i.start - c.start) < target * 0.35)) continue;
    chosen.push(c);
  }

  return chosen
    .sort((a, b) => a.start - b.start)
    .map((c, i) => ({ ...c, hook: hookText(words, c.start, c.start + 8) || `Momen ${i + 1}` }));
}

function escapeAss(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "(")
    .replace(/\}/g, ")")
    .replace(/\r?\n/g, " ")
    .trim();
}

function assTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  const whole = Math.floor(rest);
  const centis = Math.round((rest - whole) * 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(whole).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

function buildAss(words: TimedWord[], windowStart: number, windowDuration: number, style: SubtitleStyle): string {
  const cues: TimedWord[][] = [];
  let current: TimedWord[] = [];

  const pushCue = () => {
    if (!current.length) return;
    cues.push(current);
    current = [];
  };

  for (const word of words) {
    const start = word.start - windowStart;
    const end = word.end - windowStart;
    if (end < -0.05 || start > windowDuration + 0.05) continue;
    const relative: TimedWord = {
      text: cleanToken(word.text) || word.text.trim(),
      start: Math.max(0, start),
      end: Math.min(windowDuration, Math.max(start + 0.08, end)),
    };
    if (!relative.text) continue;

    if (current.length > 0) {
      const prev = current[current.length - 1];
      const gap = relative.start - prev.end;
      const cueDur = relative.end - current[0].start;
      const punctBreak = /[.!?…]["')\]]?$/.test(prev.text);
      const commaBreak = /[,;:]["')\]]?$/.test(prev.text) && current.length >= 3;
      const shouldBreak =
        current.length >= 4 ||
        cueDur > 2.6 ||
        gap > 0.55 ||
        (punctBreak && current.length >= 2) ||
        (commaBreak && cueDur > 1.4);
      if (shouldBreak) pushCue();
    }
    current.push(relative);
  }
  pushCue();

  // Merge tiny orphan cues to avoid flicker.
  for (let i = 0; i < cues.length - 1; i += 1) {
    const cue = cues[i];
    const next = cues[i + 1];
    const cueDur = cue[cue.length - 1].end - cue[0].start;
    const gap = next[0].start - cue[cue.length - 1].end;
    if ((cue.length <= 2 || cueDur < 0.9) && gap < 0.35 && cue.length + next.length <= 5) {
      cue.push(...next);
      cues.splice(i + 1, 1);
      i -= 1;
    }
  }

  const styleLine = {
    karaoke:
      "Style: Default,DejaVu Sans,82,&H00FFFFFF,&H003355FF,&H00000000,&HA0000000,-1,0,0,0,100,100,0,0,1,5,1.5,2,75,75,210,1",
    bold:
      "Style: Default,DejaVu Sans,86,&H00FFFFFF,&H0000D2FF,&H00000000,&HB0000000,-1,0,0,0,100,100,0,0,3,0,0,2,70,70,200,1",
    minimal:
      "Style: Default,DejaVu Sans,62,&H00F5F5F5,&H00B0B0B0,&H00000000,&H70000000,0,0,0,0,100,100,0,0,1,2,0,2,90,90,260,1",
    neon:
      "Style: Default,DejaVu Sans,78,&H00FFCC66,&H00FFFFFF,&H00401000,&H90000000,-1,0,0,0,100,100,0,0,1,4,2,2,75,75,215,1",
  }[style];

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styleLine}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines = cues.map((cue, index) => {
    const start = Math.max(0, cue[0].start);
    const naturalEnd = Math.min(windowDuration, cue[cue.length - 1].end + 0.18);
    const nextStart = cues[index + 1]?.[0]?.start;
    const end = Math.max(start + 0.35, nextStart === undefined ? naturalEnd : Math.min(naturalEnd, nextStart - 0.04));

    const body = cue
      .map((word) => {
        const durCs = Math.max(1, Math.round((Math.min(end, word.end) - Math.max(start, word.start)) * 100));
        const token = escapeAss(word.text);
        if (style === "karaoke") return `{\\k${durCs}}${token} `;
        if (style === "neon") return `{\\k${durCs}\\1c&HFFCC66&\\3c&H401000&}${token} `;
        return `${token} `;
      })
      .join("")
      .trimEnd();

    return `Dialogue: 0,${assTime(start)},${assTime(end)},Default,,0,0,0,,${body}`;
  });

  return `${header}${lines.join("\n")}\n`;
}

function cleanWords(words: TimedWord[], start: number, seconds = 10): string {
  return words
    .filter((w) => w.start >= start && w.start < start + seconds)
    .slice(0, 10)
    .map((w) => w.text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean)
    .join(" ")
    .trim();
}

function makeTitle(words: TimedWord[], start: number): string {
  const clean = cleanWords(words, start, 12) || "Potongan menarik";
  return clean.length > 62 ? `${clean.slice(0, 59).trimEnd()}…` : clean;
}

function makeCaptionVariants(title: string, campaign: Campaign): CaptionVariant[] {
  const hook = title.replace(/[.…]+$/, "").trim();
  const cta = campaign.cta || "Simpan dulu, nanti butuh.";
  const aud = campaign.audience ? ` buat ${campaign.audience}` : "";
  const camp = campaign.name ? ` [${campaign.name}]` : "";
  const goal = campaign.goal ? `#${campaign.goal.toLowerCase().replace(/[^a-z0-9]+/g, "")}` : "#konten";
  const platform = campaign.platform && campaign.platform !== "Semua" ? `#${campaign.platform.toLowerCase()}` : "#shorts";

  const mk = (style: CaptionStyle, label: string, text: string): CaptionVariant => ({ style, label, text: text.trim() });
  return [
    mk("viral", "Viral", `${hook}.\n\nBagian ini yang bikin orang berhenti scroll${aud}.\n\n${cta}${camp}\n\n${platform} #reels #fyp ${goal}`),
    mk("story", "Story", `Awalnya biasa aja, sampai bagian ini: "${hook}".\n\nKalau kamu${aud || " target audiensnya"}, ini relevan banget.\n\n${cta}\n\n#storytelling ${platform}`),
    mk("edukasi", "Edukasi", `Poin penting: ${hook}.\n\nAmbil 1 insight, langsung praktikkan${aud}.\n\n${cta}\n\n#edukasi #tips ${goal}`),
    mk("jualan", "Jualan", `${hook} — dan ini alasan orang butuh solusinya.\n\n${campaign.tone ? `Tone: ${campaign.tone}. ` : ""}${cta}\n\n#umkm #jualan ${platform}`),
  ];
}

export async function runPipeline(job: Job): Promise<void> {
  const dir = jobDir(job.id);
  fs.mkdirSync(dir, { recursive: true });
  const source = path.join(dir, "source.mp4");

  try {
    updateJob(job.id, { status: "downloading", progress: 8, error: null });

    if (job.source_type === "url") {
      const result = await run("yt-dlp", [
        "--no-playlist",
        "--no-warnings",
        "-f",
        "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/bv*[height<=720]+ba/b[height<=720]/best",
        "--merge-output-format", "mp4",
        "-o", source,
        job.source,
      ]);
      if (result.code !== 0 || !fs.existsSync(source)) {
        throw new Error(`Gagal mengambil video: ${result.output.slice(-400)}`);
      }
    } else if (!fs.existsSync(source)) {
      throw new Error("File unggahan tidak ditemukan.");
    }

    const probe = await run("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", source,
    ]);
    const sourceDuration = Number(probe.output.trim()) || 0;
    if (sourceDuration < 5) throw new Error("Video terlalu pendek atau tidak terbaca.");

    const duration =
      job.source_type === "url" && MAX_URL_SECONDS > 0
        ? Math.min(sourceDuration, MAX_URL_SECONDS)
        : sourceDuration;
    if (job.source_type === "url" && MAX_URL_SECONDS > 0 && sourceDuration > MAX_URL_SECONDS) {
      updateJob(job.id, { progress: 12, error: `Video ${Math.round(sourceDuration / 60)} menit; diproses ${Math.round(MAX_URL_SECONDS / 60)} menit pertama.` });
    }

    updateJob(job.id, { status: "transcribing", progress: 38 });

    const audio = path.join(dir, "audio.wav");
    const extracted = await run("ffmpeg", [
      "-y", "-loglevel", "error",
      "-i", source,
      "-t", String(duration),
      "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", audio,
    ]);
    if (extracted.code !== 0) throw new Error(`Gagal mengekstrak audio: ${extracted.output.slice(-300)}`);

    const transcriptBase = path.join(dir, "transcript");
    const transcribed = await run(WHISPER_CLI, [
      "-m", WHISPER_MODEL,
      "-f", audio,
      "-l", "auto",
      "-t", String(THREADS),
      "-bs", String(BEAM),
      "-bo", String(BEST_OF),
      "-ojf",
      "-of", transcriptBase,
    ]);
    if (transcribed.code !== 0) throw new Error(`Gagal transkrip: ${transcribed.output.slice(-300)}`);

    const words = parseWords(`${transcriptBase}.json`);
    const windows = pickWindows(words, duration);
    const subtitleStyles: SubtitleStyle[] = ["karaoke", "bold", "minimal", "neon"];
    const clips: Clip[] = [];

    updateJob(job.id, { status: "cutting", progress: 68 });

    for (let index = 0; index < windows.length; index += 1) {
      const window = windows[index];
      const assPath = path.join(dir, `clip-${index + 1}.ass`);
      const clipPath = path.join(dir, `clip-${index + 1}.mp4`);
      const posterPath = path.join(dir, `clip-${index + 1}.jpg`);
      const subtitleStyle = subtitleStyles[index % subtitleStyles.length];
      fs.writeFileSync(assPath, buildAss(words, window.start, window.duration, subtitleStyle), "utf8");

      // Escape path for ffmpeg subtitles filter (libass): backslash, colon, single quote.
      const assFilterPath = assPath
        .replace(/\\/g, "\\\\")
        .replace(/:/g, "\\:")
        .replace(/'/g, "\\'");

      const rendered = await run("ffmpeg", [
        "-y", "-loglevel", "error",
        "-ss", window.start.toFixed(3),
        "-t", window.duration.toFixed(3),
        "-i", source,
        "-filter_complex",
        `[0:v]scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,boxblur=20:1[bg];` +
          `[0:v]scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos[fg];` +
          `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,subtitles=filename='${assFilterPath}'[v]`,
        "-map", "[v]", "-map", "0:a:0?",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-shortest",
        clipPath,
      ]);
      if (rendered.code !== 0 || !fs.existsSync(clipPath)) {
        throw new Error(`Gagal merender klip ${index + 1}: ${rendered.output.slice(-300)}`);
      }

      await run("ffmpeg", [
        "-y", "-loglevel", "error",
        "-ss", (window.start + Math.min(1, window.duration / 3)).toFixed(3),
        "-i", source,
        "-frames:v", "1",
        "-vf", "scale=270:480:force_original_aspect_ratio=increase,crop=270:480",
        "-q:v", "3", posterPath,
      ]);

      const title = makeTitle(words, window.start);
      const captions = makeCaptionVariants(title, job.campaign ?? { name: "", audience: "", tone: "", goal: "", cta: "", platform: "Semua" });
      clips.push({
        index: index + 1,
        file: `clip-${index + 1}.mp4`,
        poster: `clip-${index + 1}.jpg`,
        start: Number(window.start.toFixed(2)),
        duration: Number(window.duration.toFixed(2)),
        score: Number(window.score.toFixed(2)),
        hook: window.hook,
        title,
        caption: captions[0].text,
        captions,
        subtitleStyle,
      });
      updateJob(job.id, { progress: 68 + Math.round(((index + 1) / windows.length) * 30), clips });
    }

    fs.writeFileSync(path.join(dir, "result.json"), JSON.stringify({ duration, words, windows, clips }, null, 2));
    updateJob(job.id, { status: "done", progress: 100, clips });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fs.writeFileSync(path.join(dir, "error.txt"), message);
    updateJob(job.id, { status: "error", error: message.slice(0, 600) });
  }
}
