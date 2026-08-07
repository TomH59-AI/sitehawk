import { base44 } from "@/api/base44Client";
export async function codehawkHunt(payload) {
  return base44.functions.invoke("codehawkHunt", payload);
}
