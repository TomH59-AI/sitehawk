import { getPublicConfig } from "@/functions/getPublicConfig";

let cachedConfig = null;

export async function loadPublicConfig() {
  if (cachedConfig) return cachedConfig;
  const response = await getPublicConfig({});
  const config = response?.data || response || {};
  // Do not permanently cache an empty Mapbox response; a corrected Base44
  // secret should take effect on Retry without requiring a full browser reset.
  if (config.mapboxAccessToken) cachedConfig = config;
  return config;
}