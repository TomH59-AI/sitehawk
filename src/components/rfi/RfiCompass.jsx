// Map compass overlay showing True North and Magnetic North.
// declination = degrees East (+) that magnetic north sits from true north at
// the map center. The magnetic needle is rotated by that amount.
export default function RfiCompass({ declination = 0 }) {
  const dec = Number.isFinite(declination) ? declination : 0;
  const dir = dec >= 0 ? "E" : "W";

  return (
    <div className="absolute bottom-4 right-4 z-20 rounded-xl bg-slate-900/85 backdrop-blur border border-white/10 shadow-lg p-2.5 flex flex-col items-center gap-1 select-none">
      <svg width="72" height="72" viewBox="0 0 100 100">
        {/* outer ring */}
        <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2" />
        {/* cardinal ticks */}
        {[0, 90, 180, 270].map((a) => (
          <line
            key={a}
            x1="50" y1="6" x2="50" y2="12"
            stroke="rgba(255,255,255,0.5)" strokeWidth="2"
            transform={`rotate(${a} 50 50)`}
          />
        ))}

        {/* True North needle — fixed straight up, white */}
        <g>
          <polygon points="50,10 45,50 55,50" fill="#FFFFFF" />
          <polygon points="45,50 55,50 50,88" fill="rgba(255,255,255,0.25)" />
        </g>

        {/* Magnetic North needle — rotated by declination, red */}
        <g transform={`rotate(${dec} 50 50)`}>
          <polygon points="50,14 46,50 54,50" fill="#EF4444" />
        </g>

        {/* labels */}
        <text x="50" y="5" textAnchor="middle" fontSize="9" fill="#FFFFFF" fontWeight="bold">N</text>
        <text x="95" y="53" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.6)">E</text>
        <text x="50" y="98" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.6)">S</text>
        <text x="5" y="53" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.6)">W</text>
      </svg>

      <div className="text-[10px] leading-tight text-white/80 text-center">
        <div className="flex items-center gap-1 justify-center">
          <span className="inline-block w-2 h-2 rounded-full bg-white" /> True N
        </div>
        <div className="flex items-center gap-1 justify-center">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500" /> Magnetic N
        </div>
        <div className="mt-0.5 font-mono text-white/60">
          {Math.abs(dec).toFixed(1)}° {dir}
        </div>
      </div>
    </div>
  );
}