import { base44 } from "@/api/base44Client";
export async function codehawkStats(payload) {
  return base44.functions.invoke("codehawkStats", payload || {});
}
