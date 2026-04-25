import { z } from "zod";
import {
  normalizeJiraBody,
  isAdfDocument,
  type JiraBodyFormat,
} from "../jira/adf.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const previewAdfSchema = z.object({
  body: z.union([z.string(), z.record(z.unknown())]),
  bodyFormat: z.enum(["plain", "markdown", "adf"]).default("markdown"),
});

// ---------------------------------------------------------------------------
// Handler (no session needed — pure local transform)
// ---------------------------------------------------------------------------

export async function handlePreviewAdf(
  rawInput: unknown
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = previewAdfSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  const { body, bodyFormat } = parsed.data;

  let adfDoc: ReturnType<typeof normalizeJiraBody>;
  try {
    adfDoc = normalizeJiraBody(body, bodyFormat as JiraBodyFormat);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return errorContent(`Conversion failed: ${message}`);
  }

  const warnings = collectWarnings(adfDoc);
  const stats = collectStats(adfDoc);

  const lines: string[] = [
    "## ADF Preview",
    "",
    "### Stats",
    `| Metric | Value |`,
    `|---|---|`,
    `| Top-level nodes | ${stats.nodeCount} |`,
    `| Estimated text length | ${stats.textLength} chars |`,
    `| Node types | ${stats.nodeTypes.join(", ")} |`,
  ];

  if (warnings.length > 0) {
    lines.push("", "### ⚠️ Warnings");
    for (const w of warnings) {
      lines.push(`- ${w}`);
    }
  } else {
    lines.push("", "✅ No warnings.");
  }

  lines.push("", "### ADF JSON", "```json", JSON.stringify(adfDoc, null, 2), "```");

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AdfStats {
  nodeCount: number;
  textLength: number;
  nodeTypes: string[];
}

function collectStats(doc: { content?: Array<{ type: string }> }): AdfStats {
  const content = doc.content ?? [];
  const types = [...new Set(content.map((n) => n.type))];
  const textLength = JSON.stringify(doc).length;
  return { nodeCount: content.length, textLength, nodeTypes: types };
}

function collectWarnings(doc: {
  content?: Array<{ type: string; content?: unknown[] }>;
}): string[] {
  const warnings: string[] = [];
  const content = doc.content ?? [];

  if (content.length === 0) {
    warnings.push("ADF document has no content nodes.");
  }

  for (const node of content) {
    if (node.type === "codeBlock") {
      // Only warn if this looks like a table fallback (heuristic: many | chars)
      const nodeText = JSON.stringify(node);
      if (nodeText.includes(" | ") || nodeText.includes("\\n|")) {
        warnings.push(
          "A table was converted to a codeBlock (phase 1 fallback). Use real ADF table if rendering is important."
        );
        break;
      }
    }
    if (node.type === "paragraph" && Array.isArray(node.content) && node.content.length === 0) {
      warnings.push("One or more empty paragraph nodes detected (e.g. from thematic break).");
      break;
    }
  }

  // Warn on very large payloads
  const jsonLen = JSON.stringify(doc).length;
  if (jsonLen > 50_000) {
    warnings.push(`ADF document is large (${jsonLen} chars). Consider splitting the comment.`);
  }

  return warnings;
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}
