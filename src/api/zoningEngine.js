/**
 * zoningEngine.js — SiteHawk/Base44 API wrapper for the MCP Zoning Engine.
 * Dev:  VITE_ZONING_API_URL=http://localhost:3701
 * Prod: VITE_ZONING_API_URL=https://<project>.supabase.co/functions/v1/zoning-proxy
 *
 * Usage:
 *   import { checkZoning } from "@/api/zoningEngine";
 *   const zone = await checkZoning({ address: "123 Main St, Milford, MI" });
 */
const BASE_URL = import.meta.env.VITE_ZONING_API_URL ?? "/api/zoning";

async function callTool(tool, input = {}) {
  const res = await fetch(`${BASE_URL}/${tool}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Zoning [${tool}]: ${res.status} – ${text}`);
  }
  return res.json();
}

export const checkZoning          = (params)       => callTool("checkZoning", params);
export const getZoningDetails     = (districtCode) => callTool("getZoningDetails", { districtCode });
export const listPermittedUses    = (districtCode) => callTool("listPermittedUses", { districtCode });
export const runZoningFeasibility = (params)       => callTool("runZoningFeasibility", params);
