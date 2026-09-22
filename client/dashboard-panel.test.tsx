import { describe, expect, it } from "vitest";
import {
  INITIAL_DISCLOSURE,
  reconcileDisclosure,
  toggleGroup,
  toggleOther,
  togglePreview,
} from "./dashboard-disclosure";
import { type DashboardAgent, buildDashboardProjection, validTime } from "./dashboard-model";

function agent(id: string, overrides: Partial<DashboardAgent> = {}): DashboardAgent {
  return {
    id,
    workspaceId: "workspace",
    provider: "pi",
    model: null,
    title: id,
    status: "idle",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    lastUserMessageAt: null,
    pendingPermissions: [],
    labels: {},
    ...overrides,
  };
}

describe("dashboard disclosure", () => {
  it("expands groups without previews and clears disclosed rows on collapse", () => {
    const expanded = toggleGroup(INITIAL_DISCLOSURE, "root");
    expect([...expanded.expandedGroups]).toEqual(["root"]);
    expect(expanded.previewKeys.size).toBe(0);

    const disclosed = togglePreview(expanded, "background:root:child");
    expect([...disclosed.previewKeys]).toEqual(["background:root:child"]);

    const collapsed = toggleGroup(disclosed, "root");
    expect(collapsed.expandedGroups.size).toBe(0);
    expect(collapsed.previewKeys.size).toBe(0);
    expect(toggleGroup(collapsed, "root").previewKeys.size).toBe(0);
  });

  it("clears other previews on collapse", () => {
    const expanded = toggleOther(INITIAL_DISCLOSURE);
    const disclosed = togglePreview(expanded, "other:orphan");
    const collapsed = toggleOther(disclosed);

    expect(collapsed.otherExpanded).toBe(false);
    expect(collapsed.previewKeys.size).toBe(0);
  });

  it("reconciles removed and reparented disclosure keys without changing stable state", () => {
    const projection = buildDashboardProjection([
      agent("root"),
      agent("child", { labels: { "paseo.parent-agent-id": "root" } }),
      agent("orphan", { labels: { "paseo.parent-agent-id": "missing" } }),
    ]);
    const disclosed = {
      expandedGroups: new Set(["root", "removed"]),
      otherExpanded: true,
      previewKeys: new Set([
        "interactive:root",
        "background:root:child",
        "background:old:child",
        "other:orphan",
        "other:removed",
      ]),
    };
    const reconciled = reconcileDisclosure(disclosed, projection);

    expect([...reconciled.expandedGroups]).toEqual(["root"]);
    expect([...reconciled.previewKeys]).toEqual([
      "interactive:root",
      "background:root:child",
      "other:orphan",
    ]);
    expect(reconcileDisclosure(reconciled, projection)).toBe(reconciled);
  });

  it("accepts the Unix epoch as a valid activity timestamp", () => {
    expect(validTime("1970-01-01T00:00:00.000Z")).toBe(0);
  });
});
