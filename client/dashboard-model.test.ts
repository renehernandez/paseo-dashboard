import { describe, expect, it } from "vitest";
import {
  type DashboardAgent,
  agentState,
  buildAgentHierarchy,
  orderByAttention,
} from "./dashboard-model";

function agent(
  id: string,
  overrides: Partial<DashboardAgent> = {},
): DashboardAgent {
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

describe("dashboard model", () => {
  it("builds parent hierarchy and orders siblings by creation time then id", () => {
    const roots = buildAgentHierarchy([
      agent("later", {
        createdAt: "2026-01-03T00:00:00.000Z",
        labels: { "paseo.parent-agent-id": "root" },
      }),
      agent("root"),
      agent("same-b", {
        createdAt: "2026-01-02T00:00:00.000Z",
        labels: { "paseo.parent-agent-id": "root" },
      }),
      agent("same-a", {
        createdAt: "2026-01-02T00:00:00.000Z",
        labels: { "paseo.parent-agent-id": "root" },
      }),
    ]);

    expect(roots).toHaveLength(1);
    expect(roots[0]?.children.map(({ agent: child }) => child.id)).toEqual([
      "same-a",
      "same-b",
      "later",
    ]);
  });

  it("surfaces the most urgent descendant without calling an idle parent done", () => {
    const [root] = buildAgentHierarchy([
      agent("root"),
      agent("running-child", {
        status: "running",
        labels: { "paseo.parent-agent-id": "root" },
      }),
      agent("permission-child", {
        status: "running",
        pendingPermissions: [{}],
        labels: { "paseo.parent-agent-id": "root" },
      }),
    ]);

    expect(root?.state).toBe("done");
    expect(root?.aggregateState).toBe("needs_input");
  });

  it("orders permission, failure, explicit attention, working, then done", () => {
    const ordered = orderByAttention([
      agent("done"),
      agent("running", { status: "running" }),
      agent("attention", { requiresAttention: true, attentionReason: "finished" }),
      agent("failed", { status: "error" }),
      agent("permission", { pendingPermissions: [{}] }),
    ]);

    expect(ordered.map(({ agent: item }) => item.id)).toEqual([
      "permission",
      "failed",
      "attention",
      "running",
      "done",
    ]);
  });

  it("gives pending permission precedence over an error", () => {
    expect(agentState(agent("mixed", { status: "error", pendingPermissions: [{}] }))).toBe(
      "needs_input",
    );
  });

  it("keeps orphaned and cyclic agents visible as roots", () => {
    const roots = buildAgentHierarchy([
      agent("orphan", { labels: { "paseo.parent-agent-id": "missing" } }),
      agent("a", { labels: { "paseo.parent-agent-id": "b" } }),
      agent("b", { labels: { "paseo.parent-agent-id": "a" } }),
    ]);
    const ids = new Set<string>();
    const visit = (nodes: typeof roots) => {
      for (const node of nodes) {
        ids.add(node.agent.id);
        visit(node.children);
      }
    };
    visit(roots);
    expect(ids).toEqual(new Set(["orphan", "a", "b"]));
  });
});
