const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('c:\\Snabbb-Inventory\\inventory\\.env.local', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val) env[key.trim()] = val.join('=').trim().replace(/['"]/g, '');
});

const supabase = createClient(
  env['VITE_SUPABASE_URL'],
  env['VITE_SUPABASE_SERVICE_ROLE_KEY'] || env['VITE_SUPABASE_ANON_KEY'] // wait I only have anon key
);

// We will query pg_policies using RPC if we can, but since we don't have rpc let's just use raw REST if possible, but no.
