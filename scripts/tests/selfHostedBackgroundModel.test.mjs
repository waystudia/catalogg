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
const modelRoot = resolve(repoRoot, 'public/assets/models/isnet-general-use-onnx-5349b617');

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

describe('self-hosted product background model', () => {
  it('disables remote model loading and pins the browser runtime to same-origin assets', () => {
    const implementation = readFileSync(implementationPath, 'utf8');

    assert.match(implementation, /env\.allowRemoteModels\s*=\s*false/);
    assert.match(implementation, /env\.allowLocalModels\s*=\s*true/);
    assert.match(implementation, /env\.localModelPath\s*=\s*localModelPath/);
    assert.match(implementation, /local_files_only:\s*true/);
    assert.match(implementation, /env\.backends\.onnx\.wasm\.wasmPaths\s*=/);
    assert.match(implementation, /isnet-general-use-onnx-5349b617/);
    assert.doesNotMatch(implementation, /https:\/\/(?:huggingface\.co|cdn\.jsdelivr\.net)/);
  });

  it('ships the pinned Apache-2.0 model files with verified hashes and provenance', () => {
    const expectedHashes = {
      'config.json': '426dfb95a85e2553794c4bc4aaaf8d341ca888950db9a42e80c2a5048046b139',
      'preprocessor_config.json': '08fd8cb8d1c6976d62659f4e4f18e848ba0469767b755210c07003683bfdfb26',
      'onnx/model_quantized.onnx': '5039225b9a4ac3df55f185d24b7a92d640c86cc4747002d7f23351e394de03a6',
      'README.md': 'bf03164b094cc0ee26d1cf432ee06031c68e63f5e32206bae8c0fe3c157f54b4'
    };

    for (const [relativePath, expectedHash] of Object.entries(expectedHashes)) {
      assert.equal(sha256(resolve(modelRoot, relativePath)), expectedHash, relativePath);
    }

    const provenance = JSON.parse(readFileSync(resolve(modelRoot, 'MODEL_PROVENANCE.json'), 'utf8'));
    assert.equal(provenance.sourceRevision, '5349b617911fd60c619b52f32e2b593517b78df3');
    assert.equal(provenance.license, 'Apache-2.0');
    assert.match(readFileSync(resolve(modelRoot, 'LICENSE'), 'utf8'), /Apache License[\s\S]*Version 2\.0/);
  });
});
