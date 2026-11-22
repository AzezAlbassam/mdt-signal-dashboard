// Keep the published data readable only with a passphrase.
//
//   VAULT_PASS=... node options/vault.js seal <dataDir>   # every .json -> encrypted wrapper
//   VAULT_PASS=... node options/vault.js open <dataDir>   # back to plain JSON (plain files stay)
//
// The market-data licence is personal: the snapshots may serve the one person who holds the
// passphrase, not whoever finds the site. Each file is gzipped and encrypted with AES-256-GCM
// under a key derived from the passphrase (PBKDF2-SHA256); vault.json holds the salt and a check
// value, so the page can tell a wrong passphrase from damaged data. The page decrypts the same
// way with WebCrypto.

import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

export const ITERATIONS = 210000
const CHECK = 'options-liquidity'

export const deriveKey = (pass, salt, iterations = ITERATIONS) => pbkdf2Sync(pass, salt, iterations, 32, 'sha256')

export function seal(obj, key) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([c.update(gzipSync(Buffer.from(JSON.stringify(obj)))), c.final(), c.getAuthTag()])
  return { vault: 1, iv: iv.toString('base64'), data: data.toString('base64') }
}

export const isSealed = (j) => j?.vault === 1 && typeof j.iv === 'string' && typeof j.data === 'string'

export function open(wrapper, key) {
  const buf = Buffer.from(wrapper.data, 'base64')
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(wrapper.iv, 'base64'))
  d.setAuthTag(buf.subarray(buf.length - 16))
  return JSON.parse(gunzipSync(Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()])).toString())
}

/** The key for a data directory: from its vault.json, or a new vault.json if there is none. */
export async function keyFor(dir, pass) {
  if (!pass) throw new Error('VAULT_PASS is not set')
  let meta = null
  try { meta = JSON.parse(await readFile(join(dir, 'vault.json'), 'utf8')) } catch {}
  if (meta) {
    const key = deriveKey(pass, Buffer.from(meta.salt, 'base64'), meta.iterations)
    try { if (open(meta.check, key) === CHECK) return key } catch {}
    throw new Error('wrong passphrase for this data')
  }
  const salt = randomBytes(16)
  const key = deriveKey(pass, salt)
  await writeFile(join(dir, 'vault.json'), JSON.stringify({ salt: salt.toString('base64'), iterations: ITERATIONS, check: seal(CHECK, key) }))
  return key
}

async function* jsonFiles(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) yield* jsonFiles(join(dir, e.name))
    else if (e.name.endsWith('.json') && e.name !== 'vault.json') yield join(dir, e.name)
  }
}

export async function sealDir(dir, pass) {
  const key = await keyFor(dir, pass)
  let n = 0
  for await (const f of jsonFiles(dir)) {
    const j = JSON.parse(await readFile(f, 'utf8'))
    if (isSealed(j)) continue
    await writeFile(f, JSON.stringify(seal(j, key)))
    n += 1
  }
  return n
}

export async function openDir(dir, pass) {
  let key = null
  let n = 0
  for await (const f of jsonFiles(dir)) {
    const j = JSON.parse(await readFile(f, 'utf8'))
    if (!isSealed(j)) continue
    key ??= await keyFor(dir, pass)
    await writeFile(f, JSON.stringify(open(j, key)))
    n += 1
  }
  return n
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, dir] = process.argv.slice(2)
  if (!['seal', 'open'].includes(cmd) || !dir) throw new Error('usage: VAULT_PASS=... node options/vault.js seal|open <dataDir>')
  const n = await (cmd === 'seal' ? sealDir : openDir)(dir, process.env.VAULT_PASS)
  console.log(`${cmd === 'seal' ? 'sealed' : 'opened'} ${n} files in ${dir}`)
}
