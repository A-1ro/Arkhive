// No dependency installation or lifecycle scripts: audit the committed lockfile.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const levels = ["info", "low", "moderate", "high", "critical"];
export const registry = "https://registry.npmjs.org";

export function classifyAudit(result) {
  const incomplete = (reason) => ({ status: "incomplete", reason });
  if (result.error || result.signal || ![0, 1].includes(result.status)) {
    return incomplete(
      "Audit command failed, timed out, or exited unexpectedly.",
    );
  }
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    return incomplete("Audit did not return valid JSON.");
  }
  const counts = report?.metadata?.vulnerabilities;
  if (
    !report ||
    report.error ||
    !counts ||
    levels.some(
      (level) => !Number.isSafeInteger(counts[level]) || counts[level] < 0,
    )
  ) {
    return incomplete(
      "Audit returned an error or unsupported vulnerability counts.",
    );
  }
  // This collector intentionally supports pnpm's advisory report schema only.
  // A new schema must be reviewed rather than accidentally declared clean.
  const advisories = report.advisories;
  if (
    !advisories ||
    typeof advisories !== "object" ||
    Array.isArray(advisories)
  ) {
    return incomplete("Audit returned an unsupported advisory schema.");
  }
  const entries = Object.values(advisories);
  if (
    entries.some(
      (entry) =>
        !entry ||
        typeof entry.module_name !== "string" ||
        !levels.includes(entry.severity) ||
        typeof entry.vulnerable_versions !== "string" ||
        typeof entry.url !== "string",
    )
  ) {
    return incomplete("Audit returned incomplete advisory details.");
  }
  if (
    levels.some(
      (level) =>
        counts[level] > 0 !== entries.some((entry) => entry.severity === level),
    )
  ) {
    return incomplete("Audit counts and advisory details disagree.");
  }
  const actionable = levels.slice(1).some((level) => counts[level] > 0);
  if (!actionable && result.status !== 0) {
    return incomplete(
      "Audit exited unsuccessfully without a low-or-higher finding.",
    );
  }
  return { status: actionable ? "findings" : "clean", counts, advisories };
}

export function collectSecurityReport(root, run = spawnSync) {
  const options = {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, npm_config_ignore_scripts: "true" },
  };
  const manifest = JSON.parse(
    readFileSync(resolve(root, "package.json"), "utf8"),
  );
  const lockfile = readFileSync(resolve(root, "pnpm-lock.yaml"));
  const git = run("git", ["rev-parse", "HEAD"], options);
  if (
    git.error ||
    git.status !== 0 ||
    !/^[a-f0-9]{40}$/.test(git.stdout.trim())
  ) {
    throw new Error("Cannot determine the audited commit.");
  }
  const report = {
    schemaVersion: 1,
    collectedAt: new Date().toISOString(),
    commit: git.stdout.trim(),
    lockfileSha256: createHash("sha256").update(lockfile).digest("hex"),
    nodeVersion: process.version,
    packageManager: manifest.packageManager,
    registry,
    dependencies: manifest.dependencies ?? {},
    devDependencies: manifest.devDependencies ?? {},
  };
  const version = run("pnpm", ["--version"], options);
  if (
    version.error ||
    version.status !== 0 ||
    `pnpm@${version.stdout.trim()}` !== manifest.packageManager
  ) {
    return {
      ...report,
      audit: {
        status: "incomplete",
        reason: "The pinned pnpm version is unavailable.",
      },
    };
  }
  return {
    ...report,
    audit: classifyAudit(
      run(
        "pnpm",
        ["audit", "--audit-level=low", "--json", `--registry=${registry}`],
        options,
      ),
    ),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  let report;
  try {
    report = collectSecurityReport(process.cwd());
  } catch {
    report = {
      schemaVersion: 1,
      collectedAt: new Date().toISOString(),
      audit: {
        status: "incomplete",
        reason: "Cannot read repository inputs or commit.",
      },
    };
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const counts = report.audit.counts;
    const summary = counts
      ? levels.map((level) => `${level}: ${counts[level]}`).join(", ")
      : report.audit.reason;
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Dependency audit: ${report.audit.status}\n${summary}\n`,
    );
  }
  process.exitCode = { clean: 0, findings: 1, incomplete: 2 }[
    report.audit.status
  ];
}
