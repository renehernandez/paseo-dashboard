import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { expect, it, vi } from "vitest";
import type { DashboardAgent } from "./dashboard-model";

type TestElement = {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
};
type EffectSlot = { deps?: readonly unknown[]; cleanup?: () => void };
type StateSlot = { value: unknown };

const test = vi.hoisted(() => ({
  snapshot: { status: "ready", agents: [] as DashboardAgent[], error: null },
  refetch: vi.fn(async () => ({ entries: [], error: null })),
  subscribe: vi.fn(() => vi.fn()),
  agentRefs: [] as string[],
  openAgent: vi.fn(),
  cursor: 0,
  slots: [] as (EffectSlot | StateSlot | undefined)[],
}));

vi.mock("react", () => ({
  useState(initial: unknown) {
    const index = test.cursor++;
    const previous = test.slots[index] as StateSlot | undefined;
    const state = previous ?? {
      value: typeof initial === "function" ? (initial as () => unknown)() : initial,
    };
    test.slots[index] = state;
    return [
      state.value,
      (next: unknown) => {
        state.value =
          typeof next === "function"
            ? (next as (value: unknown) => unknown)(state.value)
            : next;
      },
    ];
  },
  useMemo(factory: () => unknown) {
    test.cursor++;
    return factory();
  },
  useEffect(effect: () => void | (() => void), deps?: readonly unknown[]) {
    const index = test.cursor++;
    const previous = test.slots[index] as EffectSlot | undefined;
    const unchanged =
      previous?.deps && deps && !deps.some((value, item) => value !== previous.deps?.[item]);
    if (unchanged) return;
    previous?.cleanup?.();
    const cleanup = effect();
    test.slots[index] = { deps, cleanup: cleanup || undefined };
  },
  useSyncExternalStore() {
    test.cursor++;
    return test.snapshot;
  },
}));

vi.mock("react-native", () => ({
  FlatList: "FlatList",
  Pressable: "Pressable",
  Text: "Text",
  View: "View",
}));
vi.mock("@getpaseo/plugin/client", () => ({
  usePaseo: () => ({
    agents: {
      ref: (agentId: string) => {
        test.agentRefs.push(agentId);
        return { timeline: { refetch: test.refetch, subscribe: test.subscribe } };
      },
    },
  }),
  useWorkspace: () => ({ name: "Fixture" }),
}));
vi.mock("./directory-store", () => ({
  DirectoryStore: class {
    subscribe = () => () => undefined;
    getSnapshot = () => test.snapshot;
    start = () => () => undefined;
    reload = () => undefined;
  },
}));

import { DashboardPanel } from "./dashboard-panel";

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

function element(value: unknown): TestElement {
  if (!value || typeof value !== "object" || !("props" in value)) {
    throw new Error("Expected element");
  }
  return value as TestElement;
}

function expand(value: unknown): TestElement[] {
  if (Array.isArray(value)) return value.flatMap(expand);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = element(value);
  return typeof node.type === "function"
    ? expand(node.type(node.props))
    : [node, ...expand(node.props.children)];
}

function renderPanel(): TestElement[] {
  test.cursor = 0;
  const panel = element(
    DashboardPanel({
      workspaceId: "workspace",
      layout: { compact: true },
      navigation: { openAgent: test.openAgent },
      theme: {
        colors: {
          surface0: "#000",
          surface1: "#111",
          surface2: "#222",
          border: "#333",
          foreground: "#fff",
          foregroundMuted: "#aaa",
          accent: "#09f",
          accentForeground: "#fff",
          statusDanger: "#f00",
          statusWarning: "#fc0",
          statusSuccess: "#0c0",
        },
      },
    } as unknown as PluginWorkspacePanelProps),
  );
  const renderItem = panel.props.renderItem as (value: { item: unknown }) => unknown;
  const nodes = [
    panel,
    ...(panel.props.data as readonly unknown[]).flatMap((item) => expand(renderItem({ item }))),
  ];
  for (let index = test.cursor; index < test.slots.length; index++) {
    (test.slots[index] as EffectSlot | undefined)?.cleanup?.();
    test.slots[index] = undefined;
  }
  return nodes;
}

function button(nodes: TestElement[], label: string): TestElement {
  const result = nodes.find((node) => node.props.accessibilityLabel === label);
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
}

function unmountPanel(): void {
  for (const slot of test.slots) (slot as EffectSlot | undefined)?.cleanup?.();
  test.slots = [];
}

it("loads only disclosed rows, releases on collapse, preserves routing and exposes counts", async () => {
  test.cursor = 0;
  test.slots = [];
  test.refetch.mockClear();
  test.subscribe.mockClear();
  test.agentRefs = [];
  test.openAgent.mockClear();
  test.snapshot.agents = [
    agent("root", { title: "Primary" }),
    agent("permission", {
      title: "Permission child",
      status: "running",
      updatedAt: "invalid",
      pendingPermissions: [{}],
      labels: { "paseo.parent-agent-id": "root" },
    }),
    agent("failed", {
      status: "error",
      labels: { "paseo.parent-agent-id": "root" },
    }),
  ];

  const summary = "2 background agents · 1 needs input · 1 failed";
  let nodes = renderPanel();
  let group = button(nodes, `Show background agents for Primary. ${summary}`);
  expect(group.props.accessibilityState).toEqual({ expanded: false });
  expect(test.refetch).not.toHaveBeenCalled();

  (group.props.onPress as () => void)();
  nodes = renderPanel();
  expect(test.refetch).not.toHaveBeenCalled();
  expect(
    nodes.some((node) => (JSON.stringify(node.props.children) ?? "").includes("Created ")),
  ).toBe(true);

  (button(nodes, "Open Permission child").props.onPress as () => void)();
  expect(test.openAgent).toHaveBeenCalledWith({ agentId: "permission" });

  (button(nodes, "Show recent activity for Permission child").props.onPress as () => void)();
  nodes = renderPanel();
  await Promise.resolve();
  expect([...new Set(test.agentRefs)]).toEqual(["permission"]);
  expect(test.refetch).toHaveBeenCalledTimes(1);
  expect(test.subscribe).toHaveBeenCalledTimes(1);
  const release = test.subscribe.mock.results[0]?.value;

  group = button(nodes, `Hide background agents for Primary. ${summary}`);
  (group.props.onPress as () => void)();
  renderPanel();
  expect(release).toHaveBeenCalledOnce();

  nodes = renderPanel();
  (button(nodes, `Show background agents for Primary. ${summary}`).props.onPress as () => void)();
  renderPanel();
  expect(test.refetch).toHaveBeenCalledTimes(1);
  unmountPanel();
});
