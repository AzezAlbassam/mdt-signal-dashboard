// The vault must round-trip every file, refuse a wrong passphrase, and leave nothing readable.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { sealDir, openDir, isSealed } from './vault.js'

test('seal then open gives back every file; a wrong passphrase opens nothing', async () => {
  const d = mkdtempSync(join(tmpdir(), 'vault-'))
  mkdirSync(join(d, 'history'))
  const files = { 'index.json': { tickers: { MSTR: { tier: 'B' } } }, 'MSTR.json': { rows: [[1, 2.5, 'C']] }, 'history/MSTR.json': { dates: ['2026-11-20'] } }
  for (const [f, j] of Object.entries(files)) writeFileSync(join(d, f), JSON.stringify(j))
  assert.equal(await sealDir(d, 'correct horse'), 3)
  for (const f of Object.keys(files)) {
    const raw = readFileSync(join(d, f), 'utf8')
    assert.ok(isSealed(JSON.parse(raw)), f)
    assert.ok(!raw.includes('MSTR') && !raw.includes('2026'), `${f} leaks nothing`)
  }
  assert.equal(await sealDir(d, 'correct horse'), 0, 'sealing twice is a no-op')
  await assert.rejects(openDir(d, 'wrong'), /wrong passphrase/)
  assert.equal(await openDir(d, 'correct horse'), 3)
  for (const [f, j] of Object.entries(files)) assert.deepEqual(JSON.parse(readFileSync(join(d, f), 'utf8')), j)
  // The next seal reuses the same salt, so the page's stored key keeps working.
  const salt = JSON.parse(readFileSync(join(d, 'vault.json'), 'utf8')).salt
  await sealDir(d, 'correct horse')
  assert.equal(JSON.parse(readFileSync(join(d, 'vault.json'), 'utf8')).salt, salt)
})
