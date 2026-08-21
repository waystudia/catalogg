import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const distRoot = resolve(process.cwd(), 'dist');
const assetsRoot = resolve(distRoot, 'assets');
const modelRoot = resolve(assetsRoot, 'models/isnet-general-use-onnx-5349b617');
const expectedModelHash = '5039225b9a4ac3df55f185d24b7a92d640c86cc4747002d7f23351e394de03a6';

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

assert.equal(sha256(resolve(modelRoot, 'onnx/model_quantized.onnx')), expectedModelHash);

const scripts = readdirSync(assetsRoot).filter((name) => name.endsWith('.js'));
const backgroundChunkName = scripts.find((name) => (
  name.startsWith('SharedProductCatalogPage-')
  && readFileSync(resolve(assetsRoot, name), 'utf8').includes('isnet-general-use-onnx-5349b617')
));
assert.ok(backgroundChunkName, 'Missing background-removal application chunk');

const backgroundChunk = readFileSync(resolve(assetsRoot, backgroundChunkName), 'utf8');
assert.match(backgroundChunk, /assets\/models\//);
assert.match(backgroundChunk, /allowRemoteModels\s*=\s*!1/);
assert.match(backgroundChunk, /allowLocalModels\s*=\s*!0/);
assert.match(backgroundChunk, /local_files_only:\s*!0/);

const wasmFiles = readdirSync(assetsRoot).filter((name) => (
  /^ort-wasm-simd-threaded\.jsep-[A-Za-z0-9_-]+\.(?:mjs|wasm)$/.test(name)
));
assert.equal(wasmFiles.filter((name) => name.endsWith('.mjs')).length, 1);
assert.equal(wasmFiles.filter((name) => name.endsWith('.wasm')).length, 1);
for (const wasmFile of wasmFiles) assert.match(backgroundChunk, new RegExp(wasmFile.replace('.', '\\.')));

assert.doesNotMatch(backgroundChunk, /(?:BritishWerewolf\/U-2-Netp|huggingface\.co)/);
console.log(`self_hosted_background_build=passed chunk=${backgroundChunkName}`);
