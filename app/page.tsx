import Link from "next/link";
import { KaraokeStage } from "@/components/karaoke-stage";
import { LinkForm } from "@/components/link-form";

const specs = [
  {
    title: "Banyak kandidat klip",
    body: "Potong memilih beberapa momen dengan skor hook berbeda, bukan cuma satu potongan acak.",
  },
  {
    title: "4 gaya subtitle, 4 model caption",
    body: "Karaoke, bold, minimal, neon — plus caption viral, story, edukasi, dan jualan yang bisa disesuaikan campaign.",
  },
  {
    title: "Brief campaign bawaan",
    body: "Isi audiens, tone, goal, platform, dan CTA agar hasilnya siap dipakai tim clipper.",
  },
];

const steps = [
  { title: "Tempel atau unggah", body: "Link video publik atau file dari perangkatmu." },
  { title: "Dengar dan pahami", body: "Audio ditranskrip di mesin sendiri jadi teks bertanda waktu." },
  { title: "Pilih momen", body: "Beberapa potongan paling menarik disusun otomatis." },
  { title: "Unduh dan unggah", body: "Klip vertikal lengkap dengan caption, tanpa tanda air." },
];

const faqs = [
  {
    question: "Apakah benar-benar gratis?",
    answer:
      "Ya. Tidak ada kredit, tidak ada langganan, tidak ada watermark. Semua bagian aplikasi terbuka sejak akun pertama dibuat.",
  },
  {
    question: "Video dari mana?",
    answer:
      "Kamu bisa menempel alamat video publik atau mengunggah file sendiri. Pakai video yang memang boleh kamu olah — Potong tidak melewati pembatasan akses apa pun.",
  },
  {
    question: "Kenapa harus masuk?",
    answer:
      "Supaya antrean dan hasil pekerjaanmu tersimpan. Masuk memakai akun GitHub langsung membuat akun; tidak ada formulir pendaftaran.",
  },
  {
    question: "Apakah transkrip dikirim ke layanan berbayar?",
    answer:
      "Tidak. Transkripsi berjalan lokal dengan whisper.cpp di mesin tempat aplikasi ini dijalankan.",
  },
  {
    question: "Berapa lama prosesnya?",
    answer:
      "Tergantung panjang video dan kecepatan mesin. Model kecil sengaja dipilih supaya CPU biasa tetap bisa memakainya.",
  },
];

export default function Home() {
  return (
    <>
      <header className="p-site-header">
        <div className="p-wrap p-header-inner">
          <Link href="/" className="p-mark">
            <span className="p-mark-glyph" />
            potong
          </Link>
          <nav className="p-nav">
            <Link href="#cara-kerja">Cara kerja</Link>
            <Link href="#contoh">Contoh hasil</Link>
            <Link href="#faq">FAQ</Link>
          </nav>
          <Link href="/dashboard" className="p-btn p-btn-dark">
            Buka workspace
          </Link>
        </div>
      </header>

      <main>
        <section className="p-wrap p-hero">
          <div>
            <h1>Video panjang jadi klip yang bikin orang berhenti scroll.</h1>
            <p className="p-hero-sub">
              Tempel link atau unggah video. Potong mengambil momen yang paling menarik,
              membuat teks yang menyala per kata, dan menyiapkan beberapa versi vertikal
              yang langsung bisa diunggah.
            </p>
            <LinkForm />
          </div>
          <KaraokeStage />
        </section>

        <section className="p-section" id="contoh">
          <div className="p-wrap">
            <h2>Lebih dari satu potongan, lebih dari satu gaya</h2>
            <p className="p-hero-sub" style={{ marginBottom: 28 }}>
              Satu video menghasilkan beberapa kandidat klip. Tiap klip punya gaya subtitle berbeda
              dan beberapa varian caption yang bisa dipilih sesuai campaign.
            </p>
            {specs.map((spec) => (
              <div className="p-specimen" key={spec.title}>
                <div className="p-specimen-thumb">
                  <span />
                </div>
                <div>
                  <h3>{spec.title}</h3>
                  <p>{spec.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="p-section" id="cara-kerja">
          <div className="p-wrap">
            <h2>Empat langkah, lalu selesai</h2>
            <div className="p-steps">
              {steps.map((step, index) => (
                <div className="p-step" key={step.title}>
                  <span className="p-step-num">0{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="p-section p-free">
          <div className="p-wrap">
            <h2>Tak ada tombol upgrade di sini.</h2>
            <p className="p-section-note">
              Bagian yang biasanya dibayar — teks karaoke, beberapa potongan, dan unduhan
              tanpa tanda air — tersedia untuk semua orang yang masuk.
            </p>
            <div className="p-free-list">
              <div className="p-free-item">
                <strong>Gratis selamanya</strong>
                <span>Tanpa kredit yang habis dan tanpa masa tunggu.</span>
              </div>
              <div className="p-free-item">
                <strong>Tanpa watermark</strong>
                <span>Hasil unduhan bersih, siap dipakai di kanal mana pun.</span>
              </div>
              <div className="p-free-item">
                <strong>Tanpa formulir</strong>
                <span>Satu tombol masuk dengan akun GitHub, langsung jadi.</span>
              </div>
            </div>
          </div>
        </section>

        <section className="p-section p-faq" id="faq">
          <div className="p-wrap">
            <h2>Pertanyaan yang sering muncul</h2>
            {faqs.map((faq) => (
              <details key={faq.question}>
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="p-site-footer">
        <div className="p-wrap">
          <span>Potong — video panjang, hasil pendek.</span>
          <span>Dibangun dengan FFmpeg dan whisper.cpp. Gratis dan open source.</span>
        </div>
      </footer>
    </>
  );
}
