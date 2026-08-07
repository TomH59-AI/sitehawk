/**
 * talonfitSelectionCode — the one-time customer-selection code behind the
 * TalonFit D/E/F picks.
 *
 * The point of the code: SiteHawk selects A/B/C (our authority); the customer
 * selects D/E/F himself (his authority). The code goes on the certification
 * form WHERE HIS NAME WOULD GO, so the record permanently shows the customer
 * chose those sites — the receipt that makes "you missed a spot" impossible.
 *
 * Codes are minted server-side when the third pick (Target F) is saved, are
 * bound to the issuing account and search ring, and burn on first redemption.
 * All reads/writes go through the service role; the entity is admin-locked.
 *
 * POST { action: 'issue',  site_key, ring_center, targets:[3] } -> { code }
 * POST { action: 'redeem', code, certification }                -> { ok }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// No 0/O/1/I — a customer will read this over the phone at some point.
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function mintCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const pick = (b: number) => CHARSET[b % CHARSET.length];
  const chunk = (arr: Uint8Array) => Array.from(arr).map(pick).join('');
  return `HAWK-${chunk(bytes.slice(0, 4))}-${chunk(bytes.slice(4, 8))}`;
}

const normalize = (code: unknown) => String(code || '').toUpperCase().replace(/\s+/g, '').trim();

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const svc = base44.asServiceRole.entities.TalonFitSelectionCode;

    if (action === 'issue') {
      const siteKey = String(body.site_key || '').trim();
      const targets = Array.isArray(body.targets) ? body.targets : [];
      if (!siteKey) return Response.json({ error: 'site_key is required' }, { status: 400 });
      if (targets.length !== 3) {
        return Response.json({ error: 'A code is only issued once all three picks (D, E, F) are saved.' }, { status: 400 });
      }

      // Idempotent per ring: re-saving after a clear must not mint a second
      // live code. One live code per subscriber per search ring.
      const existing = await svc.filter({ user_email: user.email, site_key: siteKey, status: 'issued' }, null, 1);
      if (existing?.length) {
        return Response.json({ ok: true, code: existing[0].code, reissued: true });
      }

      const code = mintCode();
      await svc.create({
        code,
        user_email: user.email,
        site_key: siteKey,
        ring_center: body.ring_center || undefined,
        targets: targets.map((t: any, i: number) => ({
          letter: ['D', 'E', 'F'][i],
          lat: Number(t?.lat),
          lon: Number(t?.lon ?? t?.lng),
          max_height_ft: Number.isFinite(Number(t?.max_height_ft)) ? Number(t.max_height_ft) : null,
          parcel_address: t?.parcel_address || null,
          apn: t?.apn || null,
        })),
        status: 'issued',
        issued_at: new Date().toISOString(),
      });
      console.log(`[talonfitSelectionCode] issued to ${user.email} for ring ${siteKey}`);
      return Response.json({ ok: true, code });
    }

    if (action === 'redeem') {
      const code = normalize(body.code);
      if (!code) return Response.json({ error: 'Enter your one-time selection code.' }, { status: 400 });

      const rows = await svc.filter({ code }, null, 1);
      const record = rows?.[0];
      if (!record) {
        return Response.json({ error: 'That code is not recognized. Check it and try again.' }, { status: 404 });
      }
      if (record.user_email !== user.email) {
        // Codes are personal — they stand in for the subscriber's name.
        return Response.json({ error: 'This code was issued to a different account.' }, { status: 403 });
      }
      if (record.status !== 'issued') {
        return Response.json(
          { error: `This code was already used on ${record.redeemed_at ? new Date(record.redeemed_at).toLocaleDateString() : 'a previous form'} and can never be used again.` },
          { status: 409 }
        );
      }

      await svc.update(record.id, {
        status: 'redeemed',
        redeemed_at: new Date().toISOString(),
        certification: {
          ...(body.certification || {}),
          redeemed_by_account: user.email,
          selection_source: 'customer',
        },
      });
      console.log(`[talonfitSelectionCode] redeemed ${code} by ${user.email}`);
      return Response.json({ ok: true, redeemed: true, targets: record.targets || [] });
    }

    return Response.json({ error: `Unknown action "${action}"` }, { status: 400 });
  } catch (error) {
    console.error('[talonfitSelectionCode] error:', error?.message || String(error));
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
