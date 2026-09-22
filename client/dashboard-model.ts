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

export type DashboardState = "needs_input" | "failed" | "working" | "done";

export interface BackgroundAgent {
  readonly agent: DashboardAgent;
  readonly parentTitle: string | null;
  readonly state: DashboardState;
}

export interface InteractiveAgent {
  readonly agent: DashboardAgent;
  readonly state: DashboardState;
  readonly background: readonly BackgroundAgent[];
  readonly counts: Readonly<Record<DashboardState, number>>;
}

export interface DashboardProjection {
  readonly interactive: readonly InteractiveAgent[];
  readonly otherBackground: readonly BackgroundAgent[];
}

export type DashboardRow =
  | { readonly kind: "interactive"; readonly group: InteractiveAgent }
  | { readonly kind: "background"; readonly item: BackgroundAgent; readonly ownerId: string }
  | { readonly kind: "other_header"; readonly count: number }
  | { readonly kind: "other_background"; readonly item: BackgroundAgent };

const PARENT_AGENT_ID_LABEL = "paseo.parent-agent-id";

const EMPTY_COUNTS: Readonly<Record<DashboardState, number>> = {
  needs_input: 0,
  failed: 0,
  working: 0,
  done: 0,
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
  if (agent.status === "running" || agent.status === "initializing") return "working";
  return "done";
}

export function stateLabel(state: DashboardState): string {
  switch (state) {
    case "needs_input":
      return "Needs input";
    case "failed":
      return "Failed";
    case "working":
      return "Working";
    case "done":
      return "Done";
  }
}

export function validTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function compareCreated(left: DashboardAgent, right: DashboardAgent): number {
  const difference = (validTime(left.createdAt) ?? 0) - (validTime(right.createdAt) ?? 0);
  return difference || left.id.localeCompare(right.id);
}

function compareInteractive(left: DashboardAgent, right: DashboardAgent): number {
  const leftTime = validTime(left.lastUserMessageAt) ?? validTime(left.createdAt) ?? 0;
  const rightTime = validTime(right.lastUserMessageAt) ?? validTime(right.createdAt) ?? 0;
  return rightTime - leftTime || left.id.localeCompare(right.id);
}

function compareActivity(left: DashboardAgent, right: DashboardAgent): number {
  const leftTime = validTime(left.updatedAt) ?? validTime(left.createdAt) ?? 0;
  const rightTime = validTime(right.updatedAt) ?? validTime(right.createdAt) ?? 0;
  return rightTime - leftTime || left.id.localeCompare(right.id);
}

function interactiveAncestor(
  agent: DashboardAgent,
  byId: ReadonlyMap<string, DashboardAgent>,
): DashboardAgent | null {
  const seen = new Set([agent.id]);
  let parentId = parentAgentId(agent);
  while (parentId) {
    if (seen.has(parentId)) return null;
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) return null;
    if (!parentAgentId(parent)) return parent;
    parentId = parentAgentId(parent);
  }
  return null;
}

function backgroundItem(
  agent: DashboardAgent,
  byId: ReadonlyMap<string, DashboardAgent>,
): BackgroundAgent {
  const parentId = parentAgentId(agent);
  return {
    agent,
    parentTitle: parentId ? byId.get(parentId)?.title?.trim() || parentId : null,
    state: agentState(agent),
  };
}

export function countStates(
  agents: readonly DashboardAgent[],
): Readonly<Record<DashboardState, number>> {
  const counts = { ...EMPTY_COUNTS };
  for (const agent of agents) counts[agentState(agent)] += 1;
  return counts;
}

export function buildDashboardProjection(
  agents: readonly DashboardAgent[],
): DashboardProjection {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const interactiveAgents = agents.filter((agent) => !parentAgentId(agent));
  const grouped = new Map(interactiveAgents.map((agent) => [agent.id, [] as DashboardAgent[]]));
  const other: DashboardAgent[] = [];

  for (const agent of agents) {
    if (!parentAgentId(agent)) continue;
    const ancestor = interactiveAncestor(agent, byId);
    const group = ancestor ? grouped.get(ancestor.id) : undefined;
    if (group) group.push(agent);
    else other.push(agent);
  }

  const childrenByParent = new Map<string, DashboardAgent[]>();
  for (const agent of agents) {
    const parentId = parentAgentId(agent);
    if (!parentId) continue;
    const children = childrenByParent.get(parentId) ?? [];
    children.push(agent);
    childrenByParent.set(parentId, children);
  }

  const orderedBackground = (root: DashboardAgent, members: readonly DashboardAgent[]) => {
    const memberIds = new Set(members.map(({ id }) => id));
    const ordered: DashboardAgent[] = [];
    const visit = (parentId: string) => {
      for (const child of [...(childrenByParent.get(parentId) ?? [])].sort(compareCreated)) {
        if (!memberIds.has(child.id)) continue;
        ordered.push(child);
        visit(child.id);
      }
    };
    visit(root.id);
    return ordered;
  };

  return {
    interactive: interactiveAgents.sort(compareInteractive).map((agent) => {
      const background = orderedBackground(agent, grouped.get(agent.id) ?? []).map((item) =>
        backgroundItem(item, byId),
      );
      return {
        agent,
        state: agentState(agent),
        background,
        counts: countStates(background.map(({ agent: item }) => item)),
      };
    }),
    otherBackground: other.sort(compareActivity).map((agent) => backgroundItem(agent, byId)),
  };
}

export function visibleDashboardRows(
  projection: DashboardProjection,
  expandedGroups: ReadonlySet<string>,
  otherExpanded: boolean,
): readonly DashboardRow[] {
  const rows: DashboardRow[] = [];
  for (const group of projection.interactive) {
    rows.push({ kind: "interactive", group });
    if (expandedGroups.has(group.agent.id)) {
      rows.push(
        ...group.background.map((item) => ({
          kind: "background" as const,
          item,
          ownerId: group.agent.id,
        })),
      );
    }
  }
  if (projection.otherBackground.length > 0) {
    rows.push({ kind: "other_header", count: projection.otherBackground.length });
    if (otherExpanded) {
      rows.push(
        ...projection.otherBackground.map((item) => ({ kind: "other_background" as const, item })),
      );
    }
  }
  return rows;
}
