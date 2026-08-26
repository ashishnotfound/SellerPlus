const MAX_LABEL_BYTES = 20 * 1024 * 1024;
const MAX_REDIRECTS = 3;

const inlineContentTypes = new Set([
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const downloadableContentTypes = new Set([
  ...inlineContentTypes,
  "application/octet-stream",
  "application/zip",
]);

export interface ReyoPackLabelDocument {
  id: string;
  shipment_id: string;
  external_document_reference: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  content_type: string | null;
  document_source: "AMAZON_EASY_SHIP" | "AMAZON_SHIPPING" | "SELLER_UPLOAD" | "LEGACY";
  external_expires_at: string | null;
}

interface StorageDownloadResult {
  data: Blob | null;
  error: unknown;
}

export interface StorageClientLike {
  from(bucket: string): {
    download(path: string): Promise<StorageDownloadResult>;
  };
}

export interface LabelBytes {
  bytes: Uint8Array;
  contentType: string;
  inline: boolean;
  extension: string;
}

export class LabelDocumentError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "LabelDocumentError";
  }
}

function allowedAmazonDocumentUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password) {
    return null;
  }
  const hostname = url.hostname.toLowerCase();
  const allowed = hostname === "amazon.com"
    || hostname.endsWith(".amazon.com")
    || hostname === "amazonaws.com"
    || hostname.endsWith(".amazonaws.com")
    || hostname === "cloudfront.net"
    || hostname.endsWith(".cloudfront.net");
  return allowed ? url : null;
}

function normalizedContentType(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const value = candidate?.split(";", 1)[0]?.trim().toLowerCase();
    if (value && downloadableContentTypes.has(value)) return value;
  }
  return "application/octet-stream";
}

function labelExtension(contentType: string): string {
  if (contentType === "application/pdf") return "pdf";
  if (contentType === "application/zip") return "zip";
  if (contentType === "image/gif") return "gif";
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "bin";
}

function checkedBytes(buffer: ArrayBuffer): Uint8Array {
  if (buffer.byteLength > MAX_LABEL_BYTES) {
    throw new LabelDocumentError(413, "LABEL_TOO_LARGE", "The label document is too large to open safely.");
  }
  return new Uint8Array(buffer);
}

async function fetchExternalDocument(
  initialUrl: URL,
  fetcher: typeof fetch,
): Promise<{ bytes: Uint8Array; responseType: string | null }> {
  let url = initialUrl;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    let response: Response;
    try {
      response = await fetcher(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: "application/pdf, application/zip, image/*, application/octet-stream" },
      });
    } catch {
      throw new LabelDocumentError(502, "LABEL_DOWNLOAD_FAILED", "Amazon's label document could not be downloaded. Retry or refresh shipping data.");
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      const redirected = location ? allowedAmazonDocumentUrl(new URL(location, url).toString()) : null;
      if (!redirected || redirects === MAX_REDIRECTS) {
        throw new LabelDocumentError(502, "LABEL_DOWNLOAD_FAILED", "Amazon's label download redirect was rejected for safety.");
      }
      url = redirected;
      continue;
    }
    if (!response.ok) {
      throw new LabelDocumentError(502, "LABEL_DOWNLOAD_FAILED", "Amazon's label document is temporarily unavailable. Refresh shipping data and retry.");
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_LABEL_BYTES) {
      throw new LabelDocumentError(413, "LABEL_TOO_LARGE", "The label document is too large to open safely.");
    }
    return {
      bytes: checkedBytes(await response.arrayBuffer()),
      responseType: response.headers.get("content-type"),
    };
  }
  throw new LabelDocumentError(502, "LABEL_DOWNLOAD_FAILED", "Amazon's label document could not be downloaded.");
}

export async function loadReyoPackLabel(
  document: ReyoPackLabelDocument,
  storage: StorageClientLike,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<LabelBytes> {
  let bytes: Uint8Array;
  let responseType: string | null = null;

  if (document.storage_bucket || document.storage_path) {
    if (!document.storage_bucket || !document.storage_path) {
      throw new LabelDocumentError(503, "LABEL_STORAGE_INVALID", "The stored label reference is incomplete. Synchronize shipping data again.");
    }
    const { data, error } = await storage.from(document.storage_bucket).download(document.storage_path);
    if (error || !data) {
      throw new LabelDocumentError(502, "LABEL_DOWNLOAD_FAILED", "The private label document could not be loaded. Retry or refresh shipping data.");
    }
    bytes = checkedBytes(await data.arrayBuffer());
    responseType = data.type || null;
  } else {
    if (document.document_source === "LEGACY" || document.document_source === "SELLER_UPLOAD") {
      throw new LabelDocumentError(409, "LABEL_REFRESH_REQUIRED", "This legacy label reference must be securely imported before it can be opened.");
    }
    if (!document.external_document_reference || !document.external_expires_at) {
      throw new LabelDocumentError(409, "LABEL_REFRESH_REQUIRED", "Amazon shipping data must be refreshed to obtain a short-lived label document.");
    }
    const expiresAt = new Date(document.external_expires_at);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) {
      throw new LabelDocumentError(409, "LABEL_EXPIRED", "The Amazon label link expired. Synchronize shipping data and retry.");
    }
    const url = allowedAmazonDocumentUrl(document.external_document_reference);
    if (!url) {
      throw new LabelDocumentError(409, "LABEL_REFERENCE_REJECTED", "The label reference is not an approved Amazon document URL.");
    }
    const external = await fetchExternalDocument(url, fetcher);
    bytes = external.bytes;
    responseType = external.responseType;
  }

  const contentType = normalizedContentType(document.content_type, responseType);
  return {
    bytes,
    contentType,
    inline: inlineContentTypes.has(contentType),
    extension: labelExtension(contentType),
  };
}
