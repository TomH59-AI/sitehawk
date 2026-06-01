import { useState } from "react";
import { scipShare } from "@/functions/scipShare";
import { Share2, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

// Creates a public read-only share link for a SCIP (snapshot of candidate data).
export default function ShareSCIPButton({ candidate, ordinance, searchCenter, agent }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  async function share() {
    if (!candidate || !searchCenter) { toast.error("SCIP isn't ready to share yet."); return; }
    setBusy(true);
    try {
      const res = await scipShare({
        action: "create", candidate, ordinance, searchCenter, agent,
        origin: window.location.origin,
      });
      const data = res?.data ?? res;
      if (data?.error) throw new Error(data.error);
      setUrl(data.share_url);
      setOpen(true);
    } catch (err) {
      toast.error(err.message || "Could not create share link");
    } finally {
      setBusy(false);
    }
  }

  function copy() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <Button onClick={share} disabled={busy} variant="outline">
        {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Share2 className="w-4 h-4 mr-2" />}
        Share
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share this SCIP</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Anyone with this link can view this Site Candidate Information Package — read-only, no login required.
          </p>
          <div className="flex items-center gap-2">
            <Input readOnly value={url} className="text-xs" />
            <Button onClick={copy} size="icon" variant="secondary">
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}