import { z } from "zod";
import { FIELD, ISSUE_TYPE, type IssueTypeId } from "../jira/constants.js";
import { buildCreateIssuePayload } from "../jira/create-issue.js";

export const previewCreateIssueSchema = z.object({
  issueTypeId: z.nativeEnum(ISSUE_TYPE),
  fields: z.record(z.unknown()),
});

export async function handlePreviewCreateIssue(
  rawInput: unknown
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = previewCreateIssueSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  try {
    const issueTypeId = parsed.data.issueTypeId as IssueTypeId;
    const payload = buildCreateIssuePayload(issueTypeId, parsed.data.fields);
    const summary = typeof parsed.data.fields[FIELD.SUMMARY] === "string"
      ? parsed.data.fields[FIELD.SUMMARY]
      : "";

    return {
      content: [
        {
          type: "text",
          text: [
            `# Create issue preview`,
            "",
            `**Issue Type ID:** ${issueTypeId}`,
            `**Summary:** ${summary}`,
            "",
            "```json",
            JSON.stringify(payload, null, 2),
            "```",
          ].join("\n"),
        },
      ],
    };
  } catch (err: unknown) {
    if (err instanceof Error) {
      return errorContent(err.message);
    }
    throw err;
  }
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}
