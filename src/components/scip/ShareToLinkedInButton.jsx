import { Linkedin } from "lucide-react";

// Opens LinkedIn's share dialog for the current page URL. Purely outbound — does
// not read or alter any SCIP data. Hidden when printing.
export default function ShareToLinkedInButton({ url }) {
  const shareUrl = url || (typeof window !== "undefined" ? window.location.href : "");
  const href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="no-print inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0A66C2] hover:bg-[#004182] text-white text-sm font-semibold transition-colors"
      title="Share this SCIP on LinkedIn"
    >
      <Linkedin className="w-4 h-4" /> Share on LinkedIn
    </a>
  );
}