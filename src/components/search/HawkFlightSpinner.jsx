import { motion } from "framer-motion";

const ICON_URL = "https://media.base44.com/images/public/69dd277f9504047a559d5834/8441edcc4_logo-skyhawk.png";

// Section One loading indicator — the SkyWave hawk flying in place (gentle
// hover bob + subtle wing-flap scale). No progress bars, no step text.
export default function HawkFlightSpinner({ label = "Generating SARF map…", size = 72 }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <motion.img
        src={ICON_URL}
        width={size}
        height={size}
        alt="SiteHawk"
        className="rounded-xl drop-shadow-[0_0_14px_rgba(37,99,235,0.6)]"
        style={{ objectFit: "contain" }}
        animate={{ y: [0, -10, 0], scaleX: [1, 0.92, 1] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
      />
      <p className="text-sm font-heading font-medium text-muted-foreground">{label}</p>
    </div>
  );
}