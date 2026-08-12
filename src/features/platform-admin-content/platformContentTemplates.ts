import type {
  PlatformBannerPosition,
  PlatformContentBlock
} from '../../shared/api/platformTypes';

export type BannerLayoutTemplate = {
  id: 'left' | 'right' | 'split' | 'center';
  name: string;
  description: string;
  contentPosition: PlatformBannerPosition;
  buttonPosition: PlatformBannerPosition;
};

export const bannerLayoutTemplates: BannerLayoutTemplate[] = [
  {
    id: 'left',
    name: 'Классика слева',
    description: 'Заголовок сверху, действие снизу слева',
    contentPosition: 'top-left',
    buttonPosition: 'bottom-left'
  },
  {
    id: 'right',
    name: 'Акцент справа',
    description: 'Текст и действие выровнены по правому краю',
    contentPosition: 'top-right',
    buttonPosition: 'bottom-right'
  },
  {
    id: 'split',
    name: 'Раздельный',
    description: 'Текст по центру слева, действие снизу справа',
    contentPosition: 'center-left',
    buttonPosition: 'bottom-right'
  },
  {
    id: 'center',
    name: 'По центру',
    description: 'Заголовок сверху и действие снизу по центру',
    contentPosition: 'top-center',
    buttonPosition: 'bottom-center'
  }
];

export type PlatformPageTemplateId = 'text' | 'image' | 'hybrid';

export const platformPageTemplates: Array<{
  id: PlatformPageTemplateId;
  name: string;
  description: string;
}> = [
  { id: 'text', name: 'Только текст', description: 'Заголовок, подробный текст и кнопка' },
  { id: 'image', name: 'Большая картинка', description: 'Одна полноширинная фотография на всю страницу' },
  { id: 'hybrid', name: 'Текст + фото', description: 'Заголовок, описание, большая фотография и кнопка' }
];

const block = (
  createId: () => string,
  type: PlatformContentBlock['type'],
  patch: Partial<PlatformContentBlock> = {}
): PlatformContentBlock => ({
  id: createId(),
  type,
  content: '',
  url: '',
  label: '',
  ...patch
});

export const buildPlatformPageTemplate = (
  templateId: PlatformPageTemplateId,
  imageUrl: string,
  createId: () => string = () => crypto.randomUUID()
): PlatformContentBlock[] => {
  if (templateId === 'image') {
    return [block(createId, 'image', { url: imageUrl, content: 'Главная фотография' })];
  }

  if (templateId === 'hybrid') {
    return [
      block(createId, 'heading', { content: 'Заголовок предложения' }),
      block(createId, 'text', { content: 'Расскажите об акции, новости или конкурсе. Этот текст можно изменить.' }),
      block(createId, 'image', { url: imageUrl, content: 'Фотография предложения' }),
      block(createId, 'button', { url: '/restaurants', label: 'Заказать' })
    ];
  }

  return [
    block(createId, 'heading', { content: 'Заголовок предложения' }),
    block(createId, 'text', { content: 'Добавьте подробное описание, условия и важную информацию для клиента.' }),
    block(createId, 'button', { url: '/restaurants', label: 'Подробнее' })
  ];
};
