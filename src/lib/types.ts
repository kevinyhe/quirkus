// Only the Canvas fields this app reads. See https://canvas.instructure.com/doc/api/

export interface Enrollment {
  type: string;
  computed_current_score?: number | null;
  computed_current_grade?: string | null;
}

export interface Course {
  id: number;
  name: string;
  course_code: string;
  default_view?: "wiki" | "modules" | "syllabus" | "assignments" | "feed";
  is_favorite?: boolean;
  access_restricted_by_date?: boolean;
  term?: { name: string; end_at?: string | null };
  enrollments?: Enrollment[];
  syllabus_body?: string | null;
  apply_assignment_group_weights?: boolean;
  hide_final_grades?: boolean;
}

export interface Tab {
  id: string;
  label: string;
  type: "internal" | "external";
  html_url: string;
  full_url?: string;
  hidden?: boolean;
  position: number;
}

export interface Submission {
  id?: number;
  score?: number | null;
  grade?: string | null;
  submitted_at?: string | null;
  workflow_state?: string;
  late?: boolean;
  missing?: boolean;
  excused?: boolean | null;
  attempt?: number | null;
  submission_comments?: {
    id: number;
    author_name: string;
    comment: string;
    created_at: string;
  }[];
}

export interface Assignment {
  id: number;
  course_id: number;
  name: string;
  description?: string | null;
  due_at?: string | null;
  lock_at?: string | null;
  unlock_at?: string | null;
  points_possible?: number | null;
  html_url: string;
  submission_types?: string[];
  submission?: Submission;
  omit_from_final_grade?: boolean;
  locked_for_user?: boolean;
  lock_explanation?: string;
  allowed_attempts?: number;
  rubric?: {
    id: string;
    description: string;
    long_description?: string;
    points: number;
    ratings: { id: string; description: string; points: number }[];
  }[];
  assignment_group_id?: number;
}

export interface AssignmentGroup {
  id: number;
  name: string;
  group_weight?: number;
  assignments: Assignment[];
}

export interface PlannerItem {
  course_id?: number;
  context_name?: string;
  plannable_id: number;
  plannable_type: string;
  plannable_date: string;
  plannable: { title: string; points_possible?: number; url?: string };
  html_url: string;
  submissions?: false | { submitted?: boolean; graded?: boolean; missing?: boolean; late?: boolean };
  planner_override?: { marked_complete?: boolean } | null;
  new_activity?: boolean;
}

export interface Topic {
  id: number;
  title: string;
  message?: string | null;
  posted_at?: string | null;
  last_reply_at?: string | null;
  html_url: string;
  author?: { display_name?: string; avatar_image_url?: string };
  user_name?: string;
  context_code?: string;
  read_state?: "read" | "unread";
  is_announcement?: boolean;
  unread_count?: number;
  discussion_subentry_count?: number;
  locked_for_user?: boolean;
  lock_explanation?: string;
  attachments?: { id: number; display_name: string; url: string }[];
}

export interface DiscussionEntry {
  id: number;
  user_id?: number;
  message?: string;
  created_at: string;
  deleted?: boolean;
  replies?: DiscussionEntry[];
}

export interface DiscussionView {
  participants: { id: number; display_name: string }[];
  view: DiscussionEntry[];
}

export interface ModuleItem {
  id: number;
  title: string;
  type: "File" | "Page" | "Discussion" | "Assignment" | "Quiz" | "SubHeader" | "ExternalUrl" | "ExternalTool";
  indent: number;
  html_url?: string;
  content_id?: number;
  page_url?: string;
  external_url?: string;
  content_details?: { due_at?: string | null; points_possible?: number; locked_for_user?: boolean };
  completion_requirement?: { completed?: boolean };
}

export interface Module {
  id: number;
  name: string;
  items?: ModuleItem[];
  items_url: string;
  state?: string;
  unlock_at?: string | null;
}

export interface Folder {
  id: number;
  name: string;
  full_name: string;
  parent_folder_id: number | null;
  files_count: number;
  folders_count: number;
}

export interface FileItem {
  id: number;
  display_name: string;
  filename?: string;
  size: number;
  updated_at: string;
  "content-type"?: string;
  mime_class?: string;
  url?: string;
  preview_url?: string | null;
  folder_id?: number;
  locked_for_user?: boolean;
  lock_explanation?: string;
}

export interface Page {
  page_id: number;
  url: string;
  title: string;
  body?: string | null;
  updated_at: string;
  front_page?: boolean;
  html_url: string;
}

export interface Conversation {
  id: number;
  subject: string;
  workflow_state: "read" | "unread" | "archived";
  last_message: string;
  last_message_at: string;
  context_name?: string;
  participants: { id: number; name: string }[];
  message_count: number;
  messages?: {
    id: number;
    author_id: number;
    body: string;
    created_at: string;
    attachments?: { id: number; display_name: string; url: string }[];
  }[];
}

export interface User {
  id: number;
  name: string;
  short_name?: string;
  avatar_url?: string;
  primary_email?: string;
}

export interface Crumb {
  label: string;
  href?: string;
  /** Icon name (components/Icon.svelte), or a course to show its colored marker. */
  icon?: string;
  course?: { id: number | string; code: string | undefined };
}
