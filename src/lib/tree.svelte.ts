// Which sidebar nodes are expanded. Survives restarts.

const KEY = "tree";

function load(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export const tree = $state<Record<string, boolean>>(load());

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(tree));
  } catch {}
}

export function toggle(key: string) {
  tree[key] = !tree[key];
  save();
}

export function expand(key: string) {
  if (!tree[key]) {
    tree[key] = true;
    save();
  }
}

export function set(values: Record<string, boolean>) {
  Object.assign(tree, values);
  save();
}
