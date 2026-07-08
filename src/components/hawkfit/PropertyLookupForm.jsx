import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Loader2 } from "lucide-react";

// HawkFit Map — Target A lookup form: address, parcel ID, or coordinates.
export default function PropertyLookupForm({ onLookup, busy }) {
  const [mode, setMode] = useState("address");
  const [form, setForm] = useState({ address: "", state: "", county: "", parcelId: "", lat: "", lon: "" });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (mode === "address") onLookup({ address: form.address, state: form.state.toUpperCase().trim() });
    else if (mode === "parcel") onLookup({ parcelId: form.parcelId, state: form.state.toUpperCase().trim(), county: form.county });
    else onLookup({ lat: parseFloat(form.lat), lon: parseFloat(form.lon) });
  };

  const canSubmit =
    (mode === "address" && form.address && form.state) ||
    (mode === "parcel" && form.parcelId && form.state && form.county) ||
    (mode === "coords" && form.lat && form.lon);

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h3 className="font-heading font-semibold text-sm text-foreground">Target A Property Lookup</h3>
      <Tabs value={mode} onValueChange={setMode}>
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="address">Address</TabsTrigger>
          <TabsTrigger value="parcel">Parcel ID</TabsTrigger>
          <TabsTrigger value="coords">Lat / Lon</TabsTrigger>
        </TabsList>
      </Tabs>
      {mode === "address" && (
        <div className="grid grid-cols-[1fr_80px] gap-2">
          <Input placeholder="123 Main Street" value={form.address} onChange={set("address")} className="h-8" />
          <Input placeholder="TX" maxLength={2} value={form.state} onChange={set("state")} className="h-8" />
        </div>
      )}
      {mode === "parcel" && (
        <div className="grid grid-cols-3 gap-2">
          <Input placeholder="Parcel ID" value={form.parcelId} onChange={set("parcelId")} className="h-8" />
          <Input placeholder="County" value={form.county} onChange={set("county")} className="h-8" />
          <Input placeholder="TX" maxLength={2} value={form.state} onChange={set("state")} className="h-8" />
        </div>
      )}
      {mode === "coords" && (
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Latitude" value={form.lat} onChange={set("lat")} className="h-8" />
          <Input placeholder="Longitude" value={form.lon} onChange={set("lon")} className="h-8" />
        </div>
      )}
      <Button type="submit" disabled={!canSubmit || busy} className="w-full h-8">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        Find Property
      </Button>
    </form>
  );
}