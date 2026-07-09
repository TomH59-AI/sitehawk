import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * inviteDemoCampaign — admin-only marketing campaign invite.
 * Invites the recipient as a "demo" role user (3-day self-expiring access,
 * clock starts at their first login) AND sends them Tom's personal campaign
 * letter via the hawkEmail dispatcher.
 *
 * Payload: { email, name?, subject, letter }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { email, name, subject, letter } = await req.json();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return Response.json({ error: 'Valid email required' }, { status: 400 });
    }
    if (!subject || !letter) {
      return Response.json({ error: 'subject and letter are required' }, { status: 400 });
    }

    // 1. Invite as a demo-role user (3-day window enforced in-app).
    let inviteOk = true;
    let inviteError = null;
    try {
      await base44.users.inviteUser(email, 'demo');
      console.log('inviteDemoCampaign: invited', email, 'as demo');
    } catch (err) {
      inviteOk = false;
      inviteError = String(err?.message ?? err);
      console.error('inviteDemoCampaign invite error:', inviteError);
    }

    // 2. Send the personal campaign letter.
    let emailOk = true;
    let emailError = null;
    try {
      await base44.functions.invoke('hawkEmail', {
        to: email,
        subject,
        body: letter,
        from_name: 'Tom Hodges — SiteHawk',
        reply_to: 'tomhodges@onairs.com',
        type: 'marketing',
      });
      console.log('inviteDemoCampaign: letter sent to', email);
    } catch (err) {
      emailOk = false;
      emailError = String(err?.message ?? err);
      console.error('inviteDemoCampaign letter error:', emailError);
    }

    return Response.json({
      ok: inviteOk || emailOk,
      email,
      name: name || null,
      invite: { ok: inviteOk, error: inviteError },
      letter: { ok: emailOk, error: emailError },
    });
  } catch (error) {
    console.error('inviteDemoCampaign error:', error?.message ?? error);
    return Response.json({ error: String(error?.message ?? error) }, { status: 500 });
  }
});