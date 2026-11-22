"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LinkForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: value }),
      });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id) {
        setError(data.error ?? "Video belum bisa diproses. Coba lagi.");
        return;
      }
      router.push(`/dashboard?job=${data.id}`);
    } catch {
      setError("Koneksi terputus. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="p-form" onSubmit={submit}>
      <div style={{ display: "flex", gap: 8, flex: 1, minWidth: 0 }}>
        <input
          className="p-input"
          type="url"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          placeholder="Tempel alamat video di sini"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label="Alamat video"
        />
        <button
          type="button"
          className="p-btn p-btn-dark"
          style={{ padding: "0 14px", whiteSpace: "nowrap" }}
          onClick={async () => {
            try {
              const text = await navigator.clipboard.readText();
              if (text) setValue(text.trim());
            } catch {
              setError("Izin clipboard ditolak. Tempel manual dengan tekan lama di kolom.");
            }
          }}
        >
          Tempel
        </button>
      </div>
      <button className="p-btn p-btn-signal" type="submit" disabled={busy}>
        {busy ? "Memulai…" : "Potong"}
      </button>
      {error ? <p className="p-form-error">{error}</p> : null}
      <p className="p-form-note">Gratis selamanya. Masuk pakai GitHub tanpa daftar. Tanpa watermark, tanpa batas durasi buatan.</p>
    </form>
  );
}
