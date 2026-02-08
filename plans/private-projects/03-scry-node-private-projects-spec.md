# Spec: scry-node — Private Projects (Option 1)

## Scope

Adjust CLI output so “View” links for private projects do not point to publicly accessible CDN URLs.

## Requirements

1. CLI should print:
   - Public project: `SCRY_VIEW_URL/{projectId}/{versionId}/`
   - Private project: `SCRY_DASHBOARD_URL/view/{projectId}/{versionId}/`
2. CLI must learn project visibility from the deploy/create-build response or by querying project metadata.
3. No viewer authentication tokens are embedded in URLs.

## Proposed Changes

### API response

Ensure the API response used by the CLI after deploy includes:

- `project.visibility`

or a boolean `project.isPrivate`.

### CLI formatting

When `visibility === 'private'`:

- print dashboard viewer URL, not CDN viewer URL.

### Environment variables

- `SCRY_VIEW_URL` (existing)
- `SCRY_DASHBOARD_URL` (new; defaults to `https://dashboard.scrymore.com`)

## Backwards Compatibility

- If visibility is missing (older API), default to public behavior.

## Acceptance Criteria

1. Deploy output prints the correct view URL based on visibility.
2. No secret headers or tokens are exposed.

## Example Output

**Public project:**

```text
View Storybook: https://view.scrymore.com/my-project/v1.2.3/
Coverage JSON:  https://view.scrymore.com/my-project/v1.2.3/coverage-report.json
```

**Private project:**

```text
View Storybook: https://dashboard.scrymore.com/view/my-project/v1.2.3/
Coverage JSON:  https://dashboard.scrymore.com/view/my-project/v1.2.3/coverage-report.json
```

