// Professional plat-review stamp for Exhibit A. Styled like a surveyor's
// circular ink stamp, but explicitly a SITING REVIEW — "NOT A SURVEY" is
// embedded in the stamp itself. Pure SVG so it exports cleanly to PNG/PDF.
const STAMP_BLUE = "#1e3a8a";
const MONO = "'IBM Plex Mono', monospace";

export default function PlatStamp({ x, y, date }) {
  const R = 64;
  const tr = R - 15; // text arc radius
  return (
    <g transform={`translate(${x}, ${y}) rotate(-7)`} opacity="0.88">
      <defs>
        <path id="ts-stamp-top" d={`M ${-tr},0 A ${tr},${tr} 0 0 1 ${tr},0`} />
        <path id="ts-stamp-bot" d={`M ${tr},0 A ${tr},${tr} 0 0 1 ${-tr},0`} />
      </defs>
      <circle r={R} fill="none" stroke={STAMP_BLUE} strokeWidth="2.6" />
      <circle r={R - 5} fill="none" stroke={STAMP_BLUE} strokeWidth="1" />
      <text fontFamily={MONO} fontSize="8.5" fontWeight="bold" fill={STAMP_BLUE} letterSpacing="1.6">
        <textPath href="#ts-stamp-top" startOffset="50%" textAnchor="middle">
          SITEHAWK SITING ENGINE
        </textPath>
      </text>
      <text fontFamily={MONO} fontSize="8.5" fontWeight="bold" fill={STAMP_BLUE} letterSpacing="1.6">
        <textPath href="#ts-stamp-bot" startOffset="50%" textAnchor="middle">
          ★ PRELIMINARY PLAN REVIEW ★
        </textPath>
      </text>
      <text y="-13" fontFamily={MONO} fontSize="13.5" fontWeight="bold" fill={STAMP_BLUE} textAnchor="middle">
        REVIEWED
      </text>
      <line x1="-36" y1="-6" x2="36" y2="-6" stroke={STAMP_BLUE} strokeWidth="0.9" />
      <text y="6" fontFamily={MONO} fontSize="8.5" fill={STAMP_BLUE} textAnchor="middle">
        {date}
      </text>
      <text y="20" fontFamily={MONO} fontSize="8.5" fontWeight="bold" fill="#b91c1c" textAnchor="middle" letterSpacing="0.8">
        NOT A SURVEY
      </text>
    </g>
  );
}