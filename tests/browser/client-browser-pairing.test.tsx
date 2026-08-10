import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import {
  ClientBrowserPairingBanner,
  ClientPwaPairingCodeCard
} from '../../src/features/client-pairing/ClientPairing';

test('creates and copies a short pairing code inside the signed-in PWA profile', async () => {
  let copied = '';
  const screen = await render(
    <ClientPwaPairingCodeCard
      createCode={async () => ({ code: 'A1B2C3D4E5F6', expiresAt: '2026-08-10T18:05:00.000Z' })}
      copyText={async (value) => { copied = value; }}
    />
  );

  await screen.getByRole('button', { name: 'Связать Safari без пароля' }).click();
  await expect.element(screen.getByText('A1B2-C3D4-E5F6')).toBeVisible();

  await screen.getByRole('button', { name: 'Скопировать код сопряжения' }).click();
  expect(copied).toBe('A1B2-C3D4-E5F6');
});

test('redeems the PWA code in Safari and confirms checkout profile autofill', async () => {
  let redeemedCode = '';
  const screen = await render(
    <ClientBrowserPairingBanner
      standalone={false}
      mobile
      hasSession={false}
      redeemCode={async (code) => {
        redeemedCode = code;
        return {
          accountId: '8f272f45-27d0-4baf-a7bb-5ae4e7a0b775',
          name: 'Адам',
          phone: '+79280000000',
          expiresAt: 'infinity'
        };
      }}
      reload={() => undefined}
    />
  );

  await screen.getByRole('button', { name: 'Связать профиль' }).click();
  await screen.getByLabelText('Код из PWA').fill('a1b2-c3d4-e5f6');
  await screen.getByRole('button', { name: 'Подтвердить' }).click();

  expect(redeemedCode).toBe('A1B2C3D4E5F6');
  await expect.element(
    screen.getByText('Профиль Адам связан. Имя и телефон будут подставлены в заказ.')
  ).toBeVisible();
});

test('does not advertise pairing inside the installed PWA', async () => {
  const screen = await render(
    <ClientBrowserPairingBanner standalone mobile hasSession={false} />
  );

  await expect.element(screen.getByText('Заказываете по ссылке из WhatsApp?')).not.toBeInTheDocument();
});
