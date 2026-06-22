// ImageKit.io upload/delete helpers.
//
// SECURITY NOTE: This module runs in the browser and signs upload requests with
// the ImageKit private key read from `VITE_IMAGEKIT_PRIVATE_KEY`. Because every
// `VITE_*` value is inlined into the public JS bundle, that private key is
// effectively public once deployed. This is an intentional, acknowledged
// trade-off for a backend-less setup. To harden later, move `signRequest` and
// `deleteFromImageKit` behind a server endpoint (e.g. a Supabase Edge Function)
// that keeps the private key as a server-only secret, and have the browser fetch
// only the short-lived { token, expire, signature } triple. The rest of the app
// only depends on `uploadToImageKit` / `deleteFromImageKit`, so that swap stays
// local to this file.

const UPLOAD_ENDPOINT = 'https://upload.imagekit.io/api/v1/files/upload';
const FILES_API_ENDPOINT = 'https://api.imagekit.io/v1/files';

// ImageKit requires the auth token to expire within one hour. 40 minutes leaves
// headroom for clock skew while keeping each signature short-lived.
const AUTH_EXPIRY_SECONDS = 40 * 60;

export interface ImageKitUploadOptions {
  file: File;
  /** Final file name to store the asset under. */
  fileName: string;
  /** Optional ImageKit folder (mirrors the old Supabase "bucket" grouping). */
  folder?: string;
}

export interface ImageKitUploadResult {
  url: string;
  fileId: string;
  filePath: string;
}

interface ImageKitConfig {
  publicKey: string;
  privateKey: string;
}

function getConfig(): ImageKitConfig {
  const publicKey = import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY as string | undefined;
  const privateKey = import.meta.env.VITE_IMAGEKIT_PRIVATE_KEY as string | undefined;

  if (!publicKey || !privateKey) {
    throw new Error(
      'ImageKit is not configured. Set VITE_IMAGEKIT_PUBLIC_KEY and VITE_IMAGEKIT_PRIVATE_KEY.',
    );
  }

  return { publicKey, privateKey };
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

interface SignedAuth {
  token: string;
  expire: number;
  signature: string;
}

// Reproduces ImageKit's client-side auth: signature = HMAC-SHA1(token + expire)
// keyed with the private key, hex-encoded. Uses the Web Crypto API so no extra
// dependency is needed.
async function signRequest(privateKey: string): Promise<SignedAuth> {
  const token = crypto.randomUUID();
  const expire = Math.floor(Date.now() / 1000) + AUTH_EXPIRY_SECONDS;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(privateKey),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(token + expire));

  return { token, expire, signature: toHex(signatureBuffer) };
}

function basicAuthHeader(privateKey: string): string {
  // ImageKit server APIs use HTTP Basic auth with the private key as the username
  // and an empty password.
  return `Basic ${btoa(`${privateKey}:`)}`;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (body?.message) return body.message;
  } catch {
    // ignore — fall through to status text
  }
  return response.statusText || `HTTP ${response.status}`;
}

export async function uploadToImageKit({
  file,
  fileName,
  folder,
}: ImageKitUploadOptions): Promise<ImageKitUploadResult> {
  const { publicKey, privateKey } = getConfig();
  const { token, expire, signature } = await signRequest(privateKey);

  const form = new FormData();
  form.append('file', file);
  form.append('fileName', fileName);
  form.append('publicKey', publicKey);
  form.append('signature', signature);
  form.append('expire', String(expire));
  form.append('token', token);
  // Keep the unique name we already generate instead of letting ImageKit append
  // its own suffix.
  form.append('useUniqueFileName', 'false');
  if (folder) {
    form.append('folder', folder);
  }

  const response = await fetch(UPLOAD_ENDPOINT, { method: 'POST', body: form });

  if (!response.ok) {
    throw new Error(`ImageKit upload failed: ${await readErrorMessage(response)}`);
  }

  const data = (await response.json()) as ImageKitUploadResult;
  return { url: data.url, fileId: data.fileId, filePath: data.filePath };
}

export async function deleteFromImageKit(imageUrl: string): Promise<void> {
  const { privateKey } = getConfig();

  // We only persist the public URL, not the ImageKit fileId, so resolve the id by
  // searching for the stored file name first.
  const fileName = imageUrl.split('/').pop()?.split('?')[0];
  if (!fileName) return;

  const authorization = basicAuthHeader(privateKey);

  const searchResponse = await fetch(
    `${FILES_API_ENDPOINT}?name=${encodeURIComponent(fileName)}`,
    { method: 'GET', headers: { Authorization: authorization } },
  );

  if (!searchResponse.ok) {
    throw new Error(`ImageKit lookup failed: ${await readErrorMessage(searchResponse)}`);
  }

  const matches = (await searchResponse.json()) as Array<{ fileId: string; name: string }>;
  const match = matches.find((item) => item.name === fileName) ?? matches[0];

  // Best-effort: nothing to remove if the asset is already gone.
  if (!match) return;

  const deleteResponse = await fetch(`${FILES_API_ENDPOINT}/${match.fileId}`, {
    method: 'DELETE',
    headers: { Authorization: authorization },
  });

  if (!deleteResponse.ok) {
    throw new Error(`ImageKit delete failed: ${await readErrorMessage(deleteResponse)}`);
  }
}
