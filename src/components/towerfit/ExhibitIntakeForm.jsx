/* Intake form — the FIGMA-SKILL input schema. Defaults are stated inline. */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

const Field = ({ label, children }) => (
  <div className="space-y-1">
    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
    {children}
  </div>
);

const Sel = ({ value, onChange, options }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
  >
    {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </select>
);

export default function ExhibitIntakeForm({ config, onChange }) {
  const set = (patch) => onChange({ ...config, ...patch });
  const setNested = (key, patch) => onChange({ ...config, [key]: { ...config[key], ...patch } });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Site name"><Input value={config.siteName} onChange={(e) => set({ siteName: e.target.value })} /></Field>
        <Field label="Prepared for (landlord)"><Input value={config.preparedFor} onChange={(e) => set({ preparedFor: e.target.value })} placeholder="Optional" /></Field>
        <Field label="Jurisdiction"><Input value={config.jurisdiction} onChange={(e) => set({ jurisdiction: e.target.value })} placeholder="Optional" /></Field>
        <Field label="Date"><Input type="date" value={config.date} onChange={(e) => set({ date: e.target.value })} /></Field>
      </div>

      <div className="rounded-lg border border-border p-3 space-y-3">
        <Field label="Property shape">
          <Sel value={config.shape} onChange={(v) => set({ shape: v })} options={[["rectangle", "Rectangle"], ["polygon", "Polygon (vertices)"]]} />
        </Field>
        {config.shape === "rectangle" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Width E–W (ft)"><Input type="number" value={config.widthFt} onChange={(e) => set({ widthFt: e.target.value })} /></Field>
            <Field label="Depth N–S (ft)"><Input type="number" value={config.depthFt} onChange={(e) => set({ depthFt: e.target.value })} /></Field>
          </div>
        ) : (
          <Field label="Vertices — one “x,y” (ft) per line">
            <Textarea rows={4} value={config.polygonText} onChange={(e) => set({ polygonText: e.target.value })} placeholder={"0,0\n400,0\n420,300\n0,350"} className="font-mono text-xs" />
          </Field>
        )}
      </div>

      <div className="rounded-lg border border-border p-3 grid grid-cols-2 gap-3">
        <Field label="Tower height (ft)"><Input type="number" value={config.tower.heightFt} onChange={(e) => setNested("tower", { heightFt: e.target.value })} /></Field>
        <Field label="Tower type">
          <Sel value={config.tower.type} onChange={(v) => setNested("tower", { type: v })} options={[["Monopole", "Monopole"], ["Lattice", "Lattice"], ["Guyed", "Guyed"], ["Stealth", "Stealth"]]} />
        </Field>
        <Field label="Tower location">
          <Sel value={config.tower.location} onChange={(v) => setNested("tower", { location: v })}
            options={[["center", "Center of parcel"], ["auto", "Auto (center of buildable envelope)"], ["north", "North"], ["south", "South"], ["east", "East"], ["west", "West"], ["custom", "Custom x,y"]]} />
        </Field>
        {config.tower.location === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="X (ft)"><Input type="number" value={config.tower.customX} onChange={(e) => setNested("tower", { customX: e.target.value })} /></Field>
            <Field label="Y (ft)"><Input type="number" value={config.tower.customY} onChange={(e) => setNested("tower", { customY: e.target.value })} /></Field>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border p-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Compound width (ft)"><Input type="number" value={config.compound.widthFt} onChange={(e) => setNested("compound", { widthFt: e.target.value })} /></Field>
          <Field label="Compound depth (ft)"><Input type="number" value={config.compound.depthFt} onChange={(e) => setNested("compound", { depthFt: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Field label="Front / N"><Input type="number" value={config.setbacks.front} onChange={(e) => setNested("setbacks", { front: e.target.value })} /></Field>
          <Field label="Rear / S"><Input type="number" value={config.setbacks.rear} onChange={(e) => setNested("setbacks", { rear: e.target.value })} /></Field>
          <Field label="Left / W"><Input type="number" value={config.setbacks.left} onChange={(e) => setNested("setbacks", { left: e.target.value })} /></Field>
          <Field label="Right / E"><Input type="number" value={config.setbacks.right} onChange={(e) => setNested("setbacks", { right: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fall zone rule">
            <Sel value={config.fallZone.rule} onChange={(v) => setNested("fallZone", { rule: v })}
              options={[["100", "100% of tower height (default)"], ["110", "110% of tower height"], ["custom", "Custom radius"]]} />
          </Field>
          {config.fallZone.rule === "custom" && (
            <Field label="Custom radius (ft)"><Input type="number" value={config.fallZone.customFt} onChange={(e) => setNested("fallZone", { customFt: e.target.value })} /></Field>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border p-3 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Access easement</Label>
          <Switch checked={config.easement.enabled} onCheckedChange={(v) => setNested("easement", { enabled: v })} />
        </div>
        {config.easement.enabled && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Width (ft)"><Input type="number" value={config.easement.widthFt} onChange={(e) => setNested("easement", { widthFt: e.target.value })} /></Field>
            <Field label="From">
              <Sel value={config.easement.from} onChange={(v) => setNested("easement", { from: v })}
                options={[["south", "South"], ["north", "North"], ["east", "East"], ["west", "West"]]} />
            </Field>
          </div>
        )}
      </div>

      <Field label="Notes (one per line — printed in the sidebar)">
        <Textarea rows={3} value={config.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Landlord retains farm access on east side" />
      </Field>
    </div>
  );
}