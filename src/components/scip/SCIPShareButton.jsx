/**
 * SCIPShareButton — opens a dialog where the user can:
 *   1. Copy a public read-only share URL
 *   2. Email that URL to one or more recipients
 *
 * Backed by the scipShare backend function + SCIPShare entity.
 */

import { useState } from "react";
import { Share2, Copy, Mail, Check, Loader2 } from "lucide-react";
import { scipShare } from "@/functions/scipShare";

export default function SCIPShareButton({ candidate, ordinance, searchCenter, agent }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [recipients, setRecipients] = useState("");
  const [emailStatus, setEmailStatus] = useState(null);
  const [error, setError] = useState(null);

  const createLink = async (emailsArr) => {
    setLoading(true);
    setError(null);
    try {
      const res = await scipShare({
        action: "create",
        candidate,
        ordinance,
        searchCenter,
        agent,
        recipients: emailsArr,
        origin: window.location.origin,
      });
      setShareUrl(res.data?.share_url || "");
      if (emailsArr?.length) {
        setEmailStatus(`Sent to ${res.data?.emailed?.length || 0} of ${emailsArr.length} recipient(s)`);
      }
    } catch (e) {
      setError(e.message || "Failed to create share link");
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    if (!shareUrl) createLink([]);
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSend = async () => {
    const emails = recipients
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes("@"));
    if (!emails.length) {
      setError("Enter at least one valid email address");
      return;
    }
    await createLink(emails);
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-[#0a0e17] font-bold text-sm transition-colors"
      >
        <Share2 className="w-4 h-4" />
        Share SCIP
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#0C1B2E] text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Share2 className="w-5 h-5 text-cyan-400" />
                <span className="font-heading font-bold">Share this SCIP</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-white text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Shareable link */}
              <div>
                <div className="text-xs font-semibold text-foreground mb-1.5">
                  Public read-only link
                </div>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={loading ? "Generating link..." : shareUrl}
                    className="flex-1 px-3 py-2 rounded-lg border border-border bg-secondary text-sm font-mono text-foreground"
                  />
                  <button
                    onClick={handleCopy}
                    disabled={!shareUrl || loading}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Anyone with this link can view the SCIP — no login required.
                </p>
              </div>

              {/* Email */}
              <div className="border-t border-border pt-4">
                <div className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  Email this link
                </div>
                <textarea
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  placeholder="recipient1@example.com, recipient2@example.com"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
                  rows={2}
                />
                <button
                  onClick={handleSend}
                  disabled={loading || !recipients.trim()}
                  className="mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-[#0a0e17] font-bold text-sm transition-colors disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" /> Send Email
                    </>
                  )}
                </button>
                {emailStatus && (
                  <div className="mt-2 text-xs text-green-600 font-semibold">{emailStatus}</div>
                )}
              </div>

              {error && (
                <div className="text-xs text-red-500 font-semibold border border-red-500/30 bg-red-500/10 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}