import { z } from "zod";
import { ISSUE_TYPE } from "../jira/constants.js";
import { buildCreateMeta } from "../jira/create-meta.js";

export const getCreateMetaSchema = z.object({
  issueTypeId: z.nativeEnum(ISSUE_TYPE).optional(),
});

export async function handleGetCreateMeta(
  rawInput: unknown
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = getCreateMetaSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  const meta = buildCreateMeta(parsed.data.issueTypeId);
  return {
    content: [
      {
        type: "text",
        text: formatCreateMeta(meta),
      },
    ],
  };
}

function formatCreateMeta(meta: ReturnType<typeof buildCreateMeta>): string {
  const lines: string[] = ["# Jira Create Meta", ""];

  for (const issueType of meta.issueTypes) {
    lines.push(`## ${issueType.label} (${issueType.id})`);
    lines.push("");
    lines.push(`**Required fields:** ${issueType.requiredFields.join(", ") || "None"}`);
    lines.push(`**Optional fields:** ${issueType.optionalFields.join(", ") || "None"}`);
    if (Object.keys(issueType.knownOptions).length > 0) {
      lines.push("");
      lines.push(`**Known options:**`);
      for (const [fieldId, options] of Object.entries(issueType.knownOptions)) {
        lines.push(`- ${fieldId}: ${Object.keys(options).join(", ")}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}
