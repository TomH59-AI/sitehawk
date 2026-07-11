// hawkFormImport — server-side fetch of an official agency form PDF for Hawk Forms →
// Document Intelligence handoff. The browser can't fetch fcc.gov/faa.gov PDFs directly
// (CORS), so this function pulls the PDF and returns it base64-encoded for the client
// to feed into the existing DocUploader → hawkDocAnalyze pipeline.
//
// SECURITY: strict exact-match allowlist. This is NOT a general URL fetcher — only the
// specific fillable form PDFs listed on the Hawk Forms page may be requested. Any other
// URL is rejected. Keep this list in sync with `fillable: true` items in
// src/components/hawkforms/hawkFormsData.js.
//
// Input (JSON): { url }
// Output (JSON): { fileName, contentType, base64 } or { error }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ALLOWED_FORM_URLS: Record<string, string> = {
  // url -> download file name
  'https://transition.fcc.gov/Forms/Form620/620.pdf': 'FCC_Form_620.pdf',
  'https://transition.fcc.gov/Forms/Form621/621.pdf': 'FCC_Form_621.pdf',
  'https://www.fcc.gov/sites/default/files/form854.pdf': 'FCC_Form_854.pdf',
  'https://transition.fcc.gov/Forms/Form601/601.pdf': 'FCC_Form_601.pdf',
};

const MAX_BYTES = 20 * 1024 * 1024; // 20MB hard cap
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { url } = (await req.json()) ?? {};
    const fileName = ALLOWED_FORM_URLS[String(url ?? '')];
    if (!fileName) {
      return Response.json({ error: 'This form is not enabled for auto-import.' }, { status: 400 });
    }

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': BROWSER_UA, Accept: 'application/pdf,*/*' },
        redirect: 'follow',
        signal: AbortSignal.timeout(25_000),
      });
    } catch (e) {
      console.warn(`hawkFormImport: fetch failed for ${url}: ${e}`);
      return Response.json(
        { error: 'The agency site did not respond. Download the form from the tab we opened and upload it manually.' },
        { status: 502 },
      );
    }

    if (!res.ok) {
      console.warn(`hawkFormImport: ${url} returned ${res.status}`);
      return Response.json(
        { error: `The agency site returned an error (HTTP ${res.status}). Download the form from the tab we opened and upload it manually.` },
        { status: 502 },
      );
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_BYTES) {
      return Response.json({ error: 'The downloaded file was empty or too large.' }, { status: 502 });
    }

    // Verify it's really a PDF (%PDF magic bytes) — agency error pages come back as HTML.
    const isPdf = buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
    if (!isPdf) {
      return Response.json(
        { error: 'The agency site returned something other than the PDF. Download the form from the tab we opened and upload it manually.' },
        { status: 502 },
      );
    }

    console.log(`hawkFormImport: served ${fileName} (${buf.length}B) to ${user.email}`);
    return Response.json({ fileName, contentType: 'application/pdf', base64: toBase64(buf) });
  } catch (err) {
    console.error('hawkFormImport error:', err);
    return Response.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
});
