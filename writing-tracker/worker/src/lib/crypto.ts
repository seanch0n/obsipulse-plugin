export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const saltHex = toHex(salt)
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    key,
    256
  )
  return `${saltHex}:${toHex(new Uint8Array(bits))}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':')
  const salt = fromHex(saltHex)
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    key,
    256
  )
  return toHex(new Uint8Array(bits)) === hashHex
}

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return toHex(new Uint8Array(hash))
}

export function generateToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)))
}

export function generateApiKey(): string {
  return 'wt_' + toHex(crypto.getRandomValues(new Uint8Array(24)))
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function fromHex(hex: string): Uint8Array {
  const matches = hex.match(/.{2}/g) ?? []
  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)))
}
