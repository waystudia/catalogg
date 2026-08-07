const colors = {
  reset: '\u001b[0m', client: '\u001b[36m', restaurant: '\u001b[35m', driver: '\u001b[33m',
  qr: '\u001b[34m', finance: '\u001b[32m', e2e: '\u001b[1;32m', error: '\u001b[1;31m'
};

export const log = (scope, message) => {
  const key = scope.toLowerCase();
  const color = colors[key] || colors.reset;
  process.stdout.write(`${color}[${scope.padEnd(10)}]${colors.reset} ${message}\n`);
};

export const printStatus = (state) => {
  const debt = (value) => `${Number(value || 0).toLocaleString('ru-RU')} ₽`;
  process.stdout.write(`\nWAYYAAM VISUAL E2E\n\n`);
  process.stdout.write(`CLIENT       ${state.client || '⏳ WAITING'}\n`);
  process.stdout.write(`RESTAURANT   ${state.restaurant || '⏳ WAITING'}\n`);
  process.stdout.write(`DRIVER       ${state.driver || '⏳ WAITING'}\n\n`);
  process.stdout.write(`ORDER        ${state.orderId || 'waiting'}\n`);
  process.stdout.write(`STATUS       ${state.status || 'waiting'}\n`);
  process.stdout.write(`RESTAURANT   ${debt(state.restaurantDelta)} / expected +30 ₽\n`);
  process.stdout.write(`DRIVER       ${debt(state.driverDelta)} / expected +30 ₽\n`);
  process.stdout.write(`QR           ${state.qr || 'waiting'}\n`);
  process.stdout.write(`REALTIME     ${state.realtime || 'connected'}\n\n`);
};
