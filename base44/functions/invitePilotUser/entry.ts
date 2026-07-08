import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * invitePilotUser — admin helper. Invites a user by email (role "user")
 * so comped pilot accounts (e.g. Pyramid NS) get their signup email.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { email } = await req.json();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return Response.json({ error: 'Valid email required' }, { status: 400 });
    }

    const result = await base44.users.inviteUser(email, 'user');
    console.log('invitePilotUser: invited', email);
    return Response.json({ ok: true, email, result });
  } catch (error) {
    console.error('invitePilotUser error:', error?.message ?? error);
    return Response.json({ error: String(error?.message ?? error) }, { status: 500 });
  }
});