import { LockKeyhole } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resolveUnifiedLogin } from '../../shared/api/loginRedirectApi';
import { redirectToRoleApp } from '../../shared/appNavigation';
import { rememberPwaResumePath } from '../../shared/pwaSession';
import './login.css';

type LoginPageProps = {
  readonly navigateToRoleApp?: (path: string) => void;
};

export function LoginPage({
  navigateToRoleApp = redirectToRoleApp
}: LoginPageProps = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [method, setMethod] = useState<'phone' | 'email'>('phone');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const redirect = await resolveUnifiedLogin(identifier, password);
      if (!redirect) {
        setError('Неверный телефон, email или пароль.');
        return;
      }
      const requestedPath = searchParams.get('returnTo') ?? '';
      const clientReturnTo = requestedPath.startsWith('/') && !requestedPath.startsWith('//')
        ? requestedPath
        : '/profile';
      const targetPath = redirect === '/admin'
        ? '/admin/clients'
        : redirect === '/profile'
          ? clientReturnTo
          : redirect;
      rememberPwaResumePath(targetPath);
      if (redirect !== '/profile') {
        navigateToRoleApp(targetPath);
        return;
      }
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
        <h1>Единый вход WayYaam</h1>
        <p>Клиенты · рестораны · водители</p>
        <div className="login-page__methods" aria-label="Способ входа">
          <button
            className={method === 'phone' ? 'is-active' : ''}
            type="button"
            onClick={() => {
              setMethod('phone');
              setIdentifier('');
              setError('');
            }}
          >
            Телефон
          </button>
          <button
            className={method === 'email' ? 'is-active' : ''}
            type="button"
            onClick={() => {
              setMethod('email');
              setIdentifier('');
              setError('');
            }}
          >
            Почта
          </button>
        </div>
        <label>
          {method === 'phone' ? 'Телефон' : 'Email'}
          <input
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            type={method === 'email' ? 'email' : 'tel'}
            inputMode={method === 'email' ? 'email' : 'tel'}
            autoComplete={method === 'email' ? 'email' : 'tel'}
            placeholder={method === 'email' ? 'name@example.ru' : '+7 928 000-00-00'}
            required
          />
        </label>
        <label>
          Пароль
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required />
        </label>
        {error && <strong>{error}</strong>}
        <button type="submit" disabled={isLoading}>{isLoading ? 'Входим...' : 'Войти'}</button>
        <Link to="/profile?clientAuth=1">Создать аккаунт клиента</Link>
        <Link to="/">На главную</Link>
      </form>
    </main>
  );
}
