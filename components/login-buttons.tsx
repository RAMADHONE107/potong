"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export function LoginButtons({ provider }: { provider: "github" | "credentials" }) {
  const [busy, setBusy] = useState(false);
  const isGithub = provider === "github";

  return (
    <button
      className="p-btn p-btn-signal"
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await signIn(provider, { callbackUrl: "/dashboard" });
      }}
    >
      {busy ? "Membuka…" : isGithub ? "Lanjut dengan GitHub" : "Lanjut dengan akun lokal"}
    </button>
  );
}
