import type { DashboardPaseo } from "./directory-store";

export type PreviewKind = "assistant" | "error" | "tool" | "activity";

export interface TimelinePreview {
  readonly kind: PreviewKind;
  readonly label: string;
  readonly text: string;
}

const PREVIEW_LIMIT = 180;

function subscriptionReady(subscription: () => void): Promise<void> | null {
  if (!("ready" in subscription)) return null;
  return subscription.ready instanceof Promise ? subscription.ready : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function bounded(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > PREVIEW_LIMIT ? `${compact.slice(0, PREVIEW_LIMIT - 1)}…` : compact;
}

export function summarizeTimeline(entries: readonly unknown[]): TimelinePreview | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = record(entries[index]);
    const item = record(entry?.item);
    const type = text(item?.type);
    if (!item || !type) continue;

    if (type === "assistant_message") {
      const message = text(item.text);
      if (message) {
        const systemError = /^\[System Error\]/i.test(message);
        return {
          kind: systemError ? "error" : "assistant",
          label: systemError ? "Error" : "Assistant",
          text: bounded(message),
        };
      }
    }
    if (type === "error") {
      const message = text(item.message);
      if (message) return { kind: "error", label: "Error", text: bounded(message) };
    }
    if (type === "tool_call") {
      const name = text(item.name) ?? "Tool";
      const status = text(item.status) ?? "activity";
      return { kind: "tool", label: "Tool activity", text: bounded(`${name} · ${status}`) };
    }
    if (type === "notification") {
      const message = text(item.message);
      if (message) return { kind: "activity", label: "Activity", text: bounded(message) };
    }
  }
  return null;
}

export interface PreviewSessionSnapshot {
  readonly status: "loading" | "ready" | "error";
  readonly preview: TimelinePreview | null;
  readonly error: string | null;
}

export class PreviewSession {
  private active = false;
  private generation = 0;
  private refreshInFlight = false;
  private queuedGeneration: number | null = null;
  private releaseTimeline: (() => void) | null = null;

  constructor(
    private readonly paseo: DashboardPaseo,
    private readonly agentId: string,
    private readonly live: boolean,
    private readonly publish: (snapshot: PreviewSessionSnapshot) => void,
  ) {}

  start(): () => void {
    this.stop();
    this.active = true;
    const generation = this.generation;
    this.publish({ status: "loading", preview: null, error: null });
    if (this.live) {
      this.releaseTimeline = this.paseo.agents.ref(this.agentId).timeline.subscribe(({ event }) => {
        if (event.type === "timeline" || event.type === "replacement") {
          this.requestRefresh(generation);
        }
      });
      void subscriptionReady(this.releaseTimeline)?.catch((error: unknown) => {
        if (this.active && generation === this.generation) this.publishError(error);
      });
    }
    this.requestRefresh(generation);
    return () => this.stop();
  }

  stop(): void {
    this.active = false;
    this.generation += 1;
    this.queuedGeneration = null;
    this.releaseTimeline?.();
    this.releaseTimeline = null;
  }

  private requestRefresh(generation: number): void {
    if (!this.active || generation !== this.generation) return;
    if (this.refreshInFlight) {
      this.queuedGeneration = generation;
      return;
    }

    this.refreshInFlight = true;
    void this.refresh(generation).finally(() => {
      this.refreshInFlight = false;
      const queuedGeneration = this.queuedGeneration;
      this.queuedGeneration = null;
      if (queuedGeneration === this.generation) this.requestRefresh(queuedGeneration);
    });
  }

  private async refresh(generation: number): Promise<void> {
    try {
      const result = await this.paseo.agents.ref(this.agentId).timeline.refetch({
        direction: "tail",
        limit: 12,
        projection: "projected",
      });
      if (!this.active || generation !== this.generation) return;
      if (result.error) throw new Error(result.error);
      this.publish({ status: "ready", preview: summarizeTimeline(result.entries), error: null });
    } catch (error) {
      if (this.active && generation === this.generation) this.publishError(error);
    }
  }

  private publishError(error: unknown): void {
    this.publish({
      status: "error",
      preview: null,
      error: error instanceof Error ? error.message : "Could not load recent activity",
    });
  }
}
