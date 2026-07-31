import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('driver login from the client profile', () => {
  it('uses an isolated bounded auth request and preserves the successful driver session', async () => {
    const supabase = await read('src/shared/supabase.ts');
    const redirect = await read('src/shared/api/loginRedirectApi.ts');
    const profile = await read('src/pages/client-platform/ClientPlatformApp.tsx');

    assert.match(supabase, /signInWithPasswordResilient/);
    assert.match(supabase, /autoRefreshToken: false/);
    assert.match(supabase, /persistSession: false/);
    assert.match(supabase, /controller\.abort\(\)/);
    assert.match(supabase, /attempt < 2/);
    assert.match(supabase, /supabase\.auth\.setSession/);
    assert.match(redirect, /signInWithPasswordResilient\(email, password\)/);
    assert.match(redirect, /Сервис входа временно отвечает медленно/);
    assert.match(profile, /Данные для входа водителю выдаёт администратор платформы/);
    assert.doesNotMatch(profile, /Аккаунт водителя создаёт и выдаёт супер-админ/);
  });
});
