import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import TowerPlacementPanel from "./TowerPlacementPanel";

export default function TowerPlacementModal({ open, onClose, parcel }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tower Placement Analysis</DialogTitle>
          <DialogDescription>
            {parcel?.site_name || parcel?.parcel_address || "—"}
            {parcel?.parcel_id && <span className="ml-2 font-mono text-xs">· Parcel {parcel.parcel_id}</span>}
          </DialogDescription>
        </DialogHeader>
        <TowerPlacementPanel parcel={parcel} />
      </DialogContent>
    </Dialog>
  );
}