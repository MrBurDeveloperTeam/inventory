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
  env['VITE_SUPABASE_ANON_KEY']
);

async function test() {
  const { data, error } = await supabase
    .from('inventory_purchase_history')
    .select('*')
    .order('occurred_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  console.log('Error:', error);
  console.log('Data:', data);
}

test();
