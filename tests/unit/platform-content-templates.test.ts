import { describe, expect, it } from 'vitest';
import {
  bannerLayoutTemplates,
  buildPlatformPageTemplate,
  platformPageTemplates
} from '../../src/features/platform-admin-content/platformContentTemplates';

describe('platform banner templates', () => {
  it('offers four distinct text and button arrangements', () => {
    expect(bannerLayoutTemplates).toHaveLength(4);
    expect(new Set(bannerLayoutTemplates.map((template) => template.id)).size).toBe(4);
    expect(bannerLayoutTemplates.map((template) => [template.contentPosition, template.buttonPosition])).toEqual([
      ['top-left', 'bottom-left'],
      ['top-right', 'bottom-right'],
      ['center-left', 'bottom-right'],
      ['top-center', 'bottom-center']
    ]);
  });
});

describe('platform content page templates', () => {
  const build = (templateId: 'text' | 'image' | 'hybrid') => {
    let index = 0;
    return buildPlatformPageTemplate(templateId, '/generated-banner.png', () => `block-${++index}`);
  };

  it('offers text, image, and hybrid page structures', () => {
    expect(platformPageTemplates.map((template) => template.id)).toEqual(['text', 'image', 'hybrid']);
    expect(build('text').map((block) => block.type)).toEqual(['heading', 'text', 'button']);
    expect(build('image').map((block) => block.type)).toEqual(['image']);
    expect(build('hybrid').map((block) => block.type)).toEqual(['heading', 'text', 'image', 'button']);
  });

  it('uses the generated project image for visual templates and unique block ids', () => {
    expect(build('image')[0]).toMatchObject({ url: '/generated-banner.png' });
    const hybrid = build('hybrid');
    expect(hybrid.find((block) => block.type === 'image')).toMatchObject({ url: '/generated-banner.png' });
    expect(new Set(hybrid.map((block) => block.id)).size).toBe(hybrid.length);
  });
});
