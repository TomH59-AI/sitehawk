import { motion } from "framer-motion";
import HawkIcon from "@/components/HawkIcon";

// One full-screen pitch-deck slide — big type, staggered bullet reveal.
export default function DeckSlide({ slide, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 60 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -60 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="flex-1 flex flex-col justify-center px-8 md:px-24 max-w-5xl mx-auto w-full"
    >
      <div className="flex items-center gap-3 mb-6">
        <HawkIcon size={40} />
        <span className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-400">
          {slide.kicker}
        </span>
      </div>

      <h1 className="font-heading font-bold text-5xl md:text-7xl text-white leading-tight">
        {slide.title}
      </h1>
      <p className="mt-3 text-xl md:text-2xl text-cyan-300/90 font-medium">
        {slide.subtitle}
      </p>

      <ul className="mt-10 space-y-4">
        {slide.bullets.map((b, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 + i * 0.18, duration: 0.4 }}
            className="flex items-start gap-3 text-slate-200 text-lg md:text-xl"
          >
            <span className="mt-2 w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
            <span>{b}</span>
          </motion.li>
        ))}
      </ul>

      <div className="mt-12 text-slate-500 text-sm font-mono">
        {String(index + 1).padStart(2, "0")}
      </div>
    </motion.div>
  );
}