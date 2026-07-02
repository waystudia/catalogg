import { LockKeyhole } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../shared/supabase';
import './login.css';

async function resolveRedirect(email: string, password: string) {
  if (!supabase) {
    return email.trim().toLowerCase() === 'admin' && password.trim() === '1234' ? '/mangal/dashboard' : null;
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password
  });
  if (error) throw new Error(error.message);

  const { data: isPlatformAdmin } = await supabase.rpc('is_platform_admin');
  if (isPlatformAdmin) return '/admin';

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return '/';

  const { data: client } = await supabase
    .from('clients')
    .select('catalogs(slug)')
    .eq('owner_user_id', user.id)
    .maybeSingle();

  const catalog = client?.catalogs as { slug?: string } | { slug?: string }[] | null | undefined;
  const slug = Array.isArray(catalog) ? catalog[0]?.slug : catalog?.slug;
  return slug ? `/${slug}/dashboard` : '/';
}

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const redirect = await resolveRedirect(email, password);
      if (!redirect) {
        setError('Неверный email или пароль.');
        return;
      }
      navigate(redirect, { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось войти');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="login-page">
      <form className="login-page__card" onSubmit={submit}>
        <span><LockKeyhole /></span>
        <h1>Вход</h1>
        <p>Один вход автоматически откроет нужный раздел.</p>
        <label>
          Email или телефон
          <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
        </label>
        <label>
          Пароль
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required />
        </label>
        {error && <strong>{error}</strong>}
        <button type="submit" disabled={isLoading}>{isLoading ? 'Входим...' : 'Войти'}</button>
        <Link to="/">На главную</Link>
      </form>
    </main>
  );
}
