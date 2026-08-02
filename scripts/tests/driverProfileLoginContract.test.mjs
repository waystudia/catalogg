import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('driver login from the client profile', () => {
  it('uses an isolated bounded auth request and preserves the successful staff session', async () => {
    const supabase = await read('src/shared/supabase.ts');
    const redirect = await read('src/shared/api/loginRedirectApi.ts');
    const profile = await read('src/pages/client-platform/ClientPlatformApp.tsx');

    assert.match(supabase, /signInWithPasswordResilient/);
    assert.match(supabase, /autoRefreshToken: false/);
    assert.match(supabase, /persistSession: false/);
    assert.match(supabase, /controller\.abort\(\)/);
    assert.match(supabase, /message\.includes\('abort'\)/);
    assert.match(supabase, /message\.includes\('signal'\)/);
    assert.match(supabase, /attempt < 2/);
    assert.match(supabase, /if \(attempt === 1\) break/);
    assert.match(supabase, /supabase\.auth\.setSession/);
    assert.match(redirect, /signInWithPasswordResilient\(email, password\)/);
    assert.match(redirect, /Сервис входа временно отвечает медленно/);
    assert.match(redirect, /Сервис профилей временно не отвечает/);
    assert.match(redirect, /PGRST202/i);
    assert.match(redirect, /expectedRole/);
    assert.match(
      profile,
      /identifier\.includes\('@'\)[\s\S]*resolveLoginRedirect\(identifier, clientPassword\)/
    );
    assert.match(profile, /Телефон или почта/);
    assert.match(profile, /Рестораны и водители — по почте, выданной администратором/);
    assert.doesNotMatch(profile, /profile-role-grid/);
    assert.doesNotMatch(profile, /Войти как (?:клиент|ресторан|водитель)/);
    assert.doesNotMatch(profile, /Аккаунт водителя создаёт и выдаёт супер-админ/);
    assert.doesNotMatch(redirect, /const authenticatedDriverId = await getAuthenticatedDriverId\(\)/);
  });

  it('defers restaurant role checks outside the auth state callback', async () => {
    const supabase = await read('src/shared/supabase.ts');

    assert.match(supabase, /onAuthStateChange[\s\S]*setTimeout/);
    assert.match(supabase, /clearTimeout\(sessionCheckTimeoutId\)/);
  });
});
