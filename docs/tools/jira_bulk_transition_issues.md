# jira_bulk_transition_issues

Transition multiple issues with explicit dry-run control.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dryRun` | `boolean` | yes | `true` resolves/previews only; `false` applies transitions |
| `issues` | `array` | yes | 1-25 transition requests |

Each issue item contains:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `issueKey` | `string` | yes | Jira issue key |
| `transitionId` | `string` | conditional | Transition id |
| `transitionName` | `string` | conditional | Transition name to resolve from available transitions |
| `comment` | `string \| object` | no | Optional transition comment |
| `fields` | `object` | no | Optional fields sent with the transition |

Provide exactly one of `transitionId` or `transitionName`.

## Behavior

- Requires explicit `dryRun`
- Resolves transition names to ids before reporting/applying
- Continues processing after per-issue failures
- Calls Jira transition only when `dryRun` is `false`

## Output

Markdown table with per-issue status and resolved transition ids.
