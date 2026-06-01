import { useState } from "react";
import { hawkDocShare } from "@/functions/hawkDocShare";
import { Share2, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

// Creates / fetches a public read-only share link for a Hawk application.
export default function DocShareButton({ document, size = "sm", variant = "outline" }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  async function share() {
    setBusy(true);
    try {
      const res = await hawkDocShare({ action: "create", documentId: document.id, origin: window.location.origin });
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
      <Button onClick={share} disabled={busy} size={size} variant={variant}>
        {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Share2 className="w-4 h-4 mr-2" />}
        Share
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share this application</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Anyone with this link can view and print the completed application — read-only, no login required.
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