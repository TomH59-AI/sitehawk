import { base44 } from "@/api/base44Client";

export async function getSatelliteSnapshot(payload) {
  return base44.functions.invoke("getSatelliteSnapshot", payload);
}
