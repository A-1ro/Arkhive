# Security checks

The `Security` workflow runs on pull requests, pushes to `main`, manual dispatch,
and Sundays at 14:57 UTC (23:57 Asia/Tokyo). Scheduled runs use the default
branch and start only after the workflow is merged. GitHub may delay or drop
scheduled runs under load, and disables schedules in public repositories after
60 days without repository activity. Completion before Monday 08:00 JST is not
guaranteed. Check Actions for the latest completed run rather than assuming it ran.

## Dependency audit

The committed pnpm lockfile is checked against the public npm registry,
including development and optional dependencies. No project dependencies are
installed and no project lifecycle scripts run in this job. Package names and
versions are sent to the registry's advisory API; source code is not sent.
The package manager is pnpm 10.34.7, selected from `packageManager` using a
SHA-pinned setup Action. `pnpm audit` includes development and optional
dependencies by default; no production-only filter is used. No install step or
package cache is used in this job. Registry failures are not ignored.

Any low, moderate, high, or critical finding fails the job. The log includes
advisory details and the job summary includes severity counts. The JSON/summary
status `findings` means a completed scan found issues; `incomplete` means a
registry, command, tool-version or report error.
Setup failures/timeouts also mean incomplete coverage. A failed scan is never a
clean security result. No automatic fixes, suppressions, or ignored registry
errors are configured. The workflow reports findings; remediation is performed by
the separate daily Codex task described below and reviewed through pull requests.
Only dependencies represented in the committed lockfile are covered; generated
projects, unlocked fixtures, system packages, and vulnerabilities without a
published advisory are outside this check.

The shared collector is `scripts/collect-security-report.mjs` (also available as
`pnpm run security:collect`). It records collection time, commit SHA, lockfile
SHA-256, declared dependencies, severity counts and upstream advisory details as
JSON. Exit codes are 0 for no low-or-higher findings, 1 for findings, and 2 for an
incomplete scan. It refuses a different pnpm version and rejects malformed,
inconsistent or unsupported reports. It runs without installing dependencies.
`pnpm run test:security-report` exercises failure classification and provenance
without network access. CI runs these tests on each PR.

## Daily remediation pipeline

The account's **Arkhive セキュリティ対応** Codex task runs daily in the Arkhive
cloud environment. This task is scheduled separately from GitHub Actions; merging
this repository alone does not create a scheduler. Manage its cadence or pause it
in Codex tasks. The existing weekly Security workflow and Dependabot remain useful
independent checks. The daily task uses the versioned
[arkhive-security-remediation skill](../.agents/skills/arkhive-security-remediation/SKILL.md).

1. Start from fresh `origin/main`, record its SHA, and collect npm advisories for
   the complete lockfile without installing dependencies.
2. Read public GitHub Advisories and official Node.js, Cloudflare, framework and
   GitHub Action security notices. The agent performs this step; the JSON collector
   only queries npm. Check affected versions and usage conditions against the code,
   including development tooling. Check updated and older unresolved advisories.
3. Compare findings with open PRs (including Dependabot), merged fixes and current
   main. Fix confirmed issues in a small branch while preserving pnpm release-age
   and lifecycle restrictions. Recheck for duplicates immediately before PR creation.
4. Run frozen install, native dependency checks, typecheck, build, regression tests,
   collector tests and a second audit. Use only local D1/R2 for integration tests.
5. Create a PR with primary sources, impact, version changes, validation and remaining
   issues. Check CI and Security results for that PR's current head commit.

No new API key or Actions write token is embedded in the repository. The task needs
its cloud environment, public-source access and the account's connected GitHub
read/branch/push/PR access. Before enabling a replacement task, verify those reads
and an audit in its actual environment. Connection failures, registry errors,
unavailable sources and incomplete checks must be reported as incomplete coverage.
Never reinterpret them as a clean scan. Draft PRs must identify unrun checks.

Notify on a new PR, significant new finding, failure or required user action; avoid
repeating unchanged outcomes. No empty PRs or daily status-only commits. There is
no automatic merge, deployment, release or remote database operation. In particular,
merging into main can trigger Workers Builds and remains a separate review decision.

Manual invocation: ask Codex to run `$arkhive-security-remediation`, or direct it to
read `.agents/skills/arkhive-security-remediation/SKILL.md`. Read the skill for the
current sources, affected-feature checks, deduplication rules and validation commands.

## Code scanning

CodeQL scans actions, javascript-typescript, python with the
`security-extended` query suite and `build-mode: none`. No application build or
deployment is invoked. Results are uploaded to GitHub code scanning; database
upload is disabled. A successful analysis/upload is not proof of zero alerts:
review the repository Security tab and the CodeQL pull request check separately.
Generated code that is absent from the checkout and unsupported languages are
outside this scan. This is static analysis, not a production penetration test.

The workflow uses SHA-pinned upstream Actions, GitHub-hosted runners, read-only
checkout with no persisted credentials, and no deployment/release secrets.
Only the CodeQL job gets `security-events: write`, for result upload. Dependabot
keeps Action pins and package dependencies under review through update PRs.

Repository Security settings (Dependabot alerts/security updates, secret scanning,
push protection, and CodeQL default setup) are managed separately. This workflow
does not change those settings or grant new account/app access. Before enabling
CodeQL default setup later, reconcile it with this advanced workflow to avoid
overlapping configurations. Secret scanning is outside this workflow's scope.

## References

- [CodeQL workflow options](https://docs.github.com/en/code-security/reference/code-scanning/workflow-configuration-options)
- [CodeQL Action permissions and supported versions](https://github.com/github/codeql-action)
- [pnpm audit](https://pnpm.io/10.x/cli/audit)
- [GitHub scheduled events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

See [pnpm migration](pnpm-migration.md) for lifecycle-script restrictions,
lockfile preservation, native dependency checks, and pending Workers Builds setup.
