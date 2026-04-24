import { invalidInput } from "../errors.js";

export interface AdfTextNode {
  type: "text";
  text: string;
}

export interface AdfParagraphNode {
  type: "paragraph";
  content: AdfTextNode[];
}

export interface AdfDocument {
  type: "doc";
  version: number;
  content: AdfParagraphNode[];
}

export function buildMinimalAdfDocument(text: string): AdfDocument {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

export function isAdfDocument(value: unknown): value is AdfDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const maybeDoc = value as {
    type?: unknown;
    version?: unknown;
    content?: unknown;
  };

  return (
    maybeDoc.type === "doc" &&
    typeof maybeDoc.version === "number" &&
    Array.isArray(maybeDoc.content)
  );
}

export function normalizeAdfValue(value: unknown): string | AdfDocument {
  if (typeof value === "string") {
    return buildMinimalAdfDocument(value);
  }

  if (isAdfDocument(value)) {
    return value;
  }

  throw invalidInput("description/comment body must be a string or a valid ADF document.");
}
