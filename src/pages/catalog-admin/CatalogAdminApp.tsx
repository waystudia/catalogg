import { Copy, ExternalLink, LockKeyhole, LogOut, RefreshCw, ShieldAlert, Store } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Toaster, toast } from 'sonner';
import {
  getCatalogAdminAccess,
  signInCatalogAdmin,
  signOutCatalogAdmin,
  type CatalogAdminAccess
} from '../../shared/api/catalogAdminApi';
import { copyText, getCatalogPublicUrl } from '../../shared/platformUrls';
import './catalog-admin.css';

type CatalogAdminAppProps = {
  slug: string;
};

const roleLabels: Record<NonNullable<CatalogAdminAccess['role']>, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  editor: 'Редактор',
  viewer: 'Просмотр'
};

const statusLabels: Record<NonNullable<CatalogAdminAccess['catalog']>['status'], string> = {
  draft: 'Черновик',
  published: 'Опубликован',
  archived: 'Архив'
};

function CatalogLogin({
  slug,
  catalogName,
  onSuccess
}: {
  slug: string;
  catalogName: string;
  onSuccess: (access: CatalogAdminAccess) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const access = await signInCatalogAdmin(slug, email, password);
      if (!access.isMember) {
        toast.error('У этого пользователя нет доступа к каталогу');
        return;
      }
      toast.success('Вход выполнен');
      onSuccess(access);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось войти');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="catalog-admin-login">
      <Toaster richColors position="top-center" />
      <form className="catalog-admin-login__card" onSubmit={onSubmit}>
        <span>
          <LockKeyhole />
        </span>
        <h1>{catalogName}</h1>
        <p>Войдите в админку своего каталога.</p>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        <label>
          Пароль
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
        </label>
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Проверяем...' : 'Войти'}
        </button>
      </form>
    </main>
  );
}

function CatalogForbidden({
  email,
  onSignOut
}: {
  email: string | null;
  onSignOut: () => void;
}) {
  return (
    <main className="catalog-admin-state">
      <ShieldAlert />
      <h1>Нет доступа</h1>
      <p>
        Текущий пользователь: <strong>{email ?? 'не определён'}</strong>
      </p>
      <p>Войдите email-адресом владельца этого каталога.</p>
      <button type="button" onClick={onSignOut}>
        <LogOut />
        Выйти
      </button>
    </main>
  );
}

function CatalogDashboard({
  access,
  onRefresh,
  onSignOut
}: {
  access: CatalogAdminAccess;
  onRefresh: () => void;
  onSignOut: () => void;
}) {
  const catalog = access.catalog;
  const publicUrl = useMemo(() => (catalog ? getCatalogPublicUrl(catalog.slug) : ''), [catalog]);

  if (!catalog) {
    return (
      <main className="catalog-admin-state">
        <ShieldAlert />
        <h1>Каталог не найден</h1>
        <p>Проверьте ссылку на админку.</p>
      </main>
    );
  }

  return (
    <main className="catalog-admin-page">
      <Toaster richColors position="top-center" />
      <header className="catalog-admin-header">
        <div className="catalog-admin-brand">
          {catalog.logoUrl ? <img src={catalog.logoUrl} alt="" /> : <span>{catalog.name.slice(0, 1)}</span>}
          <div>
            <strong>{catalog.name}</strong>
            <small>{catalog.slug}</small>
          </div>
        </div>
        <div className="catalog-admin-actions">
          <button type="button" onClick={onRefresh}>
            <RefreshCw />
            Обновить
          </button>
          <button type="button" onClick={onSignOut}>
            <LogOut />
            Выйти
          </button>
        </div>
      </header>

      <section className="catalog-admin-hero">
        <div>
          <span>{roleLabels[access.role ?? 'viewer']}</span>
          <h1>Админка каталога</h1>
          <p>Базовый кабинет клиента подключён к Supabase Auth и catalog_members.</p>
        </div>
        <a href={publicUrl} target="_blank" rel="noreferrer">
          <ExternalLink />
          Открыть каталог
        </a>
      </section>

      <section className="catalog-admin-grid">
        <article>
          <Store />
          <small>Статус каталога</small>
          <strong>{statusLabels[catalog.status]}</strong>
        </article>
        <article>
          <Store />
          <small>Шаблон</small>
          <strong>
            {catalog.templateName} v{catalog.templateVersion}
          </strong>
        </article>
        <article>
          <Store />
          <small>Аккаунт</small>
          <strong>{access.email}</strong>
        </article>
      </section>

      <section className="catalog-admin-panel">
        <h2>Ссылки</h2>
        <div>
          <span>{publicUrl}</span>
          <button type="button" onClick={() => void copyText(publicUrl).then(() => toast.success('Ссылка скопирована'))}>
            <Copy />
            Копировать
          </button>
        </div>
      </section>

      <section className="catalog-admin-panel">
        <h2>Следующий этап</h2>
        <p>
          Дальше сюда подключаются товары, категории, настройки дизайна и импорт/экспорт именно для этого каталога.
          Доступ уже отделён от суперадминки.
        </p>
      </section>
    </main>
  );
}

export function CatalogAdminApp({ slug }: CatalogAdminAppProps) {
  const [access, setAccess] = useState<CatalogAdminAccess | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      setAccess(await getCatalogAdminAccess(slug));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось проверить доступ');
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (isLoading) {
    return <main className="catalog-admin-state">Проверяем доступ...</main>;
  }

  if (error) {
    return (
      <main className="catalog-admin-state">
        <ShieldAlert />
        <h1>Ошибка</h1>
        <p>{error}</p>
        <button type="button" onClick={() => void refresh()}>
          <RefreshCw />
          Повторить
        </button>
      </main>
    );
  }

  if (!access?.hasSession) {
    return (
      <CatalogLogin
        slug={slug}
        catalogName={access?.catalog?.name ?? slug}
        onSuccess={(nextAccess) => setAccess(nextAccess)}
      />
    );
  }

  if (!access.isMember) {
    return (
      <CatalogForbidden
        email={access.email}
        onSignOut={() => {
          void signOutCatalogAdmin().then(refresh);
        }}
      />
    );
  }

  return (
    <CatalogDashboard
      access={access}
      onRefresh={() => void refresh()}
      onSignOut={() => {
        void signOutCatalogAdmin().then(refresh);
      }}
    />
  );
}
