import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import '../../src/app/styles.css';

test('keeps the mobile viewport locked to vertical page scrolling', async () => {
  await page.viewport(378, 628);

  try {
    await render(<div aria-label="Широкий тестовый блок" style={{ width: '120vw', height: 900 }} />);

    const htmlOverflow = getComputedStyle(document.documentElement).overflowX;
    const bodyOverflow = getComputedStyle(document.body).overflowX;

    expect(['hidden', 'clip']).toContain(htmlOverflow);
    expect(['hidden', 'clip']).toContain(bodyOverflow);
    expect(getComputedStyle(document.documentElement).overscrollBehaviorX).toBe('none');
  } finally {
    await page.viewport(414, 896);
  }
});
