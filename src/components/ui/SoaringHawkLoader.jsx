/**
 * SoaringHawkLoader — branded loading bar used by all "Generate" actions.
 *
 * Renders a thin slate track with a stylized hawk (🦅) gliding smoothly
 * from left → right in an infinite loop, plus a dynamic status caption
 * below the bar. Use the `active` prop to toggle visibility from any
 * parent's loading state.
 *
 * Usage:
 *   <SoaringHawkLoader active={loading} message="SiteHawk is mapping signal propagation..." />
 */

export default function SoaringHawkLoader({ active, message = "SiteHawk is working…" }) {
  if (!active) return null;
  return (
    <>
      <style>{`
        @keyframes hawk-soar {
          0%   { left: -4%;  transform: translateY(-50%) scale(1)   rotate(-2deg); }
          50%  { transform: translateY(-58%) scale(1.05) rotate(1deg); }
          100% { left: 104%; transform: translateY(-50%) scale(1)   rotate(-2deg); }
        }
        @keyframes hawk-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .hawk-bar-track {
          position: relative;
          height: 6px;
          width: 100%;
          background: linear-gradient(90deg, rgba(148,163,184,0.18), rgba(148,163,184,0.32), rgba(148,163,184,0.18));
          border-radius: 999px;
          overflow: hidden;
        }
        .hawk-bar-shimmer {
          position: absolute; inset: 0;
          background: linear-gradient(90deg, transparent 0%, rgba(59,130,246,0.45) 50%, transparent 100%);
          animation: hawk-shimmer 2.2s linear infinite;
        }
        .hawk-soar-icon {
          position: absolute;
          top: 50%;
          left: -4%;
          font-size: 24px;
          line-height: 1;
          filter: drop-shadow(0 2px 6px rgba(37,99,235,0.55));
          animation: hawk-soar 3.2s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
          will-change: left, transform;
          pointer-events: none;
        }
      `}</style>
      <div className="w-full py-2">
        <div className="relative">
          <div className="hawk-bar-track">
            <div className="hawk-bar-shimmer" />
          </div>
          <div className="hawk-soar-icon">🦅</div>
        </div>
        <div className="mt-2 text-xs font-mono text-blue-700 tracking-wide text-center">
          {message}
        </div>
      </div>
    </>
  );
}