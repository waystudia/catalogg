import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const implementationPath = resolve(
  repoRoot,
  'src/features/shared-product-catalog/productPhotoBackground.ts'
);
const modelRoot = resolve(repoRoot, 'public/assets/models/u2netp-7112208');

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

describe('self-hosted product background model', () => {
  it('disables remote model loading and pins the browser runtime to same-origin assets', () => {
    const implementation = readFileSync(implementationPath, 'utf8');

    assert.match(implementation, /env\.allowRemoteModels\s*=\s*false/);
    assert.match(implementation, /env\.allowLocalModels\s*=\s*true/);
    assert.match(implementation, /env\.localModelPath\s*=\s*localModelPath/);
    assert.match(implementation, /local_files_only:\s*true/);
    assert.match(implementation, /env\.backends\.onnx\.wasm\.wasmPaths\s*=/);
    assert.match(implementation, /u2netp-7112208/);
    assert.doesNotMatch(implementation, /https:\/\/(?:huggingface\.co|cdn\.jsdelivr\.net)/);
  });

  it('ships the pinned Apache-2.0 model files with verified hashes and provenance', () => {
    const expectedHashes = {
      'config.json': '863f4c818e573a77b0bedea8ecacc6c449ec24e8c179e2f8b1f4067ba8d0dea6',
      'preprocessor_config.json': '5c3d708ff6895b1e1a21df70c3a4fceb82ddb595d3ffba7b3a15927d59f7479a',
      'onnx/model.onnx': '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8',
      'README.md': '036deb6565b21e290600f0b936f161e94da6e8e8e158b2d0577458e21071cbe2'
    };

    for (const [relativePath, expectedHash] of Object.entries(expectedHashes)) {
      assert.equal(sha256(resolve(modelRoot, relativePath)), expectedHash, relativePath);
    }

    const provenance = JSON.parse(readFileSync(resolve(modelRoot, 'MODEL_PROVENANCE.json'), 'utf8'));
    assert.equal(provenance.sourceRevision, '7112208dbac3a3642496c8d54e2f0f9bb3dc1dc8');
    assert.equal(provenance.license, 'Apache-2.0');
    assert.match(readFileSync(resolve(modelRoot, 'LICENSE'), 'utf8'), /Apache License[\s\S]*Version 2\.0/);
  });
});
