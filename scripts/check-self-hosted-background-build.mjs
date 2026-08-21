import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const distRoot = resolve(process.cwd(), 'dist');
const assetsRoot = resolve(distRoot, 'assets');
const modelRoot = resolve(assetsRoot, 'models/u2netp-7112208');
const expectedModelHash = '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8';

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

assert.equal(sha256(resolve(modelRoot, 'onnx/model.onnx')), expectedModelHash);

const scripts = readdirSync(assetsRoot).filter((name) => name.endsWith('.js'));
const backgroundChunkName = scripts.find((name) => (
  name.startsWith('SharedProductCatalogPage-')
  && readFileSync(resolve(assetsRoot, name), 'utf8').includes('u2netp-7112208')
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

assert.doesNotMatch(backgroundChunk, /BritishWerewolf\/U-2-Netp/);
console.log(`self_hosted_background_build=passed chunk=${backgroundChunkName}`);
