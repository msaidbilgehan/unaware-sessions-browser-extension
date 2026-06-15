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
    await webDavRequest(config, url, { method: 'MKCOL' }, [200, 201, 204, 405]);
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

export async function listWebDavFiles(config: WebDavConnectionConfig): Promise<WebDavFile[]> {
  await ensureCollection(config);
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
}

function parseWebDavFileList(xml: string, collectionUrl: string): WebDavFile[] {
  const responses = xml.match(/<[^:>]*:?response[\s\S]*?<\/[^:>]*:?response>/gi) ?? [];
  const collectionPath = new URL(collectionUrl).pathname.replace(/\/+$/, '/');
  const files: WebDavFile[] = [];

  for (const response of responses) {
    const href = decodeXml(readXmlTag(response, 'href') ?? '');
    if (!href) continue;

    const hrefPath = hrefToPath(href);
    if (hrefPath.replace(/\/+$/, '/') === collectionPath) continue;
    if (hrefPath.endsWith('/')) continue;

    const fileName = decodeURIComponent(hrefPath.split('/').filter(Boolean).at(-1) ?? '');
    if (!fileName) continue;

    files.push({
      fileName,
      href,
      lastModified: Date.parse(readXmlTag(response, 'getlastmodified') ?? '') || 0,
      size: Number(readXmlTag(response, 'getcontentlength') ?? 0) || 0,
    });
  }

  return files;
}

function readXmlTag(xml: string, tagName: string): string | null {
  const re = new RegExp(`<[^:>]*:?${tagName}[^>]*>([\\s\\S]*?)<\\/[^:>]*:?${tagName}>`, 'i');
  return re.exec(xml)?.[1]?.trim() ?? null;
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function hrefToPath(href: string): string {
  try {
    return new URL(href).pathname;
  } catch {
    return href.split('?')[0];
  }
}
