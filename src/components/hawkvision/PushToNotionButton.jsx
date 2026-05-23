/**
 * PushToNotionButton — pushes a single Hawk Vision target's feasibility
 * report into the Notion Master Zoning workspace as a new child page.
 *
 * Shows idle → loading → success (with link to the created Notion page)
 * → error states inline. Used inside HawkVisionTargetCard.
 */

import { useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { notionPushTarget } from "@/functions/notionPushTarget";

// Inline Notion glyph so we don't pull a new icon dep.
function NotionIcon({ className = "w-4 h-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M4.5 3.6 15 2.8c1.3-.1 1.6.1 2.4.7l3.3 2.3c.5.4.7.5.7 1v13.8c0 .9-.3 1.5-1.5 1.6l-12.1.7c-.9 0-1.3-.1-1.8-.7L3.5 19.3c-.5-.7-.7-1.2-.7-1.9V5.1c0-.8.3-1.4 1.7-1.5Zm10.8 1-9.9.8c-.7.1-.9.4-.6.7l1.6 1.2c.4.3.7.4 1.3.3l9.6-.7c.4 0 .2-.4 0-.5l-1.8-1.3c-.2-.2-.4-.5-.2-.5ZM5.6 8.3v10.4c0 .6.3.8.9.7l10.6-.6c.6 0 .7-.4.7-.9V7.6c0-.5-.2-.7-.6-.7l-11 .6c-.5 0-.6.3-.6.8Zm10.5.4c.1.3 0 .6-.3.6l-.5.1V17c-.4.2-.8.4-1.2.4-.6 0-.8-.2-1.2-.7l-3.4-5.4v5.2l1 .2s0 .6-.8.6l-2.3.1c-.1-.1 0-.5.2-.6l.6-.2v-7l-.9-.1c-.1-.3.1-.7.5-.7l2.5-.2 3.5 5.3V9.4l-.9-.1c-.1-.4.2-.6.5-.7l2.7-.1Z"/>
    </svg>
  );
}

export default function PushToNotionButton({ target, searchCenter }) {
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handlePush() {
    setStatus("loading");
    setError(null);
    try {
      const res = await notionPushTarget({ target, search_center: searchCenter });
      const data = res?.data || res;
      if (data?.error) throw new Error(data.error);
      setResult(data);
      setStatus("success");
    } catch (e) {
      setError(e.message || "Push to Notion failed");
      setStatus("error");
    }
  }

  if (status === "success" && result?.notion_url) {
    return (
      <a
        href={result.notion_url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-mono font-bold text-[11px] tracking-[0.15em] bg-emerald-400 text-[#0a0e17] hover:bg-emerald-300 transition-colors"
      >
        <CheckCircle2 className="w-4 h-4" /> PUSHED — OPEN IN NOTION <ExternalLink className="w-3 h-3" />
      </a>
    );
  }

  return (
    <div className="mt-2 w-full">
      <button
        onClick={handlePush}
        disabled={status === "loading"}
        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-mono font-bold text-[11px] tracking-[0.15em] bg-white text-[#0a0e17] hover:bg-slate-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {status === "loading" ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> PUSHING TO NOTION…
          </>
        ) : (
          <>
            <NotionIcon className="w-4 h-4" /> PUSH TO NOTION ZONING DB
          </>
        )}
      </button>
      {status === "error" && (
        <div className="mt-1.5 flex items-start gap-1.5 text-[10px] text-red-400 font-mono">
          <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}
    </div>
  );
}