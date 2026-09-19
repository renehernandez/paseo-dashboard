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

export class DirectoryStore {
  private snapshot: DirectorySnapshot = INITIAL_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private stopCurrent: (() => void) | null = null;

  constructor(
    private readonly paseo: DashboardPaseo,
    private readonly workspaceId: string,
  ) {}

  readonly getSnapshot = (): DirectorySnapshot => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(): () => void {
    this.stopCurrent?.();
    let active = true;
    const pending: AgentUpdate[] = [];
    let loading = true;

    this.publish({ status: "loading", agents: this.snapshot.agents, error: null });
    const unsubscribe = this.paseo.agents.subscribe((update) => {
      if (!active) return;
      if (loading) {
        pending.push(update);
        return;
      }
      this.apply(update);
    });

    void this.load()
      .then((agents) => {
        if (!active) return;
        this.publish({ status: "ready", agents, error: null });
        loading = false;
        for (const update of pending) this.apply(update);
      })
      .catch((error: unknown) => {
        if (!active) return;
        loading = false;
        this.publish({
          status: "error",
          agents: this.snapshot.agents,
          error: error instanceof Error ? error.message : "Could not load the agent directory",
        });
      });

    const stop = () => {
      if (!active) return;
      active = false;
      unsubscribe();
      if (this.stopCurrent === stop) this.stopCurrent = null;
    };
    this.stopCurrent = stop;
    return () => this.stop();
  }

  reload(): void {
    this.start();
  }

  stop(): void {
    this.stopCurrent?.();
  }

  private async load(): Promise<DashboardAgent[]> {
    const agents: DashboardAgent[] = [];
    let cursor: string | undefined;
    let first = true;
    do {
      const result = await this.paseo.agents.list({
        scope: "active",
        page: { limit: 200, ...(cursor ? { cursor } : {}) },
        ...(first ? { subscribe: {} } : {}),
      });
      for (const { agent } of result.entries) {
        if (agent.workspaceId === this.workspaceId) agents.push(agent);
      }
      cursor = result.pageInfo.nextCursor ?? undefined;
      first = false;
    } while (cursor);
    return agents;
  }

  private apply(update: AgentUpdate): void {
    const byId = new Map(this.snapshot.agents.map((agent) => [agent.id, agent]));
    if (update.kind === "remove") {
      byId.delete(update.agentId);
    } else if (update.agent.workspaceId === this.workspaceId) {
      byId.set(update.agent.id, update.agent);
    } else {
      byId.delete(update.agent.id);
    }
    this.publish({ status: "ready", agents: [...byId.values()], error: null });
  }

  private publish(snapshot: DirectorySnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}
