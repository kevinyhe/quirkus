import type { Course } from "./types";

// Shared paths. Screens that show the same data must use the exact same path so they share one cache entry.

export const SELF = "/api/v1/users/self";
export const COLORS = "/api/v1/users/self/colors";
export const UNREAD = "/api/v1/conversations/unread_count";
export const INBOX = "/api/v1/conversations?scope=inbox";
export const COURSES =
  "/api/v1/courses?enrollment_state=active&include[]=term&include[]=total_scores&include[]=favorites";

export const course = (c: string | number) =>
  `/api/v1/courses/${c}?include[]=term&include[]=total_scores`;
export const tabs = (c: string | number) => `/api/v1/courses/${c}/tabs`;
export const groups = (c: string | number) =>
  `/api/v1/courses/${c}/assignment_groups?include[]=assignments&include[]=submission&exclude_response_fields[]=description&exclude_response_fields[]=rubric`;
export const assignment = (c: string | number, a: string | number) =>
  `/api/v1/courses/${c}/assignments/${a}?include[]=submission`;
export const mySubmission = (c: string | number, a: string | number) =>
  `/api/v1/courses/${c}/assignments/${a}/submissions/self?include[]=submission_comments&include[]=rubric_assessment`;
export const announcements = (c: string | number) =>
  `/api/v1/courses/${c}/discussion_topics?only_announcements=true`;
export const discussions = (c: string | number) => `/api/v1/courses/${c}/discussion_topics`;
export const topic = (c: string | number, t: string | number) => `/api/v1/courses/${c}/discussion_topics/${t}`;
export const topicView = (c: string | number, t: string | number) =>
  `/api/v1/courses/${c}/discussion_topics/${t}/view`;
export const modules = (c: string | number) =>
  `/api/v1/courses/${c}/modules?include[]=items&include[]=content_details`;
export const pages = (c: string | number) => `/api/v1/courses/${c}/pages?sort=title`;
export const page = (c: string | number, slug: string) =>
  `/api/v1/courses/${c}/pages/${encodeURIComponent(slug)}`;
export const frontPage = (c: string | number) => `/api/v1/courses/${c}/front_page`;
export const syllabus = (c: string | number) => `/api/v1/courses/${c}?include[]=syllabus_body`;
export const rootFolder = (c: string | number) => `/api/v1/courses/${c}/folders/root`;
/** Course-scoped when we know the course: it works even when the course hides its Files tab. */
export const fileMeta = (id: string | number, c?: string | number) =>
  c ? `/api/v1/courses/${c}/files/${id}` : `/api/v1/files/${id}`;
export const planner = (start: string, end: string) =>
  `/api/v1/planner/items?start_date=${start}&end_date=${end}`;

/** Courses to show in the sidebar and dashboard: accessible, current, and starred (Canvas treats all as starred until you pick). */
export function visible(list: Course[] | undefined): Course[] {
  if (!list) return [];
  const now = Date.now();
  const ok = list.filter(
    (c) => c.name && !c.access_restricted_by_date && (!c.term?.end_at || new Date(c.term.end_at).getTime() > now - 14 * 86400000),
  );
  const fav = ok.filter((c) => c.is_favorite);
  return (fav.length ? fav : ok).sort((a, b) => a.course_code.localeCompare(b.course_code));
}

/** "CSC263H1 F LEC0101 20259:Data Structures" → "CSC263H1" */
export function shortCode(c: Pick<Course, "course_code"> | undefined): string {
  if (!c) return "";
  return c.course_code.split(/[\s:]/)[0];
}
