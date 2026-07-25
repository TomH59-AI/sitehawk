// Required IP-positioning line — shown everywhere TalonReach results appear.
export default function TalonReachTagline({ className = "" }) {
  return (
    <p className={`text-[10px] font-semibold tracking-wide text-primary/80 ${className}`}>
      Powered by SiteHawk TalonReach® AI RF advisor
    </p>
  );
}