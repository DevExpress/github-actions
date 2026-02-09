# github-actions
Composite GitHub actions

## Workflows

### repository-check
A reusable workflow that runs repository health checks.

To use this workflow in another repository:

```yaml
name: Health Check

on:
  push:

jobs:
  check:
    uses: DevExpress/github-actions/.github/workflows/repository-check.yml@repo-check-v1
```
