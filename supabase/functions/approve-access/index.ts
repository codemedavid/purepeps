// Pure Peps — admin-only approval gateway for paid group-buy access requests.
//
// The lockdown migration removed the anon UPDATE policy on `access_requests`, so
// status changes are impossible via the public REST API. This Edge Function is
// the ONLY path that can change a request's status: it verifies the caller's
// Supabase Auth JWT, confirms the user is in `admin_users` (the same is_admin()
// rule RLS enforces), then writes with the service-role key (which bypasses
// RLS). This is what makes "only the admin can approve" true at the database
// level, not just in the client UI.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_STATUSES = ['approved', 'rejected', 'pending'] as const;
type Status = (typeof ALLOWED_STATUSES)[number];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface ApprovePayload {
  id?: string;
  status?: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'Server not configured' }, 500);
  }

  // Authorize first — identify the caller from their bearer token and require
  // admin membership. Never reveal whether the id/status were valid to callers
  // that fail the admin check.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // A client scoped to the caller's JWT resolves *who* they are.
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  const user = userData?.user;
  if (userError || !user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // Service-role client: confirm admin membership and perform the write. Both
  // bypass RLS, so the membership check must be explicit.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: adminRow, error: adminError } = await admin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (adminError) {
    return json({ error: 'Authorization check failed' }, 500);
  }
  if (!adminRow) {
    return json({ error: 'Forbidden' }, 403);
  }

  let payload: ApprovePayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { id, status } = payload;
  if (!id || typeof id !== 'string') {
    return json({ error: 'Missing request id' }, 400);
  }
  if (!status || !ALLOWED_STATUSES.includes(status as Status)) {
    return json({ error: 'Invalid status' }, 400);
  }

  const { data, error } = await admin
    .from('access_requests')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return json({ error: error.message }, 400);
  }

  return json({ success: true, data });
});
