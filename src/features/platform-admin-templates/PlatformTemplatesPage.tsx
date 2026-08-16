import { useQueryClient } from '@tanstack/react-query';
import { Eye, LayoutTemplate, Plus, Settings, Trash2, Upload } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  createRestaurantTemplate,
  deleteRestaurantTemplate,
  publishCoffeeTemplateAssets
} from '../../shared/api/templatesApi';
import type { PlatformTemplateOption } from '../../shared/api/platformTypes';
import { getCatalogAdminUrl, getCatalogPublicUrl } from '../../shared/platformUrls';
import { copySupabaseSessionBetweenScopes } from '../../shared/supabaseAuthScope';
import { createSlug, normalizeSlugInput } from '../../shared/validation/clientCredentials';

export function PlatformTemplatesPage({ templates }: { templates: PlatformTemplateOption[] }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [lastAutoSlug, setLastAutoSlug] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publishingTemplateId, setPublishingTemplateId] = useState('');
  const [deletingTemplateId, setDeletingTemplateId] = useState('');

  useEffect(() => {
    if ((!slug || slug === lastAutoSlug) && name) {
      const nextSlug = createSlug(name);
      setSlug(nextSlug);
      setLastAutoSlug(nextSlug);
    }
  }, [lastAutoSlug, name, slug]);

  const onCreateTemplate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || !slug.trim()) {
      toast.error('Укажите название и адрес шаблона');
      return;
    }

    setIsSubmitting(true);
    try {
      await createRestaurantTemplate({
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        templateName: slug.trim().toLowerCase()
      });
      toast.success('Шаблон создан');
      setName('');
      setSlug('');
      setLastAutoSlug('');
      void queryClient.invalidateQueries({ queryKey: ['platform-templates'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось создать шаблон');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="platform-page templates-page">
      <header className="platform-page-head">
        <div>
          <h1>Шаблоны</h1>
          <p>Создавайте шаблоны заведений и настраивайте их как обычные каталоги</p>
        </div>
      </header>

      <form className="platform-template-create" onSubmit={onCreateTemplate}>
        <label>
          Название шаблона
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Шаблон: Шашлычная" required />
        </label>
        <label>
          Адрес шаблона
          <input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            onBlur={(event) => setSlug(normalizeSlugInput(event.target.value))}
            placeholder="coffee-shop"
            required
          />
        </label>
        <button type="submit" disabled={isSubmitting}>
          <Plus />
          {isSubmitting ? 'Создаём...' : 'Создать шаблон'}
        </button>
      </form>

      <section className="platform-template-list">
        {templates.length === 0 && (
          <div className="platform-placeholder">
            <LayoutTemplate />
            <h2>Шаблонов пока нет</h2>
            <p>Создайте первый шаблон, затем откройте его админку и наполните каталог.</p>
          </div>
        )}
        {templates.map((template) => (
          <article className="platform-template-card" key={template.templateVersionId}>
            <div>
              <span className="platform-template-badge">TEMPLATE</span>
              <h2>{template.templateName}</h2>
              <p>{template.description}</p>
              {template.templateCatalogSlug && <small>#/{template.templateCatalogSlug}</small>}
            </div>
            <div className="platform-template-card__actions">
              {template.businessType === 'coffee_shop' && template.isCatalogTemplate && (
                <button
                  type="button"
                  disabled={publishingTemplateId === template.templateVersionId}
                  onClick={async () => {
                    setPublishingTemplateId(template.templateVersionId);
                    try {
                      const count = await publishCoffeeTemplateAssets(template.templateVersionId);
                      toast.success(`Опубликовано фотографий: ${count}`);
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Не удалось опубликовать фотографии');
                    } finally {
                      setPublishingTemplateId('');
                    }
                  }}
                >
                  <Upload />
                  {publishingTemplateId === template.templateVersionId ? 'Публикуем...' : 'Опубликовать фото'}
                </button>
              )}
              {template.templateCatalogSlug && (
                <>
                  <a
                    className="is-preview"
                    href={getCatalogPublicUrl(template.templateCatalogSlug)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Eye />
                    Просмотреть
                  </a>
                  <a
                    href={getCatalogAdminUrl(template.templateCatalogSlug)}
                    onClick={() => copySupabaseSessionBetweenScopes('platform-admin', 'restaurant-admin')}
                  >
                    <Settings />
                    Настроить
                  </a>
                </>
              )}
              {template.isCatalogTemplate && (
                <button
                  className="is-danger"
                  type="button"
                  disabled={deletingTemplateId === template.templateVersionId}
                  aria-label={`Удалить шаблон ${template.templateName}`}
                  onClick={async () => {
                    const confirmed = window.confirm(
                      `Удалить шаблон «${template.templateName}»?\n\nБудет удалён только шаблон и его наполнение. Уже созданные клиенты и их каталоги сохранятся.`
                    );
                    if (!confirmed) return;

                    setDeletingTemplateId(template.templateVersionId);
                    try {
                      await deleteRestaurantTemplate(template.templateVersionId);
                      toast.success('Шаблон удалён. Клиенты и их каталоги сохранены.');
                      await queryClient.invalidateQueries({ queryKey: ['platform-templates'] });
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Не удалось удалить шаблон');
                    } finally {
                      setDeletingTemplateId('');
                    }
                  }}
                >
                  <Trash2 />
                  {deletingTemplateId === template.templateVersionId ? 'Удаляем...' : 'Удалить'}
                </button>
              )}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
