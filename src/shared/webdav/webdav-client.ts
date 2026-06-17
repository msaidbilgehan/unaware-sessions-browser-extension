import type { WebDavConnectionConfig, WebDavFile } from './webdav-types';

const XML_PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:getlastmodified />
    <d:getcontentlength />
    <d:resourcetype />
  </d:prop>
</d:propfind>`;

function encodeBasicAuth(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function authHeaders(config: WebDavConnectionConfig): Record<string, string> {
  if (!config.username && !config.password) return {};
  return {
    Authorization: `Basic ${encodeBasicAuth(config.username, config.password)}`,
  };
}

function normalizeHost(host: string): string {
  const trimmed = host.trim();
  if (!trimmed) throw new Error('WebDAV host is required');

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('WebDAV host must be a valid URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('WebDAV host must use http or https');
  }

  return url.toString().replace(/\/+$/, '');
}

function normalizePath(path: string): string {
  const trimmed = path.trim() || '/backup';
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+$/, '') || '/';
}

export function getCollectionUrl(config: WebDavConnectionConfig, pathOverride?: string): string {
  const host = normalizeHost(config.host);
  const path = normalizePath(pathOverride ?? config.path);
  const encodedPath = path
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');

  return encodedPath ? `${host}/${encodedPath}/` : `${host}/`;
}

function getFileUrl(config: WebDavConnectionConfig, fileName: string): string {
  return `${getCollectionUrl(config)}${encodeURIComponent(fileName)}`;
}

async function webDavRequest(
  config: WebDavConnectionConfig,
  url: string,
  init: RequestInit,
  okStatuses: number[],
): Promise<Response> {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = {
    ...authHeaders(config),
    ...(init.headers as Record<string, string> | undefined),
  };

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`WebDAV ${method} ${url} failed before response: ${msg}`);
  }

  if (!okStatuses.includes(res.status)) {
    const body = await res.text().catch(() => '');
    const detail = body.trim() || res.statusText;
    throw new Error(`WebDAV ${method} ${url} failed with ${res.status}: ${detail}`);
  }
  return res;
}

export async function ensureCollection(config: WebDavConnectionConfig): Promise<void> {
  normalizeHost(config.host);
  const normalizedPath = normalizePath(config.path);
  const segments = normalizedPath.split('/').filter(Boolean);

  if (segments.length === 0) return;

  let current = '';
  for (const segment of segments) {
    current += `/${segment}`;
    const url = getCollectionUrl(config, current);
    try {
      // First check if collection already exists via PROPFIND Depth 0
      await webDavRequest(
        config,
        url,
        {
          method: 'PROPFIND',
          headers: {
            Depth: '0',
            'Content-Type': 'application/xml; charset=utf-8',
          },
          body: XML_PROPFIND_BODY,
        },
        [200, 207],
      );
      // If it exists, skip MKCOL
      continue;
    } catch (err) {
      // If it does not exist or fails, proceed with MKCOL
      // Some servers might return 423 Locked if the folder is managed or already being accessed
      // We also handle 405 (Method Not Allowed) which often means it's already a collection
      try {
        await webDavRequest(config, url, { method: 'MKCOL' }, [200, 201, 204, 405]);
      } catch (mkcolErr) {
        if (mkcolErr instanceof Error && (mkcolErr.message.includes('423') || mkcolErr.message.includes('405'))) {
          // If MKCOL fails with 423 or 405, it might already exist or be locked by the server
          // We'll proceed and let the subsequent operation (like PUT) fail if there's a real issue
          continue;
        }
        throw mkcolErr;
      }
    }
  }
}

export async function testWebDavConnection(config: WebDavConnectionConfig): Promise<void> {
  await ensureCollection(config);
  await webDavRequest(
    config,
    getCollectionUrl(config),
    {
      method: 'PROPFIND',
      headers: {
        Depth: '0',
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body: XML_PROPFIND_BODY,
    },
    [207],
  );
}

export async function putWebDavFile(
  config: WebDavConnectionConfig,
  fileName: string,
  content: string,
  contentType = 'application/json',
): Promise<void> {
  await ensureCollection(config);
  await webDavRequest(
    config,
    getFileUrl(config, fileName),
    {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body: content,
    },
    [200, 201, 204],
  );
}

export async function deleteWebDavFile(
  config: WebDavConnectionConfig,
  fileName: string,
): Promise<void> {
  await webDavRequest(config, getFileUrl(config, fileName), { method: 'DELETE' }, [200, 202, 204, 404]);
}

export async function getWebDavFile(
  config: WebDavConnectionConfig,
  fileName: string,
): Promise<string> {
  const res = await webDavRequest(
    config,
    getFileUrl(config, fileName),
    { method: 'GET' },
    [200],
  );
  return res.text();
}

export async function listWebDavFiles(config: WebDavConnectionConfig): Promise<WebDavFile[]> {
  try {
    const res = await webDavRequest(
      config,
      getCollectionUrl(config),
      {
        method: 'PROPFIND',
        headers: {
          Depth: '1',
          'Content-Type': 'application/xml; charset=utf-8',
        },
        body: XML_PROPFIND_BODY,
      },
      [207],
    );
    const xml = await res.text();
    return parseWebDavFileList(xml, getCollectionUrl(config));
  } catch (err) {
    // If the directory does not exist (404), return an empty list of backups
    if (err instanceof Error && err.message.includes('failed with 404')) {
      return [];
    }
    throw err;
  }
}

function parseWebDavFileList(xml: string, collectionUrl: string): WebDavFile[] {
  const responses = getResponseBlocks(xml);
  const collectionPath = new URL(collectionUrl).pathname.replace(/\/+$/, '/');
  const files: WebDavFile[] = [];

  for (const response of responses) {
    const href = decodeXml(getTagContent(response, 'href') ?? '');
    if (!href) continue;

    const hrefPath = hrefToPath(href, collectionUrl);
    if (hrefPath.replace(/\/+$/, '/') === collectionPath) continue;
    if (hrefPath.endsWith('/')) continue;

    // Skip directories by checking resourcetype
    // Some servers return <d:resourcetype><d:collection/></d:resourcetype>
    // Others might return <d:resourcetype /> for files
    const resourceType = getTagContent(response, 'resourcetype') ?? '';
    if (resourceType.toLowerCase().includes('collection')) continue;

    const fileName = decodeURIComponent(hrefPath.split('/').filter(Boolean).at(-1) ?? '');
    if (!fileName) continue;

    files.push({
      fileName,
      href,
      lastModified: Date.parse(getTagContent(response, 'getlastmodified') ?? '') || 0,
      size: Number(getTagContent(response, 'getcontentlength') ?? 0) || 0,
    });
  }

  return files;
}

function getResponseBlocks(xml: string): string[] {
  const blocks: string[] = [];
  // Use a more specific regex to avoid over-matching
  // Matches <d:response>...</d:response> or <response>...</response>
  const regex = /<([^>]*:?response)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    blocks.push(match[0]);
  }
  return blocks;
}

/**
 * Robustly extracts the inner content of an XML tag within a specific block.
 * Handles:
 * 1. Namespace prefixes (e.g., <d:prop>, <D:prop>, <prop>)
 * 2. Attributes (e.g., <d:prop xmlns:d="...">)
 * 3. Self-closing tags (returns empty string)
 * 4. Nested tags (returns the raw inner XML)
 */
function getTagContent(xml: string, tagName: string): string | null {
  // 1. Try to find a normal opening/closing tag pair
  // This regex matches <prefix:tagName ...>content</prefix:tagName>
  const fullTagRegex = new RegExp(`<([^>]*:?${tagName})(?:\\s[^>]*)?>([\\s\\S]*?)<\\/\\1>`, 'i');
  const fullMatch = fullTagRegex.exec(xml);
  if (fullMatch) {
    return fullMatch[2].trim();
  }

  // 2. Try to find a self-closing tag
  // This regex matches <prefix:tagName ... />
  const selfClosingRegex = new RegExp(`<([^>]*:?${tagName})(?:\\s[^>]*)?/>`, 'i');
  const selfMatch = selfClosingRegex.exec(xml);
  if (selfMatch) {
    return ''; // Self-closing tag means it exists but has no content
  }

  return null;
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function hrefToPath(href: string, base?: string): string {
  try {
    return new URL(href, base).pathname;
  } catch {
    return href.split('?')[0];
  }
}
