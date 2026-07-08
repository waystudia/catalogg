import { LockKeyhole } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { resolveLoginRedirect } from '../../shared/api/loginRedirectApi';
import { rememberPwaResumePath } from '../../shared/pwaSession';
import './login.css';

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
      const redirect = await resolveLoginRedirect(email, password);
      if (!redirect) {
        setError('Неверный email или пароль.');
        return;
      }
      const targetPath = redirect === '/admin' ? '/admin/clients' : redirect;
      rememberPwaResumePath(targetPath);
      navigate(targetPath, { replace: true });
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
