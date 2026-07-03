import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { deleteAccount } from "@/functions/deleteAccount";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function DeleteAccountSection() {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await deleteAccount({});
      if (res.data?.success) {
        base44.auth.logout("/");
      } else {
        setError(res.data?.error || "Could not delete account.");
        setDeleting(false);
      }
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Could not delete account.");
      setDeleting(false);
    }
  };

  return (
    <div className="bg-card border border-destructive/30 rounded-2xl p-6 space-y-3">
      <div className="font-semibold text-sm text-destructive flex items-center gap-2">
        <Trash2 className="w-4 h-4" /> Delete Account
      </div>
      <p className="text-xs text-muted-foreground">
        Permanently delete your SiteHawk account. This cannot be undone. If you have an active
        subscription, cancel it first from the billing portal above.
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm" disabled={deleting} className="gap-2">
            <Trash2 className="w-4 h-4" />
            {deleting ? "Deleting…" : "Delete my account"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove your account and sign you out. Your saved searches,
              SCIPs, and CRM data will no longer be accessible. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, delete my account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}