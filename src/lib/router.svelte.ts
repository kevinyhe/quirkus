import { ui } from "./ui.svelte";

function current() {
  return decodeURI(location.hash.slice(1)) || "/";
}

export const route = $state({ path: current() });

// Back restores where you were on the previous page; anything else starts at the top.
const stack: string[] = [route.path];
const scroll = new Map<string, number>();

addEventListener("hashchange", () => {
  const main = document.getElementById("main");
  if (main) scroll.set(route.path, main.scrollTop);
  const next = current();
  const back = stack.length > 1 && stack[stack.length - 2] === next;
  if (back) stack.pop();
  else stack.push(next);
  if (stack.length > 200) stack.splice(0, 100);

  route.path = next;
  ui.drawer = false;
  const y = back ? (scroll.get(next) ?? 0) : 0;
  // Two frames: one for Svelte to render the new page from cache, one for layout.
  requestAnimationFrame(() => requestAnimationFrame(() => main?.scrollTo(0, y)));
});

export function go(path: string) {
  location.hash = path;
}
