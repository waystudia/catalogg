import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('restaurant payment settings header contract', () => {
  it('shows exactly one shared settings header around the payment form', async () => {
    const app = await read('src/app/App.tsx');
    const paymentCard = await read('src/features/restaurant-settings/PaymentSettingsCard.tsx');
    const renderSettingsStart = app.indexOf('const renderSettings = () =>');
    const renderSettingsEnd = app.indexOf('const renderRestaurantAdmin = () =>', renderSettingsStart);
    const renderSettings = app.slice(renderSettingsStart, renderSettingsEnd);

    assert.match(renderSettings, /<SettingsHeader/);
    assert.match(renderSettings, /screen === 'settings-payments'/);
    assert.match(renderSettings, /<PaymentSettingsCard/);
    assert.doesNotMatch(paymentCard, /import \{ SettingsHeader \}/);
    assert.doesNotMatch(paymentCard, /<SettingsHeader/);
    assert.doesNotMatch(paymentCard, /onBack:/);
  });
});
