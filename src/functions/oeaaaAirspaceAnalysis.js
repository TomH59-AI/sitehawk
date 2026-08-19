import { base44 } from "@/api/base44Client";

export async function oeaaaAirspaceAnalysis(payload) {
  return base44.functions.invoke("oeaaaAirspaceAnalysis", payload);
}
