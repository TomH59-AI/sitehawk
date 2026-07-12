/**
 * CRM page — Deal Pipeline removed (to be rebuilt later).
 * For now this page showcases the "Don't Miss These Time Savers" index.
 */
import TimeSaversIndex from "@/components/crm/TimeSaversIndex";

export default function CRM() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading font-bold text-2xl md:text-3xl text-foreground">
          ⏱️ Time Savers
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          The tools that save you hours, cut the stress, and keep you on top of your game.
        </p>
      </div>
      <TimeSaversIndex />
    </div>
  );
}