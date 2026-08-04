# GitHub backlog field/option node IDs

Backlog lives as issues on `lodekit/lodekit` (org-level issue types + custom issue
fields). Transcribed verbatim from the `github-backlog-pipeline` auto-memory.

**GitHub project number:** (not recorded — look up at drain time via `gh api graphql`
project query)

**Create with type (REST):** `POST /repos/lodekit/lodekit/issues` accepts
`"type": "bug" | "feature"` directly. Sub-issues are enabled:
`POST /repos/lodekit/lodekit/issues/{parent}/sub_issues` with `sub_issue_id` = the
child's database ID (`.id`, not the issue number). Titles: imperative, short.
Priority never `urgent`.

## Field → option → node ID

| Field | fieldId | Option | singleSelectOptionId |
|---|---|---|---|
| Priority | `IFSS_kgDOApqUzA` | urgent | `IFSSO_kgDOBI6PQw` |
| Priority | `IFSS_kgDOApqUzA` | high | `IFSSO_kgDOBI6PRA` |
| Priority | `IFSS_kgDOApqUzA` | medium | `IFSSO_kgDOBI6PRQ` |
| Priority | `IFSS_kgDOApqUzA` | low | `IFSSO_kgDOBI6PRg` |
| Area | `IFSS_kgDOAqC5_g` | infra | `IFSSO_kgDOBJlXrA` |
| Area | `IFSS_kgDOAqC5_g` | runtime | `IFSSO_kgDOBJlXrQ` |
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
