import { get, watch } from "./api.svelte";
import { COLORS } from "./paths";

type Colors = { custom_colors?: Record<string, string> };

/** The course colors you picked in Quercus, shared by every course marker. */
export const palette = $state<{ custom: Record<string, string> }>({ custom: {} });

const FALLBACK = ["#3a64a8", "#b4532a", "#2f7a6a", "#7b4fb0", "#b03a5b", "#5a7a2a", "#2a6f9a", "#9a7020"];

export function courseColor(id: number | string | undefined): string {
  if (id == null) return "#8a8a85";
  return palette.custom[`course_${id}`] ?? FALLBACK[Number(id) % FALLBACK.length];
}

export function loadColors() {
  watch<Colors>(COLORS, (c) => (palette.custom = c.custom_colors ?? {}));
  get<Colors>(COLORS, 3600)
    .then((c) => (palette.custom = c.custom_colors ?? {}))
    .catch(() => {});
}
