import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const deployScript = resolve(repoRoot, 'scripts/deploy-wayyaam-static.sh');

const createSource = (root, name, assetName) => {
  const source = resolve(root, name);
  mkdirSync(resolve(source, 'assets'), { recursive: true });
  writeFileSync(resolve(source, 'index.html'), `<script src="/assets/${assetName}"></script>`);
  writeFileSync(
    resolve(source, 'assets', assetName),
    `const url='https://api.wayyaam.ru';const key='sb_publishable_test_only_12345678901234567890';console.log('${assetName}',url,key)`
  );
  writeFileSync(resolve(source, 'sw.js'), `// ${name}`);
  return source;
};

describe('WayYaam static release deployment', () => {
  it('keeps assets from every release addressable through the current release', () => {
    const workspace = mkdtempSync(resolve(tmpdir(), 'wayyaam-static-release-'));
    try {
      const webRoot = resolve(workspace, 'web');
      const firstSource = createSource(workspace, 'first-source', 'index-first.js');
      const secondSource = createSource(workspace, 'second-source', 'index-second.js');

      execFileSync(deployScript, [firstSource, 'release-first', webRoot]);
      execFileSync(deployScript, [secondSource, 'release-second', webRoot]);

      assert.equal(readlinkSync(resolve(webRoot, 'current')), 'releases/release-second');
      assert.equal(readlinkSync(resolve(webRoot, 'current', 'assets')), '../../shared-static/assets');
      assert.match(readFileSync(resolve(webRoot, 'current', 'assets', 'index-first.js'), 'utf8'), /index-first\.js/);
      assert.match(readFileSync(resolve(webRoot, 'current', 'assets', 'index-second.js'), 'utf8'), /index-second\.js/);
      assert.match(readFileSync(resolve(webRoot, 'current', 'index.html'), 'utf8'), /index-second\.js/);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('refuses to overwrite an existing immutable release', () => {
    const workspace = mkdtempSync(resolve(tmpdir(), 'wayyaam-static-release-'));
    try {
      const webRoot = resolve(workspace, 'web');
      const source = createSource(workspace, 'source', 'index-main.js');
      execFileSync(deployScript, [source, 'release-fixed', webRoot]);

      assert.throws(
        () => execFileSync(deployScript, [source, 'release-fixed', webRoot], { stdio: 'pipe' }),
        /Command failed/
      );
      assert.match(readFileSync(resolve(webRoot, 'current', 'index.html'), 'utf8'), /index-main\.js/);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('refuses to activate a bundle without the production Supabase URL or browser-safe key', () => {
    const workspace = mkdtempSync(resolve(tmpdir(), 'wayyaam-static-release-'));
    try {
      const webRoot = resolve(workspace, 'web');
      const source = createSource(workspace, 'invalid-source', 'index-invalid.js');
      writeFileSync(resolve(source, 'assets', 'index-invalid.js'), 'console.log("missing production auth config")');

      assert.throws(
        () => execFileSync(deployScript, [source, 'release-invalid', webRoot], { stdio: 'pipe' }),
        /Command failed/
      );
      assert.throws(() => readlinkSync(resolve(webRoot, 'current')));
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
