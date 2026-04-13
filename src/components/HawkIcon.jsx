export default function HawkIcon({ size = 32, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Background rounded square */}
      <rect width="100" height="100" rx="20" fill="#0C1B2E" />

      {/* Head / body shape */}
      <ellipse cx="50" cy="54" rx="30" ry="34" fill="#1E4D78" />
      <ellipse cx="50" cy="30" rx="22" ry="18" fill="#2563A0" />

      {/* Crown highlight (cyan) */}
      <ellipse cx="50" cy="18" rx="12" ry="7" fill="#22CCEE" opacity="0.65" />

      {/* Head top feathers */}
      <polygon points="42,14 48,4 50,16" fill="#2563A0" />
      <polygon points="50,12 52,2 56,14" fill="#1E4D78" />
      <polygon points="56,16 60,6 62,18" fill="#2563A0" />

      {/* Eye sockets (dark) */}
      <circle cx="35" cy="48" r="12" fill="#0A1525" />
      <circle cx="65" cy="48" r="12" fill="#0A1525" />

      {/* Irises */}
      <circle cx="35" cy="48" r="8" fill="#EF9F27" />
      <circle cx="65" cy="48" r="8" fill="#EF9F27" />

      {/* Pupils */}
      <circle cx="35" cy="48" r="4" fill="#1a0800" />
      <circle cx="65" cy="48" r="4" fill="#1a0800" />

      {/* Eye glints */}
      <circle cx="38" cy="45" r="1.5" fill="white" opacity="0.8" />
      <circle cx="68" cy="45" r="1.5" fill="white" opacity="0.8" />

      {/* Aviator glasses frames — KEY BRAND ELEMENT */}
      <circle cx="35" cy="48" r="13" fill="none" stroke="#85B7EB" strokeWidth="3" />
      <circle cx="65" cy="48" r="13" fill="none" stroke="#85B7EB" strokeWidth="3" />

      {/* Glasses bridge */}
      <line x1="48" y1="48" x2="52" y2="48" stroke="#85B7EB" strokeWidth="3" strokeLinecap="round" />

      {/* Glasses arms extending to sides */}
      <path d="M22 46 Q14 42 10 38" stroke="#85B7EB" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M78 46 Q86 42 90 38" stroke="#85B7EB" strokeWidth="2.5" strokeLinecap="round" fill="none" />

      {/* Beak */}
      <polygon points="44,64 56,64 50,76" fill="#EF9F27" />
      <line x1="44" y1="64" x2="56" y2="64" stroke="#D97706" strokeWidth="1.5" />

      {/* Chin / lower face */}
      <ellipse cx="50" cy="70" rx="14" ry="8" fill="#1E4D78" />
    </svg>
  );
}