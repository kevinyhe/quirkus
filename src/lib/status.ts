import type { Assignment, PlannerItem } from "./types";
import { num } from "./format";

/** One status chip for an assignment, in the order a student cares about. */
export function status(a: Assignment): { label: string; cls: string } | null {
  const s = a.submission;
  if (s?.excused) return { label: "Excused", cls: "ok" };
  if (s?.score != null && s.workflow_state === "graded") {
    return { label: a.points_possible ? `${num(s.score)} / ${num(a.points_possible)}` : (s.grade ?? "Graded"), cls: "ok" };
  }
  if (s?.missing) return { label: "Missing", cls: "bad" };
  if (s?.submitted_at) return { label: s.late ? "Submitted late" : "Submitted", cls: s.late ? "warn" : "ok" };
  return null;
}

/** Nothing left to do: submitted, graded (on-paper work is graded without ever being submitted), or excused. */
export function isDone(a: Assignment): boolean {
  const s = a.submission;
  return !!(s?.submitted_at || s?.excused || s?.workflow_state === "graded");
}

/** The same rule for planner items (Home, Due), plus items the student ticked off themselves. */
export function plannerDone(i: PlannerItem): boolean {
  const s = i.submissions || undefined;
  return !!(s?.submitted || s?.graded || s?.excused || i.planner_override?.marked_complete);
}

const TYPES: Record<string, string> = {
  online_upload: "File upload",
  online_text_entry: "Text entry",
  online_url: "Website URL",
  online_quiz: "Quiz",
  discussion_topic: "Discussion post",
  media_recording: "Media recording",
  external_tool: "External tool",
  on_paper: "On paper",
  none: "No submission",
  student_annotation: "Annotation",
};

export function submissionTypes(a: Assignment): string {
  return (a.submission_types ?? []).map((t) => TYPES[t] ?? t).join(", ");
}

export function canSubmitOnline(a: Assignment): boolean {
  return (a.submission_types ?? []).some((t) => !["none", "on_paper", "not_graded"].includes(t));
}
