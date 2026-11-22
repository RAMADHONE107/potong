const words = ["Ambil", "satu", "momen", "yang", "bikin", "orang", "berhenti", "scroll"];

export function KaraokeStage() {
  return (
    <div className="p-stage" aria-hidden="true">
      <div className="p-frame">
        <div className="p-frame-orb" />
        <div className="p-frame-badge">3 klip siap</div>
        <div className="p-frame-line" />
        <div className="p-karaoke">
          {words.map((word, index) => (
            <span
              className="p-karaoke-word"
              key={`${word}-${index}`}
              style={{ "--i": index } as React.CSSProperties}
            >
              {word}
            </span>
          ))}
        </div>
      </div>
      <div className="p-timeline">
        <div className="p-timeline-ruler">
          <div className="p-playhead" />
        </div>
        <div className="p-timeline-meta">
          <span>00:00</span>
          <span>potongan 1 dari 3</span>
          <span>00:35</span>
        </div>
      </div>
    </div>
  );
}
