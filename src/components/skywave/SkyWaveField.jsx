import { SKYWAVE } from "@/lib/skywave";

export default function SkyWaveField({ label, optional, error, children, helper }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: SKYWAVE.navy }}>
        {label}
        {optional && <span className="italic font-normal normal-case ml-1" style={{ color: SKYWAVE.muted }}>(optional)</span>}
      </label>
      {children}
      {helper && !error && <span className="text-[11px]" style={{ color: SKYWAVE.muted }}>{helper}</span>}
      {error && <span className="text-[11px] font-medium text-red-600">{error}</span>}
    </div>
  );
}