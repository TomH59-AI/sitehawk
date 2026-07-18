export const usgsLayers = [
  {
    id: 'usgs-topo',
    type: 'raster',
    source: {
      type: 'raster',
      tiles: [
        'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256
    },
    paint: { 'raster-opacity': 1.0 },
    layout: { visibility: 'visible' }
  },

  {
    id: 'usgs-imagery',
    type: 'raster',
    source: {
      type: 'raster',
      tiles: [
        'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256
    },
    paint: { 'raster-opacity': 0.85 },
    layout: { visibility: 'none' }
  },

  {
    id: 'usgs-hydro',
    type: 'raster',
    source: {
      type: 'raster',
      tiles: [
        'https://basemap.nationalmap.gov/arcgis/rest/services/USGSHydro/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256
    },
    paint: { 'raster-opacity': 0.7 },
    layout: { visibility: 'none' }
  },

  {
    id: 'usgs-relief',
    type: 'raster',
    source: {
      type: 'raster',
      tiles: [
        'https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedRelief/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256
    },
    paint: { 'raster-opacity': 0.6 },
    layout: { visibility: 'none' }
  },

  {
    id: 'usgs-contours',
    type: 'raster',
    source: {
      type: 'raster',
      tiles: [
        'https://basemap.nationalmap.gov/arcgis/rest/services/USGSContours/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256
    },
    paint: { 'raster-opacity': 1.0 },
    layout: { visibility: 'none' }
  }
];