import type { usePaseo } from "@getpaseo/plugin/client";
import type { DashboardAgent } from "./dashboard-model";

export type DashboardPaseo = ReturnType<typeof usePaseo>;

export type DirectoryStatus = "loading" | "ready" | "error";
type AgentUpdate = Parameters<Parameters<DashboardPaseo["agents"]["subscribe"]>[0]>[0];

export interface DirectorySnapshot {
  readonly status: DirectoryStatus;
  readonly agents: readonly DashboardAgent[];
  readonly error: string | null;
}

const INITIAL_SNAPSHOT: DirectorySnapshot = { status: "loading", agents: [], error: null };

export function createDirectoryStore(paseo: DashboardPaseo, workspaceId: string) {
  let snapshot: DirectorySnapshot = INITIAL_SNAPSHOT;
  const listeners = new Set<() => void>();
  let stopCurrent: (() => void) | null = null;

  const getSnapshot = (): DirectorySnapshot => snapshot;

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const publish = (nextSnapshot: DirectorySnapshot): void => {
    snapshot = nextSnapshot;
    for (const listener of listeners) listener();
  };

  const apply = (update: AgentUpdate): void => {
    const byId = new Map(snapshot.agents.map((agent) => [agent.id, agent]));
    if (update.kind === "remove") {
      byId.delete(update.agentId);
    } else if (update.agent.workspaceId === workspaceId) {
      byId.set(update.agent.id, update.agent);
    } else {
      byId.delete(update.agent.id);
    }
    publish({ status: "ready", agents: [...byId.values()], error: null });
  };

  const load = async (): Promise<DashboardAgent[]> => {
    const agents: DashboardAgent[] = [];
    let cursor: string | undefined;
    let first = true;
    do {
      const result = await paseo.agents.list({
        scope: "active",
        page: { limit: 200, ...(cursor ? { cursor } : {}) },
        ...(first ? { subscribe: {} } : {}),
      });
      for (const { agent } of result.entries) {
        if (agent.workspaceId === workspaceId) agents.push(agent);
      }
      cursor = result.pageInfo.nextCursor ?? undefined;
      first = false;
    } while (cursor);
    return agents;
  };

  const stop = (): void => {
    stopCurrent?.();
  };

  const start = (): (() => void) => {
    stop();
    let active = true;
    const pending: AgentUpdate[] = [];
    let loading = true;

    publish({ status: "loading", agents: snapshot.agents, error: null });
    const unsubscribe = paseo.agents.subscribe((update) => {
      if (!active) return;
      if (loading) {
        pending.push(update);
        return;
      }
      apply(update);
    });

    void load()
      .then((agents) => {
        if (!active) return;
        publish({ status: "ready", agents, error: null });
        loading = false;
        for (const update of pending) apply(update);
      })
      .catch((error: unknown) => {
        if (!active) return;
        loading = false;
        publish({
          status: "error",
          agents: snapshot.agents,
          error: error instanceof Error ? error.message : "Could not load the agent directory",
        });
      });

    const stopSubscription = () => {
      if (!active) return;
      active = false;
      unsubscribe();
      if (stopCurrent === stopSubscription) stopCurrent = null;
    };
    stopCurrent = stopSubscription;
    return stop;
  };

  const reload = (): void => {
    start();
  };

  return { getSnapshot, subscribe, start, reload, stop };
}
