import { describe, expect, it } from 'vitest';
import {
  buildMerchantOrderPanelUrl,
  buildWhatsappOrderNotificationText
} from '../../src/shared/whatsappOrder';

describe('merchant WhatsApp order notification', () => {
  it('contains only the public order number and an authenticated panel link', () => {
    const panelUrl = buildMerchantOrderPanelUrl({
      origin: 'https://wayyaam.ru',
      basePath: '/',
      merchantSlug: 'finik',
      orderId: '7b4c6ac5-7b9d-4e61-b2cc-c3aa64afcf97'
    });
    const text = buildWhatsappOrderNotificationText({
      orderNumber: '5821-2',
      panelUrl
    });

    expect(panelUrl).toBe(
      'https://wayyaam.ru/#/login?returnTo=%2Ffinik%2Forder%2F7b4c6ac5-7b9d-4e61-b2cc-c3aa64afcf97'
    );
    expect(text).toBe([
      'Новый заказ WayYaam №5821-2.',
      'Откройте заказ в панели WayYaam.',
      panelUrl
    ].join('\n'));
    expect(text).not.toMatch(/адрес|телефон|клиент|товар|состав|комментар|оплат|итого/i);
    expect(panelUrl).not.toMatch(/token|session|secret/i);
  });

  it('normalizes unsafe path input without exposing it as query data', () => {
    expect(buildMerchantOrderPanelUrl({
      origin: 'https://wayyaam.ru/',
      basePath: '/app/',
      merchantSlug: 'Магазин / тест',
      orderId: 'order / 1'
    })).toBe(
      'https://wayyaam.ru/app/#/login?returnTo=%2F%25D0%259C%25D0%25B0%25D0%25B3%25D0%25B0%25D0%25B7%25D0%25B8%25D0%25BD%2520%252F%2520%25D1%2582%25D0%25B5%25D1%2581%25D1%2582%2Forder%2Forder%2520%252F%25201'
    );
  });
});
