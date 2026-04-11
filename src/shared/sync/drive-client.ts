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

export async function findFile(token: string, filename: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${filename}'`);
  const res = await driveRequest(
    token,
    `/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id)`,
  );
  const data = (await res.json()) as { files?: Array<{ id: string }> };
  return data.files?.[0]?.id ?? null;
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
  const res = await driveRequest(token, '/oauth2/v3/userinfo');
  const data = (await res.json()) as { sub: string };
  if (!data.sub) {
    throw new Error('Failed to get Google User ID');
  }
  return data.sub;
}
