import { createLogger } from '@shared/logger';

const log = createLogger('drive-client');

const DRIVE_API_BASE = 'https://www.googleapis.com';

// ── Token Management ───────────────────────────────────────

export async function getToken(interactive: boolean): Promise<string> {
  const result = await chrome.identity.getAuthToken({ interactive });
  if (!result.token) {
    throw new Error('Failed to get auth token');
  }
  return result.token;
}

export async function revokeAccess(): Promise<void> {
  let token: string;
  try {
    token = await getToken(false);
  } catch {
    return;
  }

  await chrome.identity.removeCachedAuthToken({ token });

  try {
    await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
    });
  } catch {
    // Best-effort server-side revocation
  }
}

// ── Drive API Helpers ──────────────────────────────────────

async function driveRequest(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = `${DRIVE_API_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(init.headers as Record<string, string>),
  };

  let res = await fetch(url, { ...init, headers });

  if (res.status === 401) {
    await chrome.identity.removeCachedAuthToken({ token });
    const freshToken = await getToken(false);
    headers.Authorization = `Bearer ${freshToken}`;
    res = await fetch(url, { ...init, headers });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Drive API error ${res.status}: ${body}`);
  }

  return res;
}

// ── File Operations (appDataFolder only) ───────────────────

export interface DriveFileRef {
  id: string;
  // Drive's monotonically increasing change counter for the file. Used for
  // optimistic concurrency: re-read immediately before a write and abort if
  // another device changed the file since this cycle read it. (Drive API v3
  // dropped resource ETags and If-Match preconditions — `version` is the v3
  // concurrency primitive.)
  version: string;
}

export async function findFile(token: string, filename: string): Promise<DriveFileRef | null> {
  const q = encodeURIComponent(`name='${filename}'`);
  const res = await driveRequest(
    token,
    `/drive/v3/files?spaces=appDataFolder&q=${q}&orderBy=createdTime&fields=files(id,version)`,
  );
  const data = (await res.json()) as { files?: Array<{ id: string; version: string }> };
  const files = data.files ?? [];
  if (files.length === 0) return null;

  // Drive allows same-named files in appDataFolder, so two devices doing
  // their first sync concurrently can each create one — after which each
  // device may keep reading a different instance forever (split-brain sync).
  // Keep the oldest (deterministic on every device) and delete the extras.
  const [keep, ...duplicates] = files;
  for (const dup of duplicates) {
    try {
      await deleteFile(token, dup.id);
      log.warn(`Deleted duplicate Drive file '${filename}' (${dup.id})`);
    } catch (err) {
      // Best-effort: a surviving duplicate is retried on the next sync.
      log.warn(`Failed to delete duplicate Drive file '${filename}' (${dup.id})`, err);
    }
  }

  return { id: keep.id, version: keep.version };
}

export async function deleteFile(token: string, fileId: string): Promise<void> {
  await driveRequest(token, `/drive/v3/files/${fileId}`, { method: 'DELETE' });
}

export async function getFileVersion(token: string, fileId: string): Promise<string> {
  const res = await driveRequest(token, `/drive/v3/files/${fileId}?fields=version`);
  const data = (await res.json()) as { version?: string };
  if (!data.version) {
    throw new Error(`Drive API returned no version for file ${fileId}`);
  }
  return data.version;
}

export async function createFile(
  token: string,
  filename: string,
  content: string,
  mimeType: string,
): Promise<string> {
  const metadata = JSON.stringify({ name: filename, parents: ['appDataFolder'] });
  const boundary = '---unaware-sync-boundary';

  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`;

  const res = await driveRequest(token, '/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });

  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function updateFile(
  token: string,
  fileId: string,
  content: string,
  mimeType: string,
): Promise<void> {
  await driveRequest(token, `/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': mimeType },
    body: content,
  });
}

export async function downloadFile(token: string, fileId: string): Promise<string> {
  const res = await driveRequest(token, `/drive/v3/files/${fileId}?alt=media`);
  return res.text();
}

// ── Google User ID ────────────────────────────────────────

export async function getGoogleUserId(token: string): Promise<string> {
  // Use Drive API's about endpoint — only requires drive.appdata scope.
  // The userinfo endpoint requires openid/profile scopes which we don't declare.
  const res = await driveRequest(token, '/drive/v3/about?fields=user(permissionId)');
  const data = (await res.json()) as { user?: { permissionId?: string } };
  if (!data.user?.permissionId) {
    throw new Error('Failed to get Google User ID');
  }
  return data.user.permissionId;
}
