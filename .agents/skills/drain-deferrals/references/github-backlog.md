# GitHub backlog field/option node IDs

Backlog lives as issues on `lodekit/lodekit` (org-level issue types + custom issue
fields). Originally transcribed from the `github-backlog-pipeline` auto-memory; the
type, sub-issue, dependency and Area entries were re-verified against the API
2026-08-05.

**GitHub project number:** (not recorded — look up at drain time via `gh api graphql`
project query)

**Create with type (REST):** `POST /repos/lodekit/lodekit/issues` accepts `"type"`
directly. Four org-level types exist — always set one:

| Type | Use for |
|---|---|
| `bug` | Something is broken or wrong: incorrect behaviour, a claim the code contradicts, a doc stale enough to actively mislead. |
| `feature` | New capability a user can see or do. |
| `chore` | Ancillary maintenance — CI, dependencies, licensing, tooling, doc accuracy, repo settings, release mechanics. Most drained deferrals land here. |
| `track` | An umbrella grouping other issues into batches. A track carries no implementation of its own; its children do the work. |

Retype an existing issue with `PATCH /repos/lodekit/lodekit/issues/{n}` and `-f type=…`.

**Sub-issues** are enabled, and are how a `track` owns its children:
`POST /repos/lodekit/lodekit/issues/{parent}/sub_issues` with `sub_issue_id` = the
child's database ID (`.id`, not the issue number). **A sub-issue has at most one
parent** — an issue already owned by another track cannot be adopted, only
cross-referenced. House pattern for a track: sub-issue links *and* a markdown batch
list in the body, plus a "Tracked elsewhere" section naming issues that belong to a
sibling track.

**Dependencies** record ordering between issues:
`POST /repos/lodekit/lodekit/issues/{n}/dependencies/blocked_by` with
`{"issue_id": <int>}`. The id must be a JSON integer, so pass it via `--input -`;
`-f issue_id=…` sends a string and 422s. Read back with the matching `GET`.

Titles: imperative, short. Priority never `urgent`.

## Field → option → node ID

| Field | fieldId | Option | singleSelectOptionId |
|---|---|---|---|
| Priority | `IFSS_kgDOApqUzA` | urgent | `IFSSO_kgDOBI6PQw` |
| Priority | `IFSS_kgDOApqUzA` | high | `IFSSO_kgDOBI6PRA` |
| Priority | `IFSS_kgDOApqUzA` | medium | `IFSSO_kgDOBI6PRQ` |
| Priority | `IFSS_kgDOApqUzA` | low | `IFSSO_kgDOBI6PRg` |
| Area | `IFSS_kgDOAqC5_g` | infra | `IFSSO_kgDOBJlXrA` |
| Area | `IFSS_kgDOAqC5_g` | security | `IFSSO_kgDOBJ5B-g` |
| Area | `IFSS_kgDOAqC5_g` | engine | `IFSSO_kgDOBJlXrQ` |
| Area | `IFSS_kgDOAqC5_g` | service | `IFSSO_kgDOBJlXrg` |
| Area | `IFSS_kgDOAqC5_g` | ui | `IFSSO_kgDOBJlXrw` |
| Area | `IFSS_kgDOAqC5_g` | manager | `IFSSO_kgDOBJlXsA` |
| Area | `IFSS_kgDOAqC5_g` | web-docs | `IFSSO_kgDOBJlXsQ` |
| Area | `IFSS_kgDOAqC5_g` | web-main | `IFSSO_kgDOBJlXsg` |
| Definition | `IFSS_kgDOAqC7bw` | undefined | `IFSSO_kgDOBJlaNw` |
| Definition | `IFSS_kgDOAqC7bw` | partial | `IFSSO_kgDOBJlaOA` |
| Definition | `IFSS_kgDOAqC7bw` | defined | `IFSSO_kgDOBJlaOQ` |

Definition maps refinement: undefined = needs deep spec, partial = needs light
design/decision, defined = solution known.

List fields via `GET /orgs/lodekit/issue-fields`; resolve node IDs via GraphQL
`nodes(ids:…) { ... on IssueFieldSingleSelect { options { id name } } }`. Read back a
set value: `GET /repos/lodekit/lodekit/issues/{n}/issue-field-values`.

Throttle creation ~2s/issue (secondary rate limits).

## Mutation

```graphql
mutation($issueId: ID!, $fields: [IssueFieldCreateOrUpdateInput!]!) {
  setIssueFieldValue(input: {issueId: $issueId, issueFields: $fields}) { issue { number } }
}
```

each element `{fieldId, singleSelectOptionId}`.

## Worked example

Set Priority=high, Area=infra, Definition=defined on issue node ID `<ISSUE_NODE_ID>`
(fetch an issue's node ID via `gh api repos/lodekit/lodekit/issues/{n} --jq .node_id`):

```bash
gh api graphql -f query='
mutation($issueId: ID!, $fields: [IssueFieldCreateOrUpdateInput!]!) {
  setIssueFieldValue(input: {issueId: $issueId, issueFields: $fields}) { issue { number } }
}' \
  -f issueId='<ISSUE_NODE_ID>' \
  -F 'fields[][fieldId]=IFSS_kgDOApqUzA' \
  -F 'fields[][singleSelectOptionId]=IFSSO_kgDOBI6PRA' \
  -F 'fields[][fieldId]=IFSS_kgDOAqC5_g' \
  -F 'fields[][singleSelectOptionId]=IFSSO_kgDOBJlXrA' \
  -F 'fields[][fieldId]=IFSS_kgDOAqC7bw' \
  -F 'fields[][singleSelectOptionId]=IFSSO_kgDOBJlaOQ'
```

Syntax note: use the no-index `fields[][subkey]` form. gh groups consecutive
`fields[][…]` subkeys into one array element and starts a new element when a subkey
repeats, producing `{"fields":[{fieldId, singleSelectOptionId}, …]}` — a proper list,
as `[IssueFieldCreateOrUpdateInput!]!` requires. Numeric indices
(`fields[0][fieldId]=…`) build a JSON *object* keyed `"0"`/`"1"` instead, which
GraphQL variable coercion rejects. Confirm the built shape with
`gh api graphql --verbose` (it prints `GraphQL variables:`) before the first real
mutation.
