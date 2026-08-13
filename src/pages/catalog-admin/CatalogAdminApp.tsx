import { LogOut, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { getCatalogAdminAccess, signOutCatalogAdmin, type CatalogAdminAccess } from '../../shared/api/catalogAdminApi';
import { buildProfileLoginPath, redirectToClientHome } from '../../shared/appNavigation';
import { confirmRoleSignOut } from '../../shared/roleSessionSafety';
import { RestaurantAdminShell } from './RestaurantAdminShell';
import './catalog-admin.css';

type CatalogAdminAppProps = {
  slug: string;
  routePath?: string;
};

function CatalogLogin({ slug }: { slug: string }) {
  return <Navigate to={buildProfileLoginPath(`/business/${slug}`)} replace />;
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
  routePath,
  onRefresh,
  onSignOut
}: {
  access: CatalogAdminAccess;
  routePath?: string;
  onRefresh: () => void;
  onSignOut: () => void;
}) {
  const catalog = access.catalog;
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
    <>
      <Toaster richColors position="top-center" />
      <RestaurantAdminShell
        access={access}
        routePath={routePath}
        onRefresh={onRefresh}
        onSignOut={onSignOut}
      />
    </>
  );
}

export function CatalogAdminApp({ slug, routePath }: CatalogAdminAppProps) {
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
      <CatalogLogin slug={slug} />
    );
  }

  if (!access.isMember) {
    return (
        <CatalogForbidden
          email={access.email}
          onSignOut={() => {
            if (!confirmRoleSignOut('заведения')) return;
            void signOutCatalogAdmin().then(() => {
              redirectToClientHome();
            });
          }}
        />
    );
  }

  return (
      <CatalogDashboard
        access={access}
        routePath={routePath}
        onRefresh={() => void refresh()}
        onSignOut={() => {
          if (!confirmRoleSignOut('заведения')) return;
          void signOutCatalogAdmin().then(() => {
            redirectToClientHome();
          });
        }}
      />
  );
}
