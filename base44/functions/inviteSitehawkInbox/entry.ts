import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * inviteSitehawkInbox — one-time admin helper. Invites tomhodges@onairs.org as an
 * admin user so the branded notifyAdmin emails can deliver to that inbox.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const result = await base44.users.inviteUser('tomhodges@onairs.org', 'admin');
    console.log('inviteSitehawkInbox: invited tomhodges@onairs.org as admin');
    return Response.json({ ok: true, result });
  } catch (error) {
    console.error('inviteSitehawkInbox error:', error?.message ?? error);
    return Response.json({ error: String(error?.message ?? error) }, { status: 500 });
  }
});