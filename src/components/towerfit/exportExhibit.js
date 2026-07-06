/* Export helpers — SVG / PNG / PDF (client-side, standalone). */
import { jsPDF } from "jspdf";

const W = 1100, H = 850;

function serializeSvg(svgNode) {
  const clone = svgNode.cloneNode(true);
  clone.setAttribute("width", W);
  clone.setAttribute("height", H);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new XMLSerializer().serializeToString(clone);
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadSVG(svgNode, basename) {
  const str = serializeSvg(svgNode);
  download(new Blob([str], { type: "image/svg+xml" }), `${basename}.svg`);
}

export async function svgToPngDataUrl(svgNode, scaleFactor = 2.5) {
  const str = serializeSvg(svgNode);
  const svgBlob = new Blob([str], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Could not rasterize the exhibit SVG."));
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = W * scaleFactor;
    canvas.height = H * scaleFactor;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadPNG(svgNode, basename) {
  const dataUrl = await svgToPngDataUrl(svgNode);
  const res = await fetch(dataUrl);
  download(await res.blob(), `${basename}.png`);
}

export async function downloadPDF(svgNode, basename) {
  const dataUrl = await svgToPngDataUrl(svgNode);
  // landscape letter: 792 × 612 pt
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  pdf.addImage(dataUrl, "PNG", 0, 0, 792, 612);
  pdf.save(`${basename}.pdf`);
}