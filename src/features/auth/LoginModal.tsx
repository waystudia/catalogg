import { type FormEvent, useState } from 'react';
import { useAuthStore } from '../stores';
import { BrandLogo } from '../../shared/BrandLogo';
import { requestRestaurantOrderNotificationPermission } from '../../shared/restaurantOrderNotifications';

export function LoginModal({
  catalogSlug,
  onClose,
  onSuccess
}: {
  catalogSlug: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const login = useAuthStore((state) => state.login);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setIsLoading(true);
    setError('');
    const success = await login(String(formData.get('email')), String(formData.get('password')), catalogSlug);
    setIsLoading(false);
    if (success) {
      void requestRestaurantOrderNotificationPermission({ role: 'restaurant', catalogSlug });
      onSuccess();
      return;
    }
    setError('Неверный email или пароль.');
  };

  return (
    <div className="modal-backdrop">
      <form className="login-modal" onSubmit={submit}>
        <BrandLogo compact />
        <label>
          Email
          <input name="email" type="email" placeholder="admin@example.com" autoCapitalize="none" autoComplete="email" required />
        </label>
        <label>
          Пароль
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error && <p>{error}</p>}
        <button className="primary-wide" type="submit" disabled={isLoading}>
          {isLoading ? 'Входим...' : 'Войти'}
        </button>
        <button className="ghost-wide" type="button" onClick={onClose}>
          Закрыть
        </button>
      </form>
    </div>
  );
}

