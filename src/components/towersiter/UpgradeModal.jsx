import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Rocket } from "lucide-react";

// HawkPerch paywall modal — fired when the placement engine is gated
// (free tier on a real parcel, or HawkSite run #4 this month).
export default function UpgradeModal({ open, onClose, reason }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <Rocket className="w-5 h-5 text-blue-500" /> Upgrade to keep siting
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{reason}</p>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
          <li><b>HawkVision</b> — unlimited sitings, clean exports, PE fall-radius toggle, residential separation check.</li>
          <li><b>HawkCommand</b> — everything plus batch siting from a scan.</li>
        </ul>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Not now</Button>
          <Button size="sm" asChild>
            <Link to="/pricing">View plans →</Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}