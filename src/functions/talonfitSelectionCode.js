import { base44 } from "@/api/base44Client";
export async function talonfitSelectionCode(payload) {
  return base44.functions.invoke("talonfitSelectionCode", payload);
}
