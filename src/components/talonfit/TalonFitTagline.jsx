// Required IP-positioning line — shown everywhere TalonFit results appear.
export default function TalonFitTagline({ className = "" }) {
  return (
    <p className={`text-[10px] font-semibold tracking-wide text-primary/80 ${className}`}>
      Powered by SiteHawk TalonFit® proprietary feasibility engine
    </p>
  );
}