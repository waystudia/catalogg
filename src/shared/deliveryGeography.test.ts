import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getDeliveryCityOptions,
  getDeliverySettlementOptions,
  keepSettlementsAvailableForCity
} from './deliveryGeography';

const geography = [
  { cityName: 'Курчалой', settlementName: 'Аллерой' },
  { cityName: ' Курчалой ', settlementName: 'Бачи-Юрт' },
  { cityName: 'Грозный', settlementName: 'Черноречье' },
  { cityName: 'курчалой', settlementName: 'Аллерой' }
];

describe('delivery geography choices', () => {
  it('shows unique cities from the geography directory', () => {
    assert.deepEqual(getDeliveryCityOptions(geography), ['Грозный', 'Курчалой']);
  });

  it('shows only settlements assigned to the selected city', () => {
    assert.deepEqual(
      getDeliverySettlementOptions(geography, ' КУРЧАЛОЙ '),
      ['Аллерой', 'Бачи-Юрт']
    );
    assert.deepEqual(getDeliverySettlementOptions(geography, ''), []);
  });

  it('drops settlements from the previous city when the city changes', () => {
    assert.deepEqual(
      keepSettlementsAvailableForCity(
        ['Черноречье', 'Бачи-Юрт', 'Неизвестное село'],
        geography,
        'Курчалой'
      ),
      ['Бачи-Юрт']
    );
  });
});
