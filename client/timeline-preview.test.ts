import { describe, expect, it, vi } from "vitest";
import type { DashboardPaseo } from "./directory-store";
import { PreviewSession, summarizeTimeline } from "./timeline-preview";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("timeline previews", () => {
  it("summarizes assistant, error, permission, and tool activity", () => {
    expect(summarizeTimeline([{ item: { type: "assistant_message", text: "  Ready to ship  " } }])).toEqual({
      kind: "assistant",
      label: "Assistant",
      text: "Ready to ship",
    });
    expect(summarizeTimeline([{ item: { type: "error", message: "Build failed" } }])?.kind).toBe(
      "error",
    );
    expect(
      summarizeTimeline([{ item: { type: "assistant_message", text: "[System Error] unavailable" } }]),
    ).toMatchObject({ kind: "error", label: "Error" });
    expect(
      summarizeTimeline([{ item: { type: "permission_request", message: "Allow command?" } }]),
    ).toMatchObject({ kind: "permission", text: "Allow command?" });
    expect(
      summarizeTimeline([{ item: { type: "tool_call", name: "Read", status: "running" } }]),
    ).toEqual({ kind: "tool", label: "Tool activity", text: "Read · running" });
  });

  it("bounds preview text", () => {
    const preview = summarizeTimeline([
      { item: { type: "assistant_message", text: "x".repeat(300) } },
    ]);
    expect(preview?.text).toHaveLength(180);
    expect(preview?.text.endsWith("…")).toBe(true);
  });

  it("releases live observation and ignores a replacement fetch after teardown", async () => {
    const first = deferred<unknown>();
    const replacement = deferred<unknown>();
    const release = vi.fn();
    let onTimeline: (() => void) | undefined;
    const refetch = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(replacement.promise);
    const paseo = {
      agents: {
        ref: () => ({
          timeline: {
            refetch,
            subscribe: (handler: () => void) => {
              onTimeline = handler;
              return release;
            },
          },
        }),
      },
    } as unknown as DashboardPaseo;
    const publish = vi.fn();
    const session = new PreviewSession(paseo, "agent", true, publish);
    const stop = session.start();

    first.resolve({ entries: [], error: null });
    await first.promise;
    await Promise.resolve();
    onTimeline?.();
    stop();
    replacement.resolve({
      entries: [{ item: { type: "assistant_message", text: "stale" } }],
      error: null,
    });
    await replacement.promise;
    await Promise.resolve();

    expect(release).toHaveBeenCalledOnce();
    expect(publish).not.toHaveBeenCalledWith(
      expect.objectContaining({ preview: expect.objectContaining({ text: "stale" }) }),
    );
  });
});
