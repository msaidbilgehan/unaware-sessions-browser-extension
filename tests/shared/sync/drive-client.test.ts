import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetChromeMocks, mockChrome } from '../../setup';
import { getToken, findFile, createFile, updateFile, downloadFile, deleteFile, getFileVersion, revokeAccess, getGoogleUserId } from '@shared/sync/drive-client';

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
    it('returns file ref (id + version) when found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ files: [{ id: 'file-abc', version: '7' }] }),
      });

      const ref = await findFile('token', 'manifest.json');
      expect(ref).toEqual({ id: 'file-abc', version: '7' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('spaces=appDataFolder'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer token' }),
        }),
      );
      // Deterministic pick requires a stable listing order
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('orderBy=createdTime'),
        expect.any(Object),
      );
    });

    it('returns null when not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ files: [] }),
      });

      const ref = await findFile('token', 'nonexistent.json');
      expect(ref).toBeNull();
    });

    it('keeps the oldest file and deletes duplicates', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              files: [
                { id: 'oldest', version: '3' },
                { id: 'dup-1', version: '1' },
                { id: 'dup-2', version: '1' },
              ],
            }),
        })
        // Two DELETE calls for the duplicates
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

      const ref = await findFile('token', 'manifest.json');
      expect(ref).toEqual({ id: 'oldest', version: '3' });

      const deleteCalls = mockFetch.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(deleteCalls).toHaveLength(2);
      expect(deleteCalls[0][0]).toContain('files/dup-1');
      expect(deleteCalls[1][0]).toContain('files/dup-2');
    });

    it('still returns the kept file when duplicate deletion fails', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              files: [
                { id: 'oldest', version: '2' },
                { id: 'dup-1', version: '1' },
              ],
            }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          text: () => Promise.resolve('Forbidden'),
        });

      const ref = await findFile('token', 'manifest.json');
      expect(ref).toEqual({ id: 'oldest', version: '2' });
    });
  });

  describe('deleteFile', () => {
    it('issues DELETE for the file', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

      await deleteFile('token', 'file-9');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('files/file-9'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('getFileVersion', () => {
    it('returns the current version string', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ version: '42' }),
      });

      const version = await getFileVersion('token', 'file-1');
      expect(version).toBe('42');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('fields=version'),
        expect.any(Object),
      );
    });

    it('throws when version metadata is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await expect(getFileVersion('token', 'file-1')).rejects.toThrow('no version');
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
          json: () => Promise.resolve({ files: [{ id: 'retry-file', version: '1' }] }),
        });
      });

      mockChrome.identity.getAuthToken.mockResolvedValue({ token: 'refreshed-token' });

      const ref = await findFile('expired-token', 'test.json');
      expect(ref).toEqual({ id: 'retry-file', version: '1' });
      expect(callCount).toBe(2);
      expect(mockChrome.identity.removeCachedAuthToken).toHaveBeenCalled();
    });
  });
});
