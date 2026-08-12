import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  getCatalogStorefrontDomain,
  saveCatalogStorefrontDomain,
  setCatalogStorefrontDomainStatus,
  type CatalogStorefrontDraft
} from '../../shared/api/storefrontAdminApi';
import type { PlatformClient } from '../../shared/api/platformTypes';
import { copyText } from '../../shared/platformUrls';

const buildInitialStorefrontDraft = (client: PlatformClient): CatalogStorefrontDraft => ({
  catalogId: client.catalogId,
  hostname: '',
  storefrontMode: 'exclusive',
  brandName: client.companyName,
  shortName: client.companyName.slice(0, 24),
  logoUrl: client.logoUrl,
  icon192Url: '',
  icon512Url: '',
  themeColor: '#6C5CE7',
  backgroundColor: '#F5F6F8'
});

export function StorefrontSettingsCard({ client }: { client: PlatformClient }) {
  const queryClient = useQueryClient();
  const storefrontQuery = useQuery({
    queryKey: ['catalog-storefront-domain', client.catalogId],
    queryFn: () => getCatalogStorefrontDomain(client.catalogId)
  });
  const [draft, setDraft] = useState<CatalogStorefrontDraft>(() => buildInitialStorefrontDraft(client));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const domain = storefrontQuery.data;
    if (!domain) return;
    setDraft({
      catalogId: domain.catalogId,
      hostname: domain.hostname,
      storefrontMode: domain.storefrontMode,
      brandName: domain.brandName,
      shortName: domain.shortName,
      logoUrl: domain.logoUrl,
      icon192Url: domain.icon192Url,
      icon512Url: domain.icon512Url,
      themeColor: domain.themeColor,
      backgroundColor: domain.backgroundColor
    });
    setDirty(false);
  }, [storefrontQuery.data]);

  const patchDraft = (patch: Partial<CatalogStorefrontDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['catalog-storefront-domain', client.catalogId] });

  const saveDraft = async () => {
    if (!draft.hostname.trim() || !draft.brandName.trim() || !draft.shortName.trim()) {
      toast.error('Заполните домен, название и короткое имя PWA');
      return;
    }
    setBusy(true);
    try {
      await saveCatalogStorefrontDomain(draft);
      await refresh();
      setDirty(false);
      toast.success('Настройки витрины сохранены');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить витрину');
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (nextStatus: 'active' | 'suspended') => {
    const domain = storefrontQuery.data;
    if (!domain || dirty) return;
    if (nextStatus === 'active' && !window.confirm(
      `DNS проверен для ${domain.hostname}? После активации домен станет публичной витриной.`
    )) return;
    setBusy(true);
    try {
      await setCatalogStorefrontDomainStatus(
        domain.id,
        nextStatus,
        nextStatus === 'active' ? domain.verificationToken : undefined
      );
      await refresh();
      toast.success(nextStatus === 'active' ? 'Домен активирован' : 'Витрина приостановлена');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось изменить статус');
    } finally {
      setBusy(false);
    }
  };

  const domain = storefrontQuery.data;
  return (
    <section className="client-form-section storefront-settings-card">
      <div className="storefront-settings-card__head">
        <div>
          <h3>Брендированный домен и PWA</h3>
          <p>Один backend WayYaam, один аккаунт клиента и только каталог «{client.companyName}».</p>
        </div>
        <span data-status={domain?.status ?? 'new'}>
          {domain?.status === 'active' ? 'Активен' : domain?.status === 'suspended' ? 'Приостановлен' : domain ? 'Ожидает DNS' : 'Не настроен'}
        </span>
      </div>

      {storefrontQuery.isLoading ? <em>Загружаем витрину…</em> : storefrontQuery.isError ? (
        <div className="client-module-access__error">
          Не удалось загрузить настройки.
          <button type="button" onClick={() => void storefrontQuery.refetch()}>Повторить</button>
        </div>
      ) : (
        <>
          <div className="client-form-grid">
            <label>
              Домен
              <input value={draft.hostname} placeholder="finiki.ru" onChange={(event) => patchDraft({ hostname: event.target.value })} />
            </label>
            <label>
              Название витрины
              <input value={draft.brandName} maxLength={80} onChange={(event) => patchDraft({ brandName: event.target.value })} />
            </label>
            <label>
              Короткое имя PWA
              <input value={draft.shortName} maxLength={24} onChange={(event) => patchDraft({ shortName: event.target.value })} />
            </label>
            <label>
              Режим витрины
              <select value={draft.storefrontMode} onChange={(event) => patchDraft({ storefrontMode: event.target.value === 'marketplace' ? 'marketplace' : 'exclusive' })}>
                <option value="exclusive">Только этот бизнес</option>
                <option value="marketplace">Общий marketplace WayYaam</option>
              </select>
            </label>
            <label>
              Логотип URL
              <input value={draft.logoUrl} inputMode="url" onChange={(event) => patchDraft({ logoUrl: event.target.value })} />
            </label>
            <label>
              PWA-иконка 192×192 URL
              <input value={draft.icon192Url} inputMode="url" onChange={(event) => patchDraft({ icon192Url: event.target.value })} />
            </label>
            <label>
              PWA-иконка 512×512 URL
              <input value={draft.icon512Url} inputMode="url" onChange={(event) => patchDraft({ icon512Url: event.target.value })} />
            </label>
            <label>
              Цвет бренда
              <input value={draft.themeColor} type="color" onChange={(event) => patchDraft({ themeColor: event.target.value })} />
            </label>
            <label>
              Фон PWA
              <input value={draft.backgroundColor} type="color" onChange={(event) => patchDraft({ backgroundColor: event.target.value })} />
            </label>
          </div>

          {domain && (
            <div className="storefront-settings-card__verification">
              <span>TXT для ручной проверки DNS</span>
              <code>wayyaam-verification={domain.verificationToken}</code>
              <button type="button" onClick={() => void copyText(`wayyaam-verification=${domain.verificationToken}`).then(() => toast.success('Токен скопирован'))}>
                <Copy /> Копировать
              </button>
            </div>
          )}

          <div className="storefront-settings-card__actions">
            <button type="button" disabled={busy || !dirty} onClick={() => void saveDraft()}>
              <Save /> {busy ? 'Сохраняем…' : 'Сохранить витрину'}
            </button>
            {domain?.status !== 'active' && (
              <button type="button" disabled={busy || dirty} onClick={() => void changeStatus('active')}>
                DNS проверен — активировать
              </button>
            )}
            {domain?.status === 'active' && (
              <button type="button" disabled={busy || dirty} onClick={() => void changeStatus('suspended')}>
                Приостановить
              </button>
            )}
            {domain?.status === 'active' && <a href={`https://${domain.hostname}`} target="_blank" rel="noreferrer">Открыть домен</a>}
          </div>
          <small>Активация не настраивает DNS и TLS автоматически: сначала домен нужно направить на инфраструктуру WayYaam.</small>
        </>
      )}
    </section>
  );
}
