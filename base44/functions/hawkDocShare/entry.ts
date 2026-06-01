// hawkDocShare — create + retrieve a public, read-only snapshot of a filled
// Hawk Document Intelligence application.
//
// POST body shapes:
//   { action: "create", documentId, origin? }
//     → stamps a share_id on the HawkDocument (owner-authed) and returns
//       { share_id, share_url }
//
//   { action: "get", share_id }
//     → returns the document snapshot (public, no auth required) so anyone
//       with the link can view/print the completed application.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function randomId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 12);
}

// Strip the file URL — a shared application shouldn't leak the raw upload.
function publicShape(doc) {
  return {
    doc_name: doc.doc_name,
    doc_type: doc.doc_type,
    doc_summary: doc.doc_summary,
    fields: doc.fields || [],
    applicant_signature: doc.applicant_signature || '',
    signature_mode: doc.signature_mode || '',
    signed_by: doc.signed_by || '',
    signed_at: doc.signed_at || '',
    status: doc.status,
    created_date: doc.created_date,
  };
}

Deno.serve(async (req) => {
  try {
    const body = (await req.json()) ?? {};
    const action = body.action || 'create';

    // ───────── GET — public, no auth ─────────
    if (action === 'get') {
      const { share_id } = body;
      if (!share_id) return Response.json({ error: 'share_id required' }, { status: 400 });

      const base44 = createClientFromRequest(req);
      const docs = await base44.asServiceRole.entities.HawkDocument.filter({ share_id });
      const doc = docs?.[0];
      if (!doc) return Response.json({ error: 'Share link not found' }, { status: 404 });

      return Response.json(publicShape(doc));
    }

    // ───────── CREATE — must be authed (owner) ─────────
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { documentId } = body;
    if (!documentId) return Response.json({ error: 'documentId is required' }, { status: 400 });

    const doc = await base44.entities.HawkDocument.get(documentId);
    if (!doc) return Response.json({ error: 'Document not found' }, { status: 404 });

    let share_id = doc.share_id;
    if (!share_id) {
      share_id = randomId();
      await base44.entities.HawkDocument.update(documentId, { share_id });
    }

    const origin = body.origin || req.headers.get('origin') || '';
    const share_url = `${origin}/hawk-doc-share?id=${share_id}`;

    console.log(`hawkDocShare: shared doc ${documentId} as ${share_id} by ${user.email}`);
    return Response.json({ share_id, share_url });
  } catch (err) {
    console.error('hawkDocShare error:', err?.message ?? err);
    return Response.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
});