import { describe, expect, it } from "vitest";
import {
  type DashboardAgent,
  agentState,
  buildDashboardProjection,
  projectionPreviewKeys,
  removeKeysWithPrefix,
  retainKeys,
  visibleDashboardRows,
} from "./dashboard-model";

function agent(id: string, overrides: Partial<DashboardAgent> = {}): DashboardAgent {
  return {
    id,
    workspaceId: "workspace",
    provider: "codex",
    model: "gpt-test",
    title: id,
    status: "idle",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastUserMessageAt: null,
    pendingPermissions: [],
    labels: {},
    ...overrides,
  };
}

const child = (id: string, parentId: string, overrides: Partial<DashboardAgent> = {}) =>
  agent(id, { labels: { "paseo.parent-agent-id": parentId }, ...overrides });

describe("dashboard model", () => {
  it("orders interactive agents by user activity with creation fallback and stable ties", () => {
    const projection = buildDashboardProjection([
      agent("fallback", { createdAt: "2026-01-03T00:00:00.000Z" }),
      agent("invalid", { createdAt: "invalid", lastUserMessageAt: "invalid" }),
      agent("tie-b", { lastUserMessageAt: "2026-01-04T00:00:00.000Z" }),
      agent("tie-a", { lastUserMessageAt: "2026-01-04T00:00:00.000Z" }),
      agent("older", { lastUserMessageAt: "2026-01-02T00:00:00.000Z" }),
    ]);

    expect(projection.interactive.map(({ agent: item }) => item.id)).toEqual([
      "tie-a",
      "tie-b",
      "fallback",
      "older",
      "invalid",
    ]);
  });

  it("keeps explicit descendants with their interactive ancestor regardless of activity", () => {
    const projection = buildDashboardProjection([
      agent("recent", { lastUserMessageAt: "2026-01-03T00:00:00.000Z" }),
      agent("older", { lastUserMessageAt: "2026-01-02T00:00:00.000Z" }),
      child("very-active-child", "older", { updatedAt: "2026-02-01T00:00:00.000Z" }),
      child("nested", "very-active-child"),
    ]);

    expect(projection.interactive.map(({ agent: item }) => item.id)).toEqual(["recent", "older"]);
    expect(projection.interactive[1]?.background.map(({ agent: item }) => item.id)).toEqual([
      "very-active-child",
      "nested",
    ]);
  });

  it("summarizes recursive descendants once with actionable states", () => {
    const [group] = buildDashboardProjection([
      agent("root", { status: "closed" }),
      child("working", "root", { status: "running" }),
      child("permission", "working", { status: "closed", pendingPermissions: [{}] }),
      child("failed", "root", { status: "error" }),
      child("done", "root"),
    ]).interactive;

    expect(group?.state).toBe("done");
    expect(group?.counts).toEqual({ needs_input: 1, failed: 1, working: 1, done: 1 });
    expect(group?.background.map(({ agent: item }) => item.id)).toEqual([
      "done",
      "failed",
      "working",
      "permission",
    ]);
  });

  it("keeps orphan, self-linked, and cyclic agents in recent-activity order without duplicates", () => {
    const projection = buildDashboardProjection([
      child("orphan", "missing", { updatedAt: "2026-01-02T00:00:00.000Z" }),
      child("self", "self", { updatedAt: "2026-01-04T00:00:00.000Z" }),
      child("a", "b", { updatedAt: "2026-01-03T00:00:00.000Z" }),
      child("b", "a", { updatedAt: "2026-01-01T00:00:00.000Z" }),
    ]);

    const ids = projection.otherBackground.map(({ agent: item }) => item.id);
    expect(ids).toEqual(["self", "a", "orphan", "b"]);
    expect(new Set(ids).size).toBe(4);
    expect(projection.interactive).toHaveLength(0);
  });

  it("uses permission and failure signals but derives all other states from lifecycle", () => {
    expect(agentState(agent("permission", { status: "error", pendingPermissions: [{}] }))).toBe(
      "needs_input",
    );
    expect(agentState(agent("reason", { attentionReason: "permission" }))).toBe("needs_input");
    expect(agentState(agent("failed", { attentionReason: "error" }))).toBe("failed");
    expect(
      agentState(agent("running-null", { status: "running", requiresAttention: true, attentionReason: null })),
    ).toBe("working");
    expect(agentState(agent("running-missing", { status: "running", requiresAttention: true }))).toBe(
      "working",
    );
    expect(
      agentState(agent("finished", { requiresAttention: true, attentionReason: "finished" })),
    ).toBe("done");
  });

  it("projects collapsed groups without descendant rows and reveals only requested groups", () => {
    const projection = buildDashboardProjection([
      agent("root"),
      child("child", "root"),
      child("orphan", "missing"),
    ]);

    expect(visibleDashboardRows(projection, new Set(), false).map(({ kind }) => kind)).toEqual([
      "interactive",
      "other_header",
    ]);
    expect(
      visibleDashboardRows(projection, new Set(["root"]), true).map(({ kind }) => kind),
    ).toEqual(["interactive", "background", "other_header", "other_background"]);
  });

  it("keeps preview disclosure separate from group expansion and clears stale ownership", () => {
    const projection = buildDashboardProjection([
      agent("root"),
      agent("other-root"),
      child("child", "root"),
    ]);
    const previews = new Set<string>();

    visibleDashboardRows(projection, new Set(["root"]), false);
    expect(retainKeys(previews, projectionPreviewKeys(projection))).toBe(previews);

    const disclosed = new Set(["background:root:child", "interactive:root"]);
    expect([...removeKeysWithPrefix(disclosed, "background:root:")]).toEqual([
      "interactive:root",
    ]);

    const reparented = buildDashboardProjection([
      agent("root"),
      agent("other-root"),
      child("child", "other-root"),
    ]);
    expect([...retainKeys(disclosed, projectionPreviewKeys(reparented))]).toEqual([
      "interactive:root",
    ]);
  });
});
