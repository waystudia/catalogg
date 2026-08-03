import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';

const clientCss = fs.readFileSync(
  new URL('../../src/pages/client-platform/client-platform.css', import.meta.url),
  'utf8'
);

describe('client favorite button layout contract', () => {
  it('keeps the restaurant heart centered inside its circular button on mobile Safari', () => {
    assert.match(
      clientCss,
      /\.restaurant-card__favorite\s*\{[^}]*display:\s*inline-grid;[^}]*place-items:\s*center;[^}]*padding:\s*0;[^}]*line-height:\s*1;/s
    );
    assert.match(
      clientCss,
      /\.restaurant-card__favorite svg\s*\{[^}]*display:\s*block;[^}]*width:\s*18px;[^}]*height:\s*18px;[^}]*margin:\s*0;/s
    );
  });
});
