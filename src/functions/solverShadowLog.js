import { base44 } from "@/api/base44Client";
export async function solverShadowLog(payload) {
  return base44.functions.invoke("solverShadowLog", payload);
}
