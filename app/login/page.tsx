import Link from "next/link";

export const dynamic = "force-dynamic";
import { LoginButtons } from "@/components/login-buttons";

export default function LoginPage() {
  const githubReady = Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);

  return (
    <main className="p-login">
      <div className="p-login-card">
        <Link href="/" className="p-mark">
          <span className="p-mark-glyph" />
          potong
        </Link>
        <h1>Masuk tanpa daftar.</h1>
        <p>
          Satu tombol untuk membuat akun dan langsung masuk. Tidak ada formulir, kata sandi,
          atau pembayaran.
        </p>
        <LoginButtons provider={githubReady ? "github" : "credentials"} />
        <p className="p-login-fine">
          {githubReady
            ? "Kami hanya meminta izin dasar dari GitHub untuk mengenali akunmu."
            : "Mode lokal aktif karena kredensial GitHub belum diisi. Isi .env.local untuk mengaktifkan GitHub."}
        </p>
      </div>
    </main>
  );
}
