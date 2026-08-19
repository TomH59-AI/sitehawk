import { base44 } from "@/api/base44Client";

export async function copernicusRfLayer(payload) {
  return base44.functions.invoke("copernicusRfLayer", payload);
}
