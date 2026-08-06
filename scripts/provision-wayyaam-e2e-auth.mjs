import { createClient } from '@supabase/supabase-js';

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const supabaseUrl = required('SUPABASE_URL');
const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const accounts = [
  {
    role: 'client',
    email: required('E2E_CLIENT_EMAIL'),
    password: required('E2E_CLIENT_PASSWORD'),
    name: 'WayYaam Test Client',
    phone: '+7 900 000-00-01'
  },
  {
    role: 'restaurant',
    email: required('E2E_RESTAURANT_EMAIL'),
    password: required('E2E_RESTAURANT_PASSWORD'),
    name: 'WayYaam Test Restaurant',
    phone: '+7 900 000-00-02'
  },
  {
    role: 'driver',
    email: required('E2E_DRIVER_EMAIL'),
    password: required('E2E_DRIVER_PASSWORD'),
    name: 'WayYaam Test Driver',
    phone: '+7 900 000-00-03'
  }
];

const listAllUsers = async () => {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
};

const existingByEmail = new Map(
  (await listAllUsers()).map((user) => [user.email?.toLowerCase(), user])
);

for (const account of accounts) {
  const email = account.email.toLowerCase();
  const attributes = {
    email,
    password: account.password,
    email_confirm: true,
    app_metadata: { role: account.role, is_test: true },
    user_metadata: { name: account.name, full_name: account.name, phone: account.phone, is_test: true }
  };
  const existing = existingByEmail.get(email);
  const result = existing
    ? await admin.auth.admin.updateUserById(existing.id, attributes)
    : await admin.auth.admin.createUser(attributes);
  if (result.error) throw result.error;
  process.stdout.write(`${account.role}: ${existing ? 'updated' : 'created'} and email-confirmed\n`);
}
