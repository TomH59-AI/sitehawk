import { motion } from "framer-motion";
import { Check, Lock } from "lucide-react";
import { PIPELINE_STEPS, usePipeline } from "@/lib/PipelineContext";

const HAWK_SRC = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/c2e9c4e90_HAWKAImoreurban.png";

// Sidebar progress tracker that mirrors the Site Search pipeline. The flying
// hawk hovers next to whichever section is currently running on screen.
export default function PipelineSidebarNav() {
  const { activeStep, completedSteps } = usePipeline();
  const activeIndex = PIPELINE_STEPS.findIndex((s) => s.key === activeStep);

  return (
    <div className="px-3 py-3 rounded-xl bg-sidebar-accent/40 border border-sidebar-border">
      <div className="text-[10px] font-mono tracking-[0.25em] text-primary mb-2 px-1">
        SITE SEARCH PIPELINE
      </div>
      <div className="space-y-0.5">
        {PIPELINE_STEPS.map((step, idx) => {
          const isDone = completedSteps.includes(step.key);
          const isActive = step.key === activeStep;
          // Locked = no active step yet, or this step is beyond the active one and not done.
          const isLocked = !isDone && !isActive && (activeIndex === -1 || idx > activeIndex);

          return (
            <div
              key={step.key}
              className={`relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? "bg-primary/15 text-primary"
                  : isDone
                  ? "text-foreground"
                  : "text-muted-foreground/60"
              }`}
            >
              {/* Step indicator */}
              <span
                className={`flex items-center justify-center w-5 h-5 rounded-full shrink-0 text-[10px] font-bold ${
                  isDone
                    ? "bg-emerald-500 text-white"
                    : isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {isDone ? <Check className="w-3 h-3" /> : isLocked ? <Lock className="w-2.5 h-2.5" /> : idx + 1}
              </span>

              <span className="flex-1 truncate">{step.label}</span>

              {/* Flying hawk perches on the active section */}
              {isActive && (
                <motion.img
                  src={HAWK_SRC}
                  alt=""
                  className="w-6 h-6 object-contain drop-shadow"
                  animate={{ y: [0, -4, 0], rotate: [-3, 3, -3] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}