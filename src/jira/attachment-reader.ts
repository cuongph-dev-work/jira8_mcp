import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum text content size per attachment (bytes) */
export const MAX_TEXT_SIZE = 50_000;

/** Maximum total extracted content across all attachments (bytes) */
export const MAX_TOTAL_CONTENT = 200_000;

/** Maximum number of attachments to read content from */
export const MAX_READABLE_ATTACHMENTS = 5;

/** Maximum image file size (5MB) */
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

/** Maximum number of images to include inline */
export const MAX_INLINE_IMAGES = 3;

// ---------------------------------------------------------------------------
// MIME type classification
// ---------------------------------------------------------------------------

const TEXT_MIME_PREFIXES = ["text/"];

const TEXT_MIME_EXACT = new Set([
  "application/json",
  "application/xml",
  "application/x-yaml",
  "application/yaml",
  "application/javascript",
  "application/x-sh",
  "application/sql",
  "application/xhtml+xml",
]);

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const IMAGE_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

/**
 * Returns true if the MIME type is a readable text-like format
 * (plain text, JSON, XML, PDF, DOCX).
 */
export function isReadableMimeType(mime: string): boolean {
  const lower = mime.toLowerCase();
  if (TEXT_MIME_PREFIXES.some((p) => lower.startsWith(p))) return true;
  if (TEXT_MIME_EXACT.has(lower)) return true;
  if (lower === "application/pdf") return true;
  if (lower === DOCX_MIME) return true;
  return false;
}

/**
 * Returns true if the MIME type is a supported image format.
 */
export function isImageMimeType(mime: string): boolean {
  return IMAGE_MIMES.has(mime.toLowerCase());
}

// ---------------------------------------------------------------------------
// Content extraction
// ---------------------------------------------------------------------------

/**
 * Extracts text content from a buffer based on its MIME type.
 * Returns empty string for unsupported types.
 * Text is truncated to MAX_TEXT_SIZE.
 */
export async function extractContent(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const lower = mimeType.toLowerCase();

  try {
    let text = "";

    if (lower === "application/pdf") {
      text = await extractPdf(buffer);
    } else if (lower === DOCX_MIME) {
      text = await extractDocx(buffer);
    } else if (
      TEXT_MIME_PREFIXES.some((p) => lower.startsWith(p)) ||
      TEXT_MIME_EXACT.has(lower)
    ) {
      text = buffer.toString("utf-8");
    } else {
      return "";
    }

    // Truncate if too large
    if (text.length > MAX_TEXT_SIZE) {
      return (
        text.slice(0, MAX_TEXT_SIZE) +
        `\n\n⚠️ Content truncated at ${formatSize(MAX_TEXT_SIZE)} (full: ${formatSize(text.length)})`
      );
    }

    return text;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return `⚠️ Failed to extract content: ${msg}`;
  }
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

/** Format byte size to human-readable string. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Parser wrappers
// ---------------------------------------------------------------------------

async function extractPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}
