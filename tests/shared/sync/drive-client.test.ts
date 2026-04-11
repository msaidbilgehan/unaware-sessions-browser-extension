import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetChromeMocks, mockChrome } from '../../setup';
import { getToken, findFile, createFile, updateFile, downloadFile, revokeAccess, getGoogleUserId } from '@shared/sync/drive-client';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  resetChromeMocks();
  mockFetch.mockReset();
  mockChrome.identity.getAuthToken.mockResolvedValue({ token: 'mock-token-123' });
});

describe('drive-client', () => {
  describe('getToken', () => {
    it('returns token from chrome.identity', async () => {
      const token = await getToken(true);
      expect(token).toBe('mock-token-123');
      expect(mockChrome.identity.getAuthToken).toHaveBeenCalledWith(
        { interactive: true },
      );
    });

    it('throws when no token returned', async () => {
      mockChrome.identity.getAuthToken.mockResolvedValue({ token: undefined as unknown as string });
      await expect(getToken(false)).rejects.toThrow('Failed to get auth token');
    });
  });

  describe('findFile', () => {
    it('returns file ID when found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ files: [{ id: 'file-abc' }] }),
      });

      const id = await findFile('token', 'manifest.json');
      expect(id).toBe('file-abc');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('spaces=appDataFolder'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer token' }),
        }),
      );
    });

    it('returns null when not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ files: [] }),
      });

      const id = await findFile('token', 'nonexistent.json');
      expect(id).toBeNull();
    });
  });

  describe('createFile', () => {
    it('returns new file ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'new-file-id' }),
      });

      const id = await createFile('token', 'test.json', '{"data":1}', 'application/json');
      expect(id).toBe('new-file-id');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('uploadType=multipart'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('updateFile', () => {
    it('calls PATCH with correct URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await updateFile('token', 'file-123', '{"data":2}', 'application/json');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('files/file-123'),
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('downloadFile', () => {
    it('returns file content as text', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('file content'),
      });

      const content = await downloadFile('token', 'file-456');
      expect(content).toBe('file content');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('alt=media'),
        expect.any(Object),
      );
    });
  });

  describe('revokeAccess', () => {
    it('removes cached token and calls revoke endpoint', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await revokeAccess();
      expect(mockChrome.identity.removeCachedAuthToken).toHaveBeenCalledWith({
        token: 'mock-token-123',
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('revoke'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('getGoogleUserId', () => {
    it('returns the Google user permissionId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: { permissionId: '117382948561023' } }),
      });

      const id = await getGoogleUserId('token');
      expect(id).toBe('117382948561023');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('about'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer token' }),
        }),
      );
    });

    it('throws when permissionId is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: {} }),
      });

      await expect(getGoogleUserId('token')).rejects.toThrow('Failed to get Google User ID');
    });
  });

  describe('401 retry', () => {
    it('retries on 401 with refreshed token', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ ok: false, status: 401, text: () => Promise.resolve('Unauthorized') });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ files: [{ id: 'retry-file' }] }),
        });
      });

      mockChrome.identity.getAuthToken.mockResolvedValue({ token: 'refreshed-token' });

      const id = await findFile('expired-token', 'test.json');
      expect(id).toBe('retry-file');
      expect(callCount).toBe(2);
      expect(mockChrome.identity.removeCachedAuthToken).toHaveBeenCalled();
    });
  });
});
