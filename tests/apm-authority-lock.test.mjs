import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const lock = JSON.parse(await readFile(new URL('../apm-authority.lock.json', import.meta.url), 'utf8'));
const sha = /^[0-9a-f]{40}$/;

test('APM authority lock keeps both authored peers first class', () => {
  assert.equal(lock.version, 1);
  assert.match(lock.authority.revision, sha);
  assert.match(lock.validator.revision, sha);
  assert.match(lock.authority.typespec, /\.tsp$/);
  assert.match(lock.authority.jsonSchema, /\.schema\.json$/);
  assert.notEqual(lock.authority.typespec, lock.authority.jsonSchema);
  assert.equal(lock.validator.precedence, 'none');
  assert.equal(lock.validator.generatedRole, 'comparison-evidence-only');
  assert.equal(lock.validator.int64Strategy, 'string');
});
