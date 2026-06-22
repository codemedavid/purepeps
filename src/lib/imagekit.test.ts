import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { uploadToImageKit, deleteFromImageKit } from './imagekit';

const UPLOAD_ENDPOINT = 'https://upload.imagekit.io/api/v1/files/upload';

function makeImageFile(name = 'photo.png', type = 'image/png'): File {
  // 200 bytes so it passes any minimum-size guard downstream.
  return new File([new Uint8Array(200)], name, { type });
}

describe('uploadToImageKit', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_IMAGEKIT_PUBLIC_KEY', 'public_test_key');
    vi.stubEnv('VITE_IMAGEKIT_PRIVATE_KEY', 'private_test_key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uploads the file to the ImageKit upload endpoint and returns the public url', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        url: 'https://ik.imagekit.io/acc/menu-images/photo.png',
        fileId: 'file_abc',
        filePath: '/menu-images/photo.png',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadToImageKit({
      file: makeImageFile(),
      fileName: 'photo.png',
      folder: 'menu-images',
    });

    expect(result.url).toBe('https://ik.imagekit.io/acc/menu-images/photo.png');
    expect(result.fileId).toBe('file_abc');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(endpoint).toBe(UPLOAD_ENDPOINT);
    expect(init.method).toBe('POST');

    const body = init.body as FormData;
    expect(body.get('fileName')).toBe('photo.png');
    expect(body.get('folder')).toBe('menu-images');
    expect(body.get('publicKey')).toBe('public_test_key');
    // The private key must NEVER be sent as a form field — only a derived signature.
    expect(body.get('privateKey')).toBeNull();
    expect(body.get('signature')).toBeTruthy();
    expect(body.get('token')).toBeTruthy();
    expect(body.get('expire')).toBeTruthy();
    expect(body.get('file')).toBeInstanceOf(File);
  });

  it('throws a helpful error when ImageKit responds with an error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Invalid signature' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      uploadToImageKit({ file: makeImageFile(), fileName: 'photo.png' }),
    ).rejects.toThrow(/Invalid signature/);
  });

  it('throws when the ImageKit keys are not configured', async () => {
    vi.stubEnv('VITE_IMAGEKIT_PUBLIC_KEY', '');
    vi.stubEnv('VITE_IMAGEKIT_PRIVATE_KEY', '');
    vi.stubGlobal('fetch', vi.fn());

    await expect(
      uploadToImageKit({ file: makeImageFile(), fileName: 'photo.png' }),
    ).rejects.toThrow(/not configured/i);
  });
});

describe('deleteFromImageKit', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_IMAGEKIT_PUBLIC_KEY', 'public_test_key');
    vi.stubEnv('VITE_IMAGEKIT_PRIVATE_KEY', 'private_test_key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('looks the file up by name then deletes it by id', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ fileId: 'file_1', name: 'photo.png' }],
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await deleteFromImageKit('https://ik.imagekit.io/acc/menu-images/photo.png');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [deleteUrl, deleteInit] = fetchMock.mock.calls[1];
    expect(deleteUrl).toContain('/file_1');
    expect(deleteInit.method).toBe('DELETE');
    expect(deleteInit.headers.Authorization).toMatch(/^Basic /);
  });

  it('does not throw when the file cannot be found (best-effort delete)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [] });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      deleteFromImageKit('https://ik.imagekit.io/acc/menu-images/missing.png'),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
