import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Daily Follow-Up Digest — scheduled automation. Finds open/overdue SCIP CRM
// tasks due today or earlier and emails each assignee (falling back to the
// task creator) a morning digest so owner call-backs and permit deadlines
// never slip.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    // "Today" in the user's timezone (America/New_York), YYYY-MM-DD.
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

    const tasks = await base44.asServiceRole.entities.ScipCRMTask.filter(
      { status: { $in: ['open', 'overdue'] }, due_date: { $lte: today } },
      'due_date',
      500,
    );
    if (!tasks.length) {
      console.log('dailyFollowUpDigest: no tasks due — nothing to send.');
      return Response.json({ sent: 0, tasks_due: 0 });
    }

    // Group by recipient (assignee, falling back to task creator).
    const byUser = {};
    for (const t of tasks) {
      const email = t.assigned_user || t.created_by;
      if (!email) continue;
      (byUser[email] ||= []).push(t);
    }

    const results = [];
    for (const [email, list] of Object.entries(byUser)) {
      const overdue = list.filter((t) => t.due_date < today);
      const dueToday = list.filter((t) => t.due_date === today);
      const line = (t) => `• [${t.task_type || 'task'}] ${t.title}${t.due_date < today ? ` — was due ${t.due_date}` : ''}${t.notes ? ` (${t.notes})` : ''}`;
      const body = [
        `Good morning — here's your SiteHawk follow-up digest for ${today}.`,
        overdue.length ? `\nOVERDUE (${overdue.length}):\n${overdue.map(line).join('\n')}` : '',
        dueToday.length ? `\nDUE TODAY (${dueToday.length}):\n${dueToday.map(line).join('\n')}` : '',
        `\nOpen the SCIP CRM panel on each site to work these tasks.`,
      ].filter(Boolean).join('\n');

      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          subject: `SiteHawk follow-ups: ${overdue.length} overdue, ${dueToday.length} due today`,
          body,
          from_name: 'SiteHawk Follow-Up Tracker',
        });
        results.push({ email, tasks: list.length, status: 'sent' });
      } catch (e) {
        results.push({ email, tasks: list.length, status: 'failed', reason: e.message });
      }
    }

    const sent = results.filter((r) => r.status === 'sent').length;
    console.log(`dailyFollowUpDigest: ${tasks.length} tasks due → ${sent}/${results.length} digests sent.`);
    return Response.json({ sent, tasks_due: tasks.length, results });
  } catch (error) {
    console.error('dailyFollowUpDigest error:', error?.message ?? error);
    return Response.json({ error: String(error?.message ?? error) }, { status: 500 });
  }
});