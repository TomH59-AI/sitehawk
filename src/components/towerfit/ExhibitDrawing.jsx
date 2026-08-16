import { useMemo } from "react";
import rough from "roughjs";

const gen = rough.generator();
const DASH = 9999;

const OPTS = {
  parcel:   { roughness:1.6, stroke:"#1B2A4A", strokeWidth:2.2, fill:"none", seed:42 },
  envelope: { roughness:0.9, stroke:"#0891B2", strokeWidth:1.3, fill:"none", seed:7, strokeLineDash:[7,4] },
  fallZone: { roughness:1.0, stroke:"#D97706", strokeWidth:1.8, fill:"#FEF3C7", fillStyle:"hachure", fillWeight:0.7, hachureAngle:42, hachureGap:9, seed:13 },
  compound: { roughness:0.7, stroke:"#374151", strokeWidth:1.5, fill:"#E5E7EB", fillStyle:"hachure", fillWeight:0.5, hachureGap:5, seed:21 },
};

const T = {
  grid:0.0, parcel:0.4, dims:1.6, labels:2.3,
  envelope:3.0, fall:3.9, easement:4.8,
  compound:5.5, tower:6.1, north:6.6, stamp:7.2,
};

function RoughPaths({ drawable, delay, dur=0.95, pencil=true }) {
  const paths = gen.toPaths(drawable);
  return (
    <>
      {paths.map((p,i) =>
        p.stroke && p.stroke !== "none" ? (
          <path key={i} d={p.d}
            stroke={p.stroke} strokeWidth={p.strokeWidth}
            fill={p.fill && p.fill !== "none" ? p.fill : "none"}
            filter={pencil ? "url(#pencil)" : undefined}
            style={{
              strokeDasharray: DASH,
              strokeDashoffset: DASH,
              opacity: 0,
              animation: `skDraw ${dur}s ease-out ${(delay + i*0.13).toFixed(2)}s forwards`,
            }}
          />
        ) : p.fill && p.fill !== "none" ? (
          <path key={i} d={p.d} stroke="none" fill={p.fill}
            style={{ opacity:0, animation:`skFade 0.5s ease-out ${(delay+0.3).toFixed(2)}s forwards` }}
          />
        ) : null
      )}
    </>
  );
}

function AL({ x1,y1,x2,y2,delay,stroke="#1B2A4A",sw=1,da,pencil=true }) {
  return (
    <line x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={stroke} strokeWidth={sw}
      strokeDasharray={da||DASH} strokeDashoffset={DASH}
      filter={pencil ? "url(#pencil)" : undefined}
      style={{ opacity:0, animation:`skDraw 0.55s ease-out ${delay.toFixed(2)}s forwards` }}
    />
  );
}

function AT({ x,y,delay,anchor="middle",size=9,fill="#1B2A4A",rotate,children }) {
  return (
    <text x={x} y={y}
      textAnchor={anchor} dominantBaseline="central"
      fontFamily="'Courier New',Courier,monospace"
      fontSize={size} fill={fill}
      transform={rotate ? `rotate(${rotate},${x},${y})` : undefined}
      style={{ opacity:0, animation:`skFade 0.45s ease-out ${delay.toFixed(2)}s forwards` }}
    >
      {children}
    </text>
  );
}

export default function ExhibitDrawing({ model={}, x=0, y=0, w=540, h=400 }) {
  const {
    north_ft=140, south_ft=70, east_ft=405, west_ft=100,
    tower_height_ft=199, setback_ft=25,
    access_width_ft=30,
    compound_w_ft=60, compound_h_ft=50,
    fall_zone_ft,
  } = model;

  const fzFt = fall_zone_ft || tower_height_ft;
  const pad  = 36;

  const totalW = west_ft + east_ft;
  const totalH = north_ft + south_ft;
  const scale  = Math.min((w - pad*2)/totalW, (h - pad*2)/totalH);

  const cx = x + pad + west_ft  * scale;
  const cy = y + pad + north_ft * scale;

  const toX = ft => cx + ft * scale;
  const toY = ft => cy + ft * scale;

  const drawables = useMemo(() => {
    const parcelPts = [
      [toX(-west_ft),  toY(-north_ft)],
      [toX(east_ft),   toY(-north_ft)],
      [toX(east_ft),   toY(south_ft)],
      [toX(-west_ft),  toY(south_ft)],
    ];
    const sbW = (west_ft  - setback_ft) * scale;
    const sbN = (north_ft - setback_ft) * scale;
    const sbE = (east_ft  - setback_ft) * scale;
    const sbS = (south_ft - setback_ft) * scale;
    return {
      parcel:   gen.polygon(parcelPts, OPTS.parcel),
      envelope: gen.rectangle(cx-sbW, cy-sbN, sbW+sbE, sbN+sbS, OPTS.envelope),
      fallZone: gen.circle(cx, cy, fzFt*scale*2, OPTS.fallZone),
      compound: gen.rectangle(
        cx-(compound_w_ft/2)*scale, cy-(compound_h_ft/2)*scale,
        compound_w_ft*scale, compound_h_ft*scale, OPTS.compound
      ),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cx,cy,scale,west_ft,east_ft,north_ft,south_ft,
      setback_ft,fzFt,compound_w_ft,compound_h_ft]);

  const nW = toX(-west_ft);
  const nE = toX(east_ft);
  const nN = toY(-north_ft);
  const nS = toY(south_ft);
  const eaY = cy + 10;

  const gridLines = useMemo(() => {
    const lines=[];
    for (let gx=x; gx<x+w; gx+=20) lines.push({type:"v",v:gx});
    for (let gy=y; gy<y+h; gy+=20) lines.push({type:"h",v:gy});
    return lines;
  },[x,y,w,h]);

  return (
    <g>
      <style>{`
        @keyframes skDraw {
          from { stroke-dashoffset:${DASH}; opacity:1; }
          to   { stroke-dashoffset:0;       opacity:1; }
        }
        @keyframes skFade {
          from { opacity:0; } to { opacity:1; }
        }
        @keyframes skStamp {
          0%   { opacity:0; transform:rotate(-12deg) scale(1.5); }
          55%  { opacity:1; transform:rotate(-12deg) scale(0.93); }
          100% { opacity:.88; transform:rotate(-12deg) scale(1); }
        }
      `}</style>

      <defs>
        <filter id="pencil" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="4" seed="8" result="noise"/>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.4" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
        <filter id="stamp" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="turbulence" baseFrequency="0.04" numOctaves="5" seed="3" result="noise"/>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3"/>
        </filter>
      </defs>

      {/* Paper background */}
      <rect x={x} y={y} width={w} height={h} fill="#FDFAF4" rx={3}
        style={{ opacity:0, animation:`skFade 0.3s ease-out ${T.grid}s forwards` }}
      />

      {/* Graph grid */}
      {gridLines.map((gl,i) =>
        gl.type==="v"
          ? <line key={i} x1={gl.v} y1={y} x2={gl.v} y2={y+h}
              stroke="#C8DDEE" strokeWidth={0.35}
              style={{ opacity:0, animation:`skFade 0.25s ease-out ${T.grid+0.05}s forwards` }}/>
          : <line key={i} x1={x} y1={gl.v} x2={x+w} y2={gl.v}
              stroke="#C8DDEE" strokeWidth={0.35}
              style={{ opacity:0, animation:`skFade 0.25s ease-out ${T.grid+0.05}s forwards` }}/>
      )}

      {/* Parcel boundary */}
      <RoughPaths drawable={drawables.parcel} delay={T.parcel} dur={1.1}/>

      {/* Dimension lines N */}
      <AL x1={nW} y1={nN-14} x2={nE} y2={nN-14} delay={T.dims} stroke="#555" sw={0.8}/>
      <AL x1={nW} y1={nN-18} x2={nW} y2={nN-10} delay={T.dims+0.1} stroke="#555" sw={0.8}/>
      <AL x1={nE} y1={nN-18} x2={nE} y2={nN-10} delay={T.dims+0.1} stroke="#555" sw={0.8}/>
      {/* Dimension lines S */}
      <AL x1={nW} y1={nS+14} x2={nE} y2={nS+14} delay={T.dims+0.15} stroke="#555" sw={0.8}/>
      <AL x1={nW} y1={nS+10} x2={nW} y2={nS+18} delay={T.dims+0.2} stroke="#555" sw={0.8}/>
      <AL x1={nE} y1={nS+10} x2={nE} y2={nS+18} delay={T.dims+0.2} stroke="#555" sw={0.8}/>
      {/* Dimension lines W */}
      <AL x1={nW-14} y1={nN} x2={nW-14} y2={nS} delay={T.dims+0.25} stroke="#555" sw={0.8}/>
      <AL x1={nW-18} y1={nN} x2={nW-10} y2={nN} delay={T.dims+0.3} stroke="#555" sw={0.8}/>
      <AL x1={nW-18} y1={nS} x2={nW-10} y2={nS} delay={T.dims+0.3} stroke="#555" sw={0.8}/>
      {/* Dimension lines E */}
      <AL x1={nE+14} y1={nN} x2={nE+14} y2={nS} delay={T.dims+0.35} stroke="#555" sw={0.8}/>
      <AL x1={nE+10} y1={nN} x2={nE+18} y2={nN} delay={T.dims+0.4} stroke="#555" sw={0.8}/>
      <AL x1={nE+10} y1={nS} x2={nE+18} y2={nS} delay={T.dims+0.4} stroke="#555" sw={0.8}/>

      {/* Dimension labels */}
      <AT x={(nW+nE)/2} y={nN-22} delay={T.labels} size={8} fill="#374151">{(west_ft+east_ft).toFixed(0)} ft</AT>
      <AT x={(nW+nE)/2} y={nS+22} delay={T.labels+0.1} size={8} fill="#374151">{(west_ft+east_ft).toFixed(0)} ft</AT>
      <AT x={nW-22} y={(nN+nS)/2} delay={T.labels+0.15} size={8} fill="#374151" rotate={-90}>{(north_ft+south_ft).toFixed(0)} ft</AT>
      <AT x={nE+22} y={(nN+nS)/2} delay={T.labels+0.2} size={8} fill="#374151" rotate={90}>{(north_ft+south_ft).toFixed(0)} ft</AT>

      {/* Buildable envelope */}
      <RoughPaths drawable={drawables.envelope} delay={T.envelope} dur={0.8}/>
      <AT x={cx} y={nN-setback_ft*scale-8} delay={T.envelope+0.5} size={7.5} fill="#0891B2">
        BUILDABLE ENV. ({setback_ft}ft SETBACK)
      </AT>

      {/* Fall zone */}
      <RoughPaths drawable={drawables.fallZone} delay={T.fall} dur={1.0}/>
      <AT x={cx+fzFt*scale*0.68} y={cy-fzFt*scale*0.68} delay={T.fall+0.8} size={7.5} fill="#B45309">FALL ZONE</AT>
      <AT x={cx+fzFt*scale*0.68} y={cy-fzFt*scale*0.68+11} delay={T.fall+0.9} size={7} fill="#B45309">r = {fzFt} ft</AT>

      {/* Access easement */}
      <AL x1={nW} y1={eaY-(access_width_ft/2)*scale} x2={cx} y2={eaY-(access_width_ft/2)*scale}
        delay={T.easement} stroke="#6B7280" sw={0.9} da="4 3"/>
      <AL x1={nW} y1={eaY+(access_width_ft/2)*scale} x2={cx} y2={eaY+(access_width_ft/2)*scale}
        delay={T.easement+0.1} stroke="#6B7280" sw={0.9} da="4 3"/>
      <AT x={(nW+cx)/2} y={eaY-(access_width_ft/2)*scale-9}
        delay={T.easement+0.4} size={7} fill="#6B7280">
        ACCESS EASEMENT ({access_width_ft}ft)
      </AT>

      {/* Compound */}
      <RoughPaths drawable={drawables.compound} delay={T.compound} dur={0.6}/>
      <AT x={cx} y={cy+(compound_h_ft/2)*scale+10} delay={T.compound+0.5} size={7} fill="#374151">
        COMPOUND {compound_w_ft}x{compound_h_ft}ft
      </AT>

      {/* Tower marker */}
      <path d={`M${cx},${cy-10} L${cx-8},${cy+6} L${cx+8},${cy+6} Z`}
        fill="#EF4444" stroke="#991B1B" strokeWidth={1.2} filter="url(#pencil)"
        style={{ opacity:0, animation:`skFade 0.4s ease-out ${T.tower}s forwards` }}
      />
      <AT x={cx+14} y={cy} delay={T.tower+0.2} size={8.5} fill="#991B1B" anchor="start">
        ▲ TOWER {tower_height_ft}ft AGL
      </AT>

      {/* North arrow */}
      <g style={{ opacity:0, animation:`skFade 0.5s ease-out ${T.north}s forwards` }}>
        <line x1={x+w-26} y1={y+h-18} x2={x+w-26} y2={y+h-40} stroke="#1B2A4A" strokeWidth={1.2}/>
        <path d={`M${x+w-26},${y+h-42} L${x+w-30},${y+h-34} L${x+w-22},${y+h-34} Z`} fill="#1B2A4A"/>
        <text x={x+w-26} y={y+h-12} textAnchor="middle"
          fontFamily="'Courier New',Courier,monospace"
          fontSize={9} fill="#1B2A4A" fontWeight="700">N</text>
      </g>

      {/* Scale bar */}
      <g style={{ opacity:0, animation:`skFade 0.5s ease-out ${T.north+0.2}s forwards` }}>
        {[0,1,2].map(i=>(
          <rect key={i} x={x+10+i*50*scale} y={y+h-18}
            width={50*scale} height={6}
            fill={i%2===0?"#1B2A4A":"#FDFAF4"} stroke="#1B2A4A" strokeWidth={0.6}/>
        ))}
        <text x={x+10} y={y+h-22} fontFamily="'Courier New',Courier,monospace" fontSize={7.5} fill="#374151">0</text>
        <text x={x+10+50*scale} y={y+h-22} fontFamily="'Courier New',Courier,monospace" fontSize={7.5} fill="#374151" textAnchor="middle">50ft</text>
        <text x={x+10+100*scale} y={y+h-22} fontFamily="'Courier New',Courier,monospace" fontSize={7.5} fill="#374151" textAnchor="middle">100ft</text>
        <text x={x+10+150*scale} y={y+h-22} fontFamily="'Courier New',Courier,monospace" fontSize={7.5} fill="#374151" textAnchor="middle">150ft</text>
      </g>

      {/* SKETCH COMPLETE stamp */}
      <g transform={`translate(${cx-60},${cy-20}) rotate(-12,60,20)`}
        style={{ opacity:0, animation:`skStamp 0.6s cubic-bezier(0.22,1,0.36,1) ${T.stamp}s forwards` }}>
        <rect x={0} y={2} width={120} height={36} rx={4}
          fill="none" stroke="#DC2626" strokeWidth={2.5} filter="url(#stamp)"/>
        <text x={60} y={14} textAnchor="middle" dominantBaseline="central"
          fontFamily="'Courier New',Courier,monospace"
          fontSize={10} fill="#DC2626" fontWeight="700" letterSpacing="2"
          filter="url(#stamp)">SKETCH COMPLETE</text>
        <text x={60} y={28} textAnchor="middle" dominantBaseline="central"
          fontFamily="'Courier New',Courier,monospace"
          fontSize={7.5} fill="#DC2626" filter="url(#stamp)">SiteHawk™ AI Engineering</text>
      </g>
    </g>
  );
}
