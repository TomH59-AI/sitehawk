// Public (client-safe) runtime config.
// Mapbox public tokens (pk.*) are designed to ship in the browser bundle —
// env vars override the baked-in default when set at build time.
const MAPBOX_TOKEN =
  import.meta.env.VITE_MAPBOX_TOKEN ??
  import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ??
  "pk.eyJ1IjoidGhvZGdlcyIsImEiOiJjbXB0eHcxZWExNGU4MnNwdjkzM3JtZmtlIn0.VK_YXKxL8jJ5PcIpji4Qtg";

export async function getPublicConfig(_params) {
  return {
    data: {
      mapboxAccessToken: MAPBOX_TOKEN,
    },
  };
}
