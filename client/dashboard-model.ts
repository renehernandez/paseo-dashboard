export type AgentStatus = "initializing" | "idle" | "running" | "error" | "closed";

export interface DashboardAgent {
  readonly id: string;
  readonly workspaceId?: string;
  readonly provider: string;
  readonly model: string | null;
  readonly title: string | null;
  readonly status: AgentStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastUserMessageAt: string | null;
  readonly pendingPermissions: readonly unknown[];
  readonly requiresAttention?: boolean;
  readonly attentionReason?: "finished" | "error" | "permission" | null;
  readonly lastError?: string;
  readonly labels: Readonly<Record<string, string>>;
}

export type DashboardState = "needs_input" | "failed" | "attention" | "working" | "done";

export interface AgentNode {
  readonly agent: DashboardAgent;
  readonly parentAgentId: string | null;
  readonly children: readonly AgentNode[];
  readonly state: DashboardState;
  readonly aggregateState: DashboardState;
}

const PARENT_AGENT_ID_LABEL = "paseo.parent-agent-id";

const STATE_PRIORITY: Readonly<Record<DashboardState, number>> = {
  needs_input: 0,
  failed: 1,
  attention: 2,
  working: 3,
  done: 4,
};

export function parentAgentId(agent: DashboardAgent): string | null {
  const value = agent.labels[PARENT_AGENT_ID_LABEL]?.trim();
  return value ? value : null;
}

export function agentState(agent: DashboardAgent): DashboardState {
  if (agent.pendingPermissions.length > 0 || agent.attentionReason === "permission") {
    return "needs_input";
  }
  if (agent.status === "error" || agent.lastError || agent.attentionReason === "error") {
    return "failed";
  }
  if (agent.requiresAttention) return "attention";
  if (agent.status === "running" || agent.status === "initializing") return "working";
  return "done";
}

export function stateLabel(state: DashboardState): string {
  switch (state) {
    case "needs_input":
      return "Needs input";
    case "failed":
      return "Failed";
    case "attention":
      return "Attention";
    case "working":
      return "Working";
    case "done":
      return "Done";
  }
}

function compareCreated(left: DashboardAgent, right: DashboardAgent): number {
  const created = left.createdAt.localeCompare(right.createdAt);
  return created || left.id.localeCompare(right.id);
}

export function buildAgentHierarchy(agents: readonly DashboardAgent[]): readonly AgentNode[] {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const childrenByParent = new Map<string, DashboardAgent[]>();
  const roots: DashboardAgent[] = [];

  for (const agent of agents) {
    const parentId = parentAgentId(agent);
    if (!parentId || parentId === agent.id || !byId.has(parentId)) {
      roots.push(agent);
      continue;
    }
    const children = childrenByParent.get(parentId) ?? [];
    children.push(agent);
    childrenByParent.set(parentId, children);
  }

  const visited = new Set<string>();
  const makeNode = (agent: DashboardAgent, ancestors: ReadonlySet<string>): AgentNode => {
    visited.add(agent.id);
    const nextAncestors = new Set(ancestors).add(agent.id);
    const children = (childrenByParent.get(agent.id) ?? [])
      .filter((child) => !nextAncestors.has(child.id))
      .sort(compareCreated)
      .map((child) => makeNode(child, nextAncestors));
    const state = agentState(agent);
    const aggregateState = children.reduce(
      (current, child) =>
        STATE_PRIORITY[child.aggregateState] < STATE_PRIORITY[current]
          ? child.aggregateState
          : current,
      state,
    );
    return { agent, parentAgentId: parentAgentId(agent), children, state, aggregateState };
  };

  const result = roots.sort(compareCreated).map((agent) => makeNode(agent, new Set()));
  for (const agent of [...agents].sort(compareCreated)) {
    if (!visited.has(agent.id)) result.push(makeNode(agent, new Set()));
  }
  return result;
}

export interface AttentionItem {
  readonly agent: DashboardAgent;
  readonly state: DashboardState;
}

export function orderByAttention(agents: readonly DashboardAgent[]): readonly AttentionItem[] {
  return agents
    .map((agent) => ({ agent, state: agentState(agent) }))
    .sort(
      (left, right) =>
        STATE_PRIORITY[left.state] - STATE_PRIORITY[right.state] ||
        compareCreated(left.agent, right.agent),
    );
}

export function countStates(agents: readonly DashboardAgent[]): Readonly<Record<DashboardState, number>> {
  const counts: Record<DashboardState, number> = {
    needs_input: 0,
    failed: 0,
    attention: 0,
    working: 0,
    done: 0,
  };
  for (const agent of agents) counts[agentState(agent)] += 1;
  return counts;
}
