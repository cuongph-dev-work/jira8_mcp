import { describe, it, expect } from "vitest";
import {
  isReadableMimeType,
  isImageMimeType,
  extractContent,
  formatSize,
  MAX_TEXT_SIZE,
} from "../jira/attachment-reader.js";

describe("isReadableMimeType", () => {
  it("accepts text/* types", () => {
    expect(isReadableMimeType("text/plain")).toBe(true);
    expect(isReadableMimeType("text/csv")).toBe(true);
    expect(isReadableMimeType("text/html")).toBe(true);
    expect(isReadableMimeType("text/xml")).toBe(true);
  });

  it("accepts application text-like types", () => {
    expect(isReadableMimeType("application/json")).toBe(true);
    expect(isReadableMimeType("application/xml")).toBe(true);
    expect(isReadableMimeType("application/x-yaml")).toBe(true);
  });

  it("accepts PDF", () => {
    expect(isReadableMimeType("application/pdf")).toBe(true);
  });

  it("accepts DOCX", () => {
    expect(
      isReadableMimeType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe(true);
  });

  it("rejects binary types", () => {
    expect(isReadableMimeType("application/octet-stream")).toBe(false);
    expect(isReadableMimeType("application/zip")).toBe(false);
    expect(isReadableMimeType("image/png")).toBe(false);
  });
});

describe("isImageMimeType", () => {
  it("accepts supported image formats", () => {
    expect(isImageMimeType("image/png")).toBe(true);
    expect(isImageMimeType("image/jpeg")).toBe(true);
    expect(isImageMimeType("image/gif")).toBe(true);
    expect(isImageMimeType("image/webp")).toBe(true);
  });

  it("rejects unsupported image formats", () => {
    expect(isImageMimeType("image/svg+xml")).toBe(false);
    expect(isImageMimeType("image/tiff")).toBe(false);
  });

  it("rejects non-image types", () => {
    expect(isImageMimeType("text/plain")).toBe(false);
    expect(isImageMimeType("application/pdf")).toBe(false);
  });
});

describe("extractContent", () => {
  it("extracts text from a plain text buffer", async () => {
    const text = "Hello, world! This is a test file.";
    const buffer = Buffer.from(text, "utf-8");
    const result = await extractContent(buffer, "text/plain");
    expect(result).toBe(text);
  });

  it("extracts text from JSON buffer", async () => {
    const json = '{"key": "value"}';
    const buffer = Buffer.from(json, "utf-8");
    const result = await extractContent(buffer, "application/json");
    expect(result).toBe(json);
  });

  it("returns empty string for unsupported types", async () => {
    const buffer = Buffer.from([0x00, 0x01, 0x02]);
    const result = await extractContent(buffer, "application/octet-stream");
    expect(result).toBe("");
  });

  it("truncates text exceeding MAX_TEXT_SIZE", async () => {
    const longText = "x".repeat(MAX_TEXT_SIZE + 1000);
    const buffer = Buffer.from(longText, "utf-8");
    const result = await extractContent(buffer, "text/plain");
    expect(result.length).toBeLessThan(longText.length);
    expect(result).toContain("⚠️ Content truncated");
  });
});

describe("formatSize", () => {
  it("formats bytes", () => {
    expect(formatSize(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatSize(1024)).toBe("1.0 KB");
    expect(formatSize(2560)).toBe("2.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
