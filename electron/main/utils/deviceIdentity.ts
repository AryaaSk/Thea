// Ed25519 device identity utilities for OpenClaw scope-granting authentication
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface DeviceIdentity {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
}

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function getDeviceIdentityPath(): string {
  return path.join(os.homedir(), '.openclaw', 'sightline-device.json');
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64url');
}

function derivePublicKeyRaw(publicKeyPem: string): Buffer {
  const spki = crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  if (spki.length === ED25519_SPKI_PREFIX.length + 32 &&
      spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)) {
    return spki.subarray(ED25519_SPKI_PREFIX.length);
  }
  return spki;
}

function fingerprintPublicKey(publicKeyPem: string): string {
  const raw = derivePublicKeyRaw(publicKeyPem);
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function loadOrCreateDeviceIdentity(): DeviceIdentity {
  const identityPath = getDeviceIdentityPath();
  try {
    const data = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
    if (data.version === 1 && data.deviceId && data.publicKeyPem && data.privateKeyPem) {
      return { deviceId: data.deviceId, publicKeyPem: data.publicKeyPem, privateKeyPem: data.privateKeyPem };
    }
  } catch {
    // No existing identity, create one
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const deviceId = fingerprintPublicKey(publicKeyPem);

  const identity = { version: 1, deviceId, publicKeyPem, privateKeyPem };
  const dir = path.dirname(identityPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(identityPath, JSON.stringify(identity, null, 2), { mode: 0o600 });
  console.log('[DeviceIdentity] Created device identity:', deviceId);

  return { deviceId, publicKeyPem, privateKeyPem };
}

export function buildDeviceAuthPayload(params: {
  deviceId: string; clientId: string; clientMode: string;
  role: string; scopes: string[]; signedAtMs: number;
  token: string; nonce: string;
}): string {
  return [
    'v2', params.deviceId, params.clientId, params.clientMode,
    params.role, params.scopes.join(','), String(params.signedAtMs),
    params.token, params.nonce,
  ].join('|');
}

export function signPayload(privateKeyPem: string, payload: string): string {
  const key = crypto.createPrivateKey(privateKeyPem);
  return base64UrlEncode(crypto.sign(null, Buffer.from(payload, 'utf8'), key));
}

export function publicKeyRawBase64Url(publicKeyPem: string): string {
  return base64UrlEncode(derivePublicKeyRaw(publicKeyPem));
}
