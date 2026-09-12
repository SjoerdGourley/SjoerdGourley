// The prompt library. One entry per video: what the page promises, and what
// the confirmation email delivers. Adding a video means adding an entry here
// and a page under /p/<slug>/.

const PROMPTS = {
  multitenant: {
    title: 'Multi-tenant CRM core',
    video: 'How to build a multi-tenant SaaS: one system, a hundred agencies, zero data leaks',
    videoUrl: '',
    promise: 'The prompt that writes the multi-tenant core, plus the checklist I use to decide whether its output is safe to ship.',
    prompt: `You are a senior backend engineer. Design and write the data layer for a
multi-tenant SaaS in Postgres (Supabase), where one deployment serves many
agencies, each agency serves many of its own clients, and no agency may ever
see another agency's data.

Requirements:
1. Tenancy model: agencies (tenants) -> sub-accounts (their clients) -> records.
   Every table that holds tenant data carries tenant_id, not a join away from it.
2. Isolation with row level security: policies on every tenant table, written
   against the JWT claim, not against application code.
3. Roles: agency owner, agency member, sub-account user. A sub-account user sees
   one sub-account; an agency member sees all sub-accounts of that agency.
4. Usage metering: an append-only table recording billable events per tenant per
   sub-account, with enough detail to rebill with a markup.
5. Every query path used by the app has an index that starts with tenant_id.

Deliver, in this order:
- the schema as one SQL migration, with comments explaining each policy
- the RLS policies, each with the attack it prevents written above it
- three failing tests: one that proves cross-tenant reads are blocked, one that
  proves a sub-account user cannot widen its scope, one that proves usage rows
  cannot be written for another tenant
- the queries the app will run, with the index each one uses

Constraints: no ORM, no hidden defaults, and no "TODO" left in the output. If a
requirement is ambiguous, state the assumption in a comment and continue.`,
    checklist: [
      'Does every tenant table carry tenant_id directly, or does isolation depend on a join? A join is a leak waiting for one missing condition.',
      'Is RLS enabled on every table, and does every table have a policy? RLS enabled without a policy denies everyone, which looks like a bug in production.',
      'Do the policies read the JWT claim, or do they trust a value the client can set?',
      'Is there a policy for INSERT and UPDATE, not only SELECT? Writing into another tenant is the quieter breach.',
      'Does the service role bypass RLS anywhere the app uses it, and is that path audited?',
      'Does every index start with tenant_id? An index that starts with created_at scans all tenants.',
      'Are the usage rows append-only, and is there a unique key that prevents double counting on a retry?',
      'Do the three tests actually fail before the policies are added? A test that passes on an empty database proves nothing.',
      'What happens on delete: is it a hard delete, or soft with tenant_id retained for billing history?',
      'Does the migration run twice without breaking? Re-running is how a deployment recovers.',
    ],
  },
};

module.exports = { PROMPTS };
