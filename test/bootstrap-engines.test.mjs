import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

function fixture() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'gallery-bootstrap-test-')));
  const json = (file, value) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), JSON.stringify(value));
  };
  mkdirSync(path.join(root, 'scripts'));
  copyFileSync(new URL('../scripts/bootstrap-engines.mjs', import.meta.url), path.join(root, 'scripts/bootstrap-engines.mjs'));
  json('package.json', { version: '2.0.0', type: 'module' });
  json('package-lock.json', {});
  json('.github/bootstrap-engines.json', { galleryVersion: '2.0.0' });
  for (const name of ['opf', 'opf-render']) json(`node_modules/@openpresentation/${name}/package.json`, { name: `@openpresentation/${name}`, version: '0.18.1', exports: { '.': './index.js', './package.json': './package.json' } });
  for (const name of ['opf', 'opf-render']) writeFileSync(path.join(root, `node_modules/@openpresentation/${name}/index.js`), 'export {};');
  const hashes = Object.fromEntries(['package.json', 'package-lock.json'].map(name => [name, createHash('sha256').update(readFileSync(path.join(root, name))).digest('hex')]));
  const resolved = Object.fromEntries([['core', 'opf'], ['render', 'opf-render']].map(([name, pkg]) => [name, { path: path.join(root, `node_modules/@openpresentation/${pkg}/package.json`), entry: path.join(root, `node_modules/@openpresentation/${pkg}/index.js`), version: '0.18.1' }]));
  for (const item of Object.values(resolved)) {
    item.entry = path.join(path.dirname(item.path), 'index.js');
    const digest = createHash('sha256');
    for (const name of ['index.js', 'package.json']) digest.update(name).update('\0').update(readFileSync(path.join(path.dirname(item.path), name))).update('\0');
    item.digest = digest.digest('hex');
  }
  json('node_modules/.gallery-bootstrap.json', { hashes, resolved });
  return { root, json, run: () => spawnSync(process.execPath, ['scripts/bootstrap-engines.mjs', '--verify'], { cwd: root, encoding: 'utf8' }) };
}

test('bootstrap verification refuses changed release manifests and a renderer with a stale nested core', () => {
  const f = fixture();
  try {
    assert.equal(f.run().status, 0);
    writeFileSync(path.join(f.root, 'node_modules/@openpresentation/opf/index.js'), 'export const registry = true;');
    assert.match(f.run().stderr, /engine resolution changed/);
    writeFileSync(path.join(f.root, 'node_modules/@openpresentation/opf/index.js'), 'export {};');
    f.json('package-lock.json', { changed: true });
    assert.match(f.run().stderr, /modified the gallery manifest or lockfile/);
    f.json('package-lock.json', {});
    f.json('node_modules/@openpresentation/opf-render/node_modules/@openpresentation/opf/package.json', { version: '0.18.0', exports: { '.': './index.js', './package.json': './package.json' } });
    assert.match(f.run().stderr, /Renderer resolves a different core/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('later versions use registry engines and reject leftover bootstrap state', () => {
  const f = fixture();
  try {
    f.json('package.json', { version: '2.1.0', type: 'module' });
    assert.match(f.run().stderr, /Unexpected bootstrap state/);
    rmSync(path.join(f.root, 'node_modules/.gallery-bootstrap.json'));
    const result = f.run();
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Registry engines/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
