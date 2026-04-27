import { z } from "zod";
import {
  normalizeJiraBody,
  type JiraBodyFormat,
} from "../jira/body-normalizer.js";
import { navigationHint } from "../utils.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const previewAdfSchema = z.object({
  body: z.string(),
  bodyFormat: z.enum(["plain", "markdown"]).default("markdown"),
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

  let wikiMarkup: string;
  try {
    wikiMarkup = normalizeJiraBody(body, bodyFormat as JiraBodyFormat);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return errorContent(`Conversion failed: ${message}`);
  }

  const charCount = wikiMarkup.length;
  const lineCount = wikiMarkup.split("\n").length;
  const warnings: string[] = [];

  if (charCount === 0) {
    warnings.push("Resulting Wiki Markup is empty.");
  }
  if (charCount > 32_000) {
    warnings.push(`Wiki Markup is large (${charCount} chars). Jira Server may have comment size limits.`);
  }

  const lines: string[] = [
    "## Jira Wiki Markup Preview",
    "",
    "### Stats",
    `| Metric | Value |`,
    `|---|---|`,
    `| Characters | ${charCount} |`,
    `| Lines | ${lineCount} |`,
    `| Format | ${bodyFormat} |`,
  ];

  if (warnings.length > 0) {
    lines.push("", "### ⚠️ Warnings");
    for (const w of warnings) {
      lines.push(`- ${w}`);
    }
  } else {
    lines.push("", "✅ No warnings.");
  }

  lines.push("", "### Wiki Markup Output", "```", wikiMarkup, "```");

  return {
    content: [
      {
        type: "text",
        text: lines.join("\n") + navigationHint(
          `\`jira_add_comment({issueKey: "<key>", body: "<wiki_markup>", bodyFormat: "plain"})\` to post as a comment`,
          `\`jira_create_issue({..., fields: {description: "<wiki_markup>"}})\` to use as issue description`,
          `\`jira_update_issue_fields({issueKey: "<key>", fields: {description: "<wiki_markup>"}})\` to update description`,
        ),
      },
    ],
  };
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}
