export type JobStatus =
  | "queued"
  | "downloading"
  | "transcribing"
  | "cutting"
  | "done"
  | "error";

export type SourceType = "url" | "upload";

export type CaptionStyle = "viral" | "story" | "edukasi" | "jualan";
export type SubtitleStyle = "karaoke" | "bold" | "minimal" | "neon";

export interface CaptionVariant {
  style: CaptionStyle;
  label: string;
  text: string;
}

export interface Clip {
  index: number;
  file: string;
  poster: string;
  start: number;
  duration: number;
  score: number;
  hook: string;
  title: string;
  caption: string;
  captions: CaptionVariant[];
  subtitleStyle: SubtitleStyle;
}

export interface Campaign {
  name: string;
  audience: string;
  tone: string;
  goal: string;
  cta: string;
  platform: string;
}

export interface Job {
  id: string;
  user_id: string;
  source_type: SourceType;
  source: string;
  status: JobStatus;
  progress: number;
  error: string | null;
  campaign: Campaign;
  clips: Clip[];
  created_at: number;
}
