import assert from 'node:assert/strict';
import test from 'node:test';
import { getPartnerRegistrationErrorMessage } from './partnerRegistrationErrors';
import { normalizeVehiclePlate } from './partnerRegistrationFields';

test("shows the specific Edge Function validation error instead of a generic alert", async () => {
  const response = new Response(
    JSON.stringify({ error: "driver_geography_required" }),
    {
      status: 400,
      headers: { "content-type": "application/json" },
    },
  );

  const message = await getPartnerRegistrationErrorMessage({
    message: "Edge Function returned a non-2xx status code",
    context: response,
  });

  assert.equal(message, "Укажите место проживания и основной город работы.");
});

test("keeps the SDK fallback for an unreadable response", async () => {
  const message = await getPartnerRegistrationErrorMessage(
    new Error("email_invalid"),
  );
  assert.equal(message, "Введите корректную почту.");
});

test('normalizes Russian keyboard plate letters to the Latin registration alphabet', () => {
  assert.equal(normalizeVehiclePlate('а123вс 95'), 'A123BC 95');
});
