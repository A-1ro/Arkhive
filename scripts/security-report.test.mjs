import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  classifyAudit,
  collectSecurityReport,
  registry,
} from "./collect-security-report.mjs";

function result(counts = {}, advisories = {}, status = 0) {
  return {
    status,
    stdout: JSON.stringify({
      advisories,
      metadata: {
        vulnerabilities: {
          info: 0,
          low: 0,
          moderate: 0,
          high: 0,
          critical: 0,
          ...counts,
        },
      },
    }),
  };
}

const advisory = {
  module_name: "example",
  severity: "high",
  vulnerable_versions: "<2.0.0",
  url: "https://github.com/advisories/GHSA-example",
};

test("distinguishes a clean scan from actionable transitive/dev findings", () => {
  assert.equal(classifyAudit(result()).status, "clean");
  const finding = classifyAudit(result({ high: 2 }, { 123: advisory }, 1));
  assert.equal(finding.status, "findings");
  assert.deepEqual(finding.advisories[123], advisory);
});

test("never declares failed or incomplete scans clean", () => {
  for (const invalid of [
    { status: 0, stdout: "not JSON" },
    { status: 0, stdout: "null" },
    { status: 0, stdout: JSON.stringify({ error: { code: "ENOAUDIT" } }) },
    { ...result(), error: new Error("network failure") },
    { ...result(), status: null, signal: "SIGTERM" },
    { ...result(), status: 2 },
    result({}, {}, 1),
    result({ high: -1 }),
    result({ low: "0" }),
    result({ high: 1 }),
    result({}, { 123: advisory }),
    result({ high: 1 }, { 123: { ...advisory, url: null } }, 1),
    {
      status: 0,
      stdout: JSON.stringify({ metadata: { vulnerabilities: {} } }),
    },
  ]) {
    assert.equal(classifyAudit(invalid).status, "incomplete");
  }
});

test("keeps info-only reports non-actionable", () => {
  assert.equal(
    classifyAudit(
      result({ info: 1 }, { 123: { ...advisory, severity: "info" } }),
    ).status,
    "clean",
  );
});

test("records provenance, audits all dependency classes, and refuses the wrong pnpm", () => {
  const root = mkdtempSync(join(tmpdir(), "arkhive-security-"));
  try {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ packageManager: "pnpm@10.34.7" }),
    );
    writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    const calls = [];
    let pnpmVersion = "10.34.7";
    const run = (command, args, options) => {
      calls.push([command, args]);
      assert.equal(options.cwd, root);
      assert.equal(options.env.npm_config_ignore_scripts, "true");
      if (command === "git") return { status: 0, stdout: "a".repeat(40) };
      if (args[0] === "--version") return { status: 0, stdout: pnpmVersion };
      return result();
    };
    const report = collectSecurityReport(root, run);
    assert.equal(report.audit.status, "clean");
    assert.equal(report.commit, "a".repeat(40));
    assert.match(report.lockfileSha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(calls[2], [
      "pnpm",
      ["audit", "--audit-level=low", "--json", `--registry=${registry}`],
    ]);
    calls.length = 0;
    pnpmVersion = "11.0.0";
    assert.equal(collectSecurityReport(root, run).audit.status, "incomplete");
    assert.equal(calls.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
