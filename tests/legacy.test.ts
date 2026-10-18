import { describe, expect, it } from "vitest";
import legacy from "../src/server/legacy";
import {
  canonicalOrigin,
  mergeDrafts,
  parseLegacyDrafts,
} from "../src/shared/legacy-drafts";
import { newCharacter } from "../src/shared/rules";

describe("URL migration", () => {
  it("redirects paths and queries to the canonical origin", async () => {
    const response = await legacy.request(
      "https://cthulhu-charactersheet.aaa-4e2k3.workers.dev/?character=test",
    );
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe(
      `${canonicalOrigin}/?character=test`,
    );
  });
  it("only allows the new origin to embed the migration endpoint", async () => {
    const response = await legacy.request("https://old.test/migrate");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Security-Policy")).toContain(
      `frame-ancestors ${canonicalOrigin}`,
    );
    const script = await (
      await legacy.request("https://old.test/migration.js")
    ).text();
    expect(script).toContain(
      'event.origin!=="https://arkhive.hiyori-schedule.com"',
    );
    expect(script).toContain("event.source!==parent");
  });
  it("validates saved characters and rejects invalid migration data", () => {
    const c = newCharacter();
    expect(parseLegacyDrafts(JSON.stringify([c]))).toEqual([c]);
    expect(parseLegacyDrafts(null)).toEqual([]);
    expect(parseLegacyDrafts("{bad")).toBeNull();
    expect(parseLegacyDrafts(JSON.stringify([{ id: "bad" }]))).toBeNull();
  });
  it("keeps newer local edits while merging old drafts without duplicates", () => {
    const c = newCharacter();
    const older = { ...c, name: "Old", updatedAt: "2026-10-01T00:00:00.000Z" };
    const current = {
      ...c,
      name: "New",
      updatedAt: "2026-10-18T00:00:00.000Z",
    };
    const other = newCharacter();
    expect(mergeDrafts([current], [older, other])).toEqual([current, other]);
    expect(mergeDrafts([older], [current])).toEqual([current]);
  });
});
