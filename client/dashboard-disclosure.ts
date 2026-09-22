import type { DashboardProjection } from "./dashboard-model";

export interface DashboardDisclosure {
  readonly expandedGroups: ReadonlySet<string>;
  readonly otherExpanded: boolean;
  readonly previewKeys: ReadonlySet<string>;
}

export const INITIAL_DISCLOSURE: DashboardDisclosure = {
  expandedGroups: new Set(),
  otherExpanded: false,
  previewKeys: new Set(),
};

function retainKeys(current: ReadonlySet<string>, valid: ReadonlySet<string>) {
  const next = new Set([...current].filter((key) => valid.has(key)));
  return next.size === current.size ? current : next;
}

function removeKeysWithPrefix(current: ReadonlySet<string>, prefix: string) {
  const next = new Set([...current].filter((key) => !key.startsWith(prefix)));
  return next.size === current.size ? current : next;
}

export function togglePreview(
  disclosure: DashboardDisclosure,
  key: string,
): DashboardDisclosure {
  const previewKeys = new Set(disclosure.previewKeys);
  if (previewKeys.has(key)) previewKeys.delete(key);
  else previewKeys.add(key);
  return { ...disclosure, previewKeys };
}

export function toggleGroup(
  disclosure: DashboardDisclosure,
  groupId: string,
): DashboardDisclosure {
  const expandedGroups = new Set(disclosure.expandedGroups);
  const closing = expandedGroups.delete(groupId);
  if (!closing) expandedGroups.add(groupId);
  return {
    ...disclosure,
    expandedGroups,
    previewKeys: closing
      ? removeKeysWithPrefix(disclosure.previewKeys, `background:${groupId}:`)
      : disclosure.previewKeys,
  };
}

export function toggleOther(disclosure: DashboardDisclosure): DashboardDisclosure {
  return {
    ...disclosure,
    otherExpanded: !disclosure.otherExpanded,
    previewKeys: disclosure.otherExpanded
      ? removeKeysWithPrefix(disclosure.previewKeys, "other:")
      : disclosure.previewKeys,
  };
}

export function reconcileDisclosure(
  disclosure: DashboardDisclosure,
  projection: DashboardProjection,
): DashboardDisclosure {
  const validGroups = new Set(
    projection.interactive
      .filter(({ background }) => background.length > 0)
      .map(({ agent }) => agent.id),
  );
  const validPreviewKeys = new Set([
    ...projection.interactive.map(({ agent }) => `interactive:${agent.id}`),
    ...projection.interactive.flatMap(({ agent, background }) =>
      background.map(({ agent: item }) => `background:${agent.id}:${item.id}`),
    ),
    ...projection.otherBackground.map(({ agent }) => `other:${agent.id}`),
  ]);
  const expandedGroups = retainKeys(disclosure.expandedGroups, validGroups);
  const previewKeys = retainKeys(disclosure.previewKeys, validPreviewKeys);
  const otherExpanded = disclosure.otherExpanded && projection.otherBackground.length > 0;
  return expandedGroups === disclosure.expandedGroups &&
    previewKeys === disclosure.previewKeys &&
    otherExpanded === disclosure.otherExpanded
    ? disclosure
    : { expandedGroups, previewKeys, otherExpanded };
}
