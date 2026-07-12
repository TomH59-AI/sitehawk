import { HelpCircle } from "lucide-react";

export default function FloatingInstructionsButton() {
  const openInstructions = () => {
    if (typeof window.__sarfCoachStart === "function") window.__sarfCoachStart();
  };

  return (
    <button
      onClick={openInstructions}
      className="fixed left-4 bottom-24 lg:left-auto lg:right-6 lg:bottom-24 z-40 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-card px-4 py-3 text-sm font-bold text-foreground shadow-xl hover:bg-primary/10 transition-colors"
      aria-label="Open Site Search instructions"
      title="Open instructions"
    >
      <HelpCircle className="w-5 h-5 text-primary" />
      Instructions
    </button>
  );
}