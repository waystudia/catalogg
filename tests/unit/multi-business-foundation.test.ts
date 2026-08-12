import { describe, expect, it } from 'vitest';
import {
  BUSINESS_TYPE_DEFINITIONS,
  getBusinessTypeDefinition,
  getSelectableBusinessTypes,
  isBusinessType
} from '../../src/shared/businessRegistry';
import {
  BUSINESS_TERMINOLOGY,
  getBusinessTerms,
  normalizeBusinessType
} from '../../src/shared/businessTerminology';
import { platformFallbackTemplates } from '../../src/shared/api/templatesApi';
import { getCatalogAdminAccess } from '../../src/shared/api/catalogAdminApi';
import { createClientSchema } from '../../src/shared/validation/clientCredentials';

describe('multi-business tenant foundation', () => {
  it('offers the four launch types and keeps future regulated types unavailable', () => {
    expect(BUSINESS_TYPE_DEFINITIONS).toEqual([
      { code: 'restaurant', label: 'Ресторан', emoji: '🍽', availability: 'active' },
      { code: 'coffee_shop', label: 'Кофейня', emoji: '☕', availability: 'active' },
      { code: 'confectionery', label: 'Кондитерская', emoji: '🍰', availability: 'active' },
      { code: 'grocery', label: 'Продуктовый магазин', emoji: '🛒', availability: 'active' },
      { code: 'flowers', label: 'Цветочный магазин', emoji: '💐', availability: 'disabled' },
      { code: 'gifts', label: 'Магазин подарков', emoji: '🎁', availability: 'disabled' },
      { code: 'household', label: 'Хозяйственный магазин', emoji: '🧹', availability: 'disabled' },
      { code: 'pharmacy', label: 'Аптека', emoji: '💊', availability: 'compliance_blocked' }
    ]);
    expect(getSelectableBusinessTypes().map(({ code }) => code)).toEqual([
      'restaurant',
      'coffee_shop',
      'confectionery',
      'grocery'
    ]);
    expect(getBusinessTypeDefinition('pharmacy')).toMatchObject({
      label: 'Аптека',
      availability: 'compliance_blocked'
    });
    expect(getBusinessTypeDefinition('not-a-business')).toBe(BUSINESS_TYPE_DEFINITIONS[0]);
    expect(isBusinessType('grocery')).toBe(true);
    expect(isBusinessType('not-a-business')).toBe(false);
    expect(isBusinessType(null)).toBe(false);
  });

  it('uses store and product language for a grocery workspace', () => {
    expect(BUSINESS_TERMINOLOGY.grocery).toEqual({
      place: 'Магазин',
      placeLower: 'магазин',
      placeAccusative: 'магазин',
      placePrepositional: 'магазине',
      placeInstrumental: 'магазином',
      placeGenitive: 'магазина',
      placeDative: 'магазину',
      item: 'Товар',
      itemLower: 'товар',
      items: 'Товары',
      itemGenitive: 'товара',
      addItem: 'Добавить товар',
      driverRoute: 'Еду в магазин',
      driverRouteAction: 'Поехать в магазин',
      driverArrival: 'Я в магазине',
      driverAtPlaceStatus: 'На месте в магазине',
      orderPrepared: 'Заказ собран магазином',
      paymentConfirmation: 'Магазин получил заказ и проверяет оплату.'
    });
    expect(normalizeBusinessType('grocery')).toBe('grocery');
    expect(getBusinessTerms('grocery')).toBe(BUSINESS_TERMINOLOGY.grocery);
  });

  it('accepts grocery onboarding input while still rejecting unknown business codes', () => {
    const validPayload = {
      name: 'Финики',
      slug: 'finiki',
      ownerName: 'Магомед',
      email: 'owner@finiki.example',
      phone: '+7 999 123-45-67',
      primaryCity: 'Грозный',
      serviceSettlementsText: 'Беркат-Юрт',
      password: 'StrongPass1!',
      templateVersionId: '00000000-0000-4000-8000-000000000005',
      businessType: 'grocery',
      templateType: 'grocery',
      seedDemoMenu: false,
      planId: 'trial',
      subscriptionEndsAt: '',
      status: 'pending',
      subscriptionStatus: 'trial',
      sendEmail: false,
      adminConsentConfirmed: true
    } as const;

    expect(createClientSchema.parse(validPayload)).toMatchObject({
      businessType: 'grocery',
      templateType: 'grocery',
      status: 'pending'
    });
    expect(createClientSchema.safeParse({ ...validPayload, businessType: 'unknown' }).success).toBe(false);
  });

  it('keeps a grocery draft template after the three existing templates', () => {
    expect(platformFallbackTemplates.map((template) => template.businessType)).toEqual([
      'restaurant',
      'coffee_shop',
      'confectionery',
      'grocery'
    ]);
    expect(platformFallbackTemplates[3]).toMatchObject({
      templateKey: 'grocery',
      templateName: 'Продуктовый магазин',
      businessType: 'grocery'
    });
  });

  it('keeps the local legacy workspace on the canonical restaurant fallback', async () => {
    const access = await getCatalogAdminAccess('local-demo');

    expect(access.catalog?.businessType).toBe('restaurant');
  });
});
