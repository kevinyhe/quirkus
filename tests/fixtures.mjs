// Canvas-shaped responses for the UI test. Field names follow https://canvas.instructure.com/doc/api/
// Dates are relative to now so "due soon", "overdue" etc. always exercise the same paths.

const H = 3600_000, D = 24 * H;
const at = (days, hour = 23, min = 59) => {
  const d = new Date(Date.now() + days * D);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
};

const course = (id, code, name, extra = {}) => ({
  id,
  name,
  course_code: code,
  default_view: "modules",
  is_favorite: true,
  term: { name: "2025 Fall", end_at: at(60) },
  enrollments: [{ type: "student", computed_current_score: 84.6, computed_current_grade: "A-" }],
  apply_assignment_group_weights: true,
  ...extra,
});

export const COURSES = [
  course(101, "CSC263H1 F LEC0101", "Data Structures and Analysis"),
  course(202, "MAT237Y1 Y LEC0201", "Multivariable Calculus with Proofs", { default_view: "wiki", enrollments: [{ type: "student", computed_current_score: 71.25 }] }),
  course(303, "PHL245H1 F LEC5101", "Modern Symbolic Logic", { default_view: "syllabus", apply_assignment_group_weights: false }),
];

const tabs = (c, extra = []) =>
  [
    ["home", "Home"], ["announcements", "Announcements"], ["modules", "Modules"], ["assignments", "Assignments"],
    ["discussions", "Discussions"], ["grades", "Grades"], ["files", "Files"], ["pages", "Pages"], ["syllabus", "Syllabus"],
    ["quizzes", "Quizzes"], ["people", "People"], ...extra,
  ].map(([id, label], i) => ({
    id, label, position: i + 1, type: "internal",
    html_url: `/courses/${c}/${id === "home" ? "" : id}`, full_url: `https://q.utoronto.ca/courses/${c}/${id}`,
  }));

const sub = (s) => ({ workflow_state: "unsubmitted", submitted_at: null, score: null, grade: null, late: false, missing: false, excused: false, attempt: null, ...s });

const A = (id, c, name, due, points, submission, extra = {}) => ({
  id, course_id: c, name, due_at: due, points_possible: points, html_url: `https://q.utoronto.ca/courses/${c}/assignments/${id}`,
  submission_types: ["online_upload"], submission: sub(submission), allowed_attempts: -1, ...extra,
});

const groups = {
  101: [
    { id: 1, name: "Problem Sets", group_weight: 40, assignments: [
      A(3001, 101, "Problem Set 3: Heaps and Priority Queues", at(2), 20, {}),
      A(3002, 101, "Problem Set 2: Asymptotic Analysis", at(-12), 20, { workflow_state: "graded", submitted_at: at(-13), score: 17.5, grade: "17.5" }),
      A(3003, 101, "Problem Set 1: Induction Review", at(-26), 20, { workflow_state: "graded", submitted_at: at(-25), score: 19, grade: "19", late: true }),
      A(3004, 101, "Problem Set 4: Hashing", at(16), 20, {}),
    ]},
    { id: 2, name: "Term Tests", group_weight: 30, assignments: [
      A(3101, 101, "Term Test 1", at(-8, 18, 0), 50, { workflow_state: "graded", score: 41, grade: "41" }, { submission_types: ["on_paper"] }),
      A(3102, 101, "Term Test 2", at(24, 18, 0), 50, {}, { submission_types: ["on_paper"] }),
    ]},
    { id: 3, name: "Final Exam", group_weight: 30, assignments: [
      A(3201, 101, "Final Exam", null, 100, {}, { submission_types: ["none"] }),
    ]},
  ],
  202: [
    { id: 4, name: "Weekly Quizzes", group_weight: 20, assignments: [
      A(3301, 202, "Quiz 4: Partial Derivatives", at(0, 17, 0), 10, {}, { submission_types: ["online_quiz"] }),
      A(3302, 202, "Quiz 3: Limits and Continuity", at(-3), 10, { missing: true }),
    ]},
    { id: 5, name: "Problem Sets", group_weight: 80, assignments: [
      A(3303, 202, "PS5 — Implicit Function Theorem", at(5), 30, { workflow_state: "submitted", submitted_at: at(-1) }),
    ]},
  ],
  303: [{ id: 6, name: "Exercises", group_weight: 0, assignments: [A(3401, 303, "Exercise Set 2 (natural deduction)", at(1, 9, 0), 10, {})] }],
};

const RUBRIC = [
  { id: "r1", description: "Correctness", long_description: "Each algorithm is correct and handles edge cases.", points: 10,
    ratings: [{ id: "a", description: "Full", points: 10 }, { id: "b", description: "Partial", points: 5 }, { id: "c", description: "None", points: 0 }] },
  { id: "r2", description: "Runtime analysis", points: 10,
    ratings: [{ id: "d", description: "Tight bound, justified", points: 10 }, { id: "e", description: "Bound stated", points: 6 }, { id: "f", description: "Missing", points: 0 }] },
];

const DESCRIPTION = `
<p>Submit a single PDF typeset in LaTeX. Handwritten work is not accepted.</p>
<h3>Questions</h3>
<ol><li>Prove that <code>BUILD-HEAP</code> runs in <em>O(n)</em> time.</li><li>Give an algorithm for <strong>k-way merge</strong> using a min-heap.</li></ol>
<p>Starter files: <a href="https://q.utoronto.ca/courses/101/files/5003/download?wrap=1">ps3_starter.py</a> · Style guide: <a href="https://q.utoronto.ca/courses/101/pages/course-policies">Course policies</a> · External: <a href="https://en.wikipedia.org/wiki/Binary_heap">Binary heap</a></p>
<table><tr><th>Part</th><th>Marks</th></tr><tr><td>Q1</td><td>8</td></tr><tr><td>Q2</td><td>12</td></tr></table>
<img src="/courses/101/files/5002/preview" alt="heap diagram" width="400">
<script>alert("xss")</script><p style="color:red" onclick="alert(1)">Styled paragraph with a handler.</p>`;

const plannerItem = (a, type = "assignment", extra = {}) => ({
  course_id: a.course_id, context_name: COURSES.find((c) => c.id === a.course_id).name, plannable_id: a.id, plannable_type: type,
  plannable_date: a.due_at, plannable: { title: a.name, points_possible: a.points_possible },
  html_url: `/courses/${a.course_id}/assignments/${a.id}`,
  submissions: { submitted: !!a.submission.submitted_at, graded: a.submission.workflow_state === "graded", missing: !!a.submission.missing, late: !!a.submission.late },
  planner_override: null, ...extra,
});

const allAssignments = Object.values(groups).flat().flatMap((g) => g.assignments).filter((a) => a.due_at);

const PLANNER = [
  ...allAssignments.map((a) => plannerItem(a)),
  { course_id: 101, plannable_id: 7101, plannable_type: "discussion_topic", plannable_date: at(3, 12, 0), plannable: { title: "Tutorial 4 discussion" }, html_url: "/courses/101/discussion_topics/7101", submissions: false, planner_override: null },
].sort((a, b) => a.plannable_date.localeCompare(b.plannable_date));

const topic = (id, c, title, message, extra = {}) => ({
  id, title, message, posted_at: at(-2, 10, 15), last_reply_at: at(-1, 9, 0), html_url: `https://q.utoronto.ca/courses/${c}/discussion_topics/${id}`,
  author: { display_name: "Prof. Faith Ellen" }, context_code: `course_${c}`, read_state: "read", unread_count: 0,
  discussion_subentry_count: 0, ...extra,
});

const ANN = {
  101: [
    topic(7001, 101, "Term Test 2 location and coverage", "<p>Term Test 2 will be held in <strong>EX 100</strong>. It covers weeks 5–9: heaps, hashing, and amortized analysis.</p>", { is_announcement: true, read_state: "unread" }),
    topic(7002, 101, "Office hours moved this week", "<p>Thursday office hours move to BA 2270 from 3–5pm.</p>", { is_announcement: true, posted_at: at(-9) }),
  ],
  202: [topic(7003, 202, "PS5 clarification", "<p>For question 3 you may assume <em>f</em> is C<sup>1</sup>.</p>", { is_announcement: true, author: { display_name: "Jordan Bell" } })],
  303: [],
};

const DISC = {
  101: [topic(7101, 101, "Tutorial 4 discussion", "<p>Post your solution sketch for the heap-sort stability question.</p>", { discussion_subentry_count: 3, unread_count: 1, read_state: "unread" })],
  202: [], 303: [],
};

const MODULES = {
  101: [
    { id: 401, name: "Week 1 — Introduction", items_url: "https://q.utoronto.ca/api/v1/courses/101/modules/401/items", state: "completed", items: [
      { id: 1, title: "Lecture notes", type: "SubHeader", indent: 0 },
      { id: 2, title: "Lecture 1 slides.pdf", type: "File", indent: 1, content_id: 5001, html_url: "https://q.utoronto.ca/courses/101/modules/items/2", completion_requirement: { completed: true } },
      { id: 3, title: "Course policies", type: "Page", indent: 1, page_url: "course-policies", html_url: "https://q.utoronto.ca/courses/101/modules/items/3" },
      { id: 4, title: "Problem Set 1: Induction Review", type: "Assignment", indent: 0, content_id: 3003, content_details: { due_at: at(-26), points_possible: 20 } },
    ]},
    { id: 402, name: "Week 5 — Heaps", items_url: "https://q.utoronto.ca/api/v1/courses/101/modules/402/items", items: [
      { id: 5, title: "Heap diagram.png", type: "File", indent: 0, content_id: 5002 },
      { id: 6, title: "ps3_starter.py", type: "File", indent: 0, content_id: 5003 },
      { id: 7, title: "Problem Set 3: Heaps and Priority Queues", type: "Assignment", indent: 0, content_id: 3001, content_details: { due_at: at(2), points_possible: 20 } },
      { id: 8, title: "Tutorial 4 discussion", type: "Discussion", indent: 0, content_id: 7101 },
      { id: 9, title: "Week 5 quiz", type: "Quiz", indent: 0, content_id: 88, html_url: "https://q.utoronto.ca/courses/101/quizzes/88" },
      { id: 10, title: "Visualgo: heaps", type: "ExternalUrl", indent: 1, external_url: "https://visualgo.net/en/heap" },
      { id: 11, title: "Crowdmark", type: "ExternalTool", indent: 0, html_url: "https://q.utoronto.ca/courses/101/modules/items/11" },
      { id: 12, title: "Extra reading (Word)", type: "File", indent: 0, content_id: 5004 },
    ]},
    // Large module: Canvas omits `items`, the UI must fetch items_url.
    { id: 403, name: "Past exams (large module)", items_url: "https://q.utoronto.ca/api/v1/courses/101/modules/403/items" },
  ],
  202: [{ id: 404, name: "Chapter 1", items_url: "https://q.utoronto.ca/api/v1/courses/202/modules/404/items", items: [{ id: 20, title: "Notes 1.1", type: "Page", indent: 0, page_url: "notes-1-1" }] }],
  303: [],
};

const FILES = {
  5001: { id: 5001, display_name: "Lecture 1 slides.pdf", filename: "lec1.pdf", size: 1843, "content-type": "application/pdf", updated_at: at(-30), url: "https://q.utoronto.ca/files/5001/download?download_frd=1&verifier=x", folder_id: 6001 },
  5002: { id: 5002, display_name: "Heap diagram.png", size: 1200, "content-type": "image/png", updated_at: at(-20), url: "https://q.utoronto.ca/files/5002/download", folder_id: 6002 },
  5003: { id: 5003, display_name: "ps3_starter.py", size: 420, "content-type": "text/x-python", updated_at: at(-4), url: "https://q.utoronto.ca/files/5003/download", folder_id: 6002 },
  5004: { id: 5004, display_name: "Extra reading.docx", size: 88231, "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", updated_at: at(-40), url: "https://q.utoronto.ca/files/5004/download", folder_id: 6001 },
};

const FOLDERS = {
  6001: { id: 6001, name: "course files", full_name: "course files", parent_folder_id: null, files_count: 2, folders_count: 1 },
  6002: { id: 6002, name: "Week 5", full_name: "course files/Week 5", parent_folder_id: 6001, files_count: 2, folders_count: 0 },
};

const PAGES = {
  101: [
    { page_id: 1, url: "course-policies", title: "Course policies", updated_at: at(-40), front_page: false, html_url: "https://q.utoronto.ca/courses/101/pages/course-policies",
      body: "<h2>Late policy</h2><p>Each problem set may be submitted up to 24 hours late for a 10% penalty.</p><h2>Remark requests</h2><p>Submit within one week of marks being released.</p>" },
    { page_id: 2, url: "tutorial-rooms", title: "Tutorial rooms", updated_at: at(-10), html_url: "https://q.utoronto.ca/courses/101/pages/tutorial-rooms", body: "<ul><li>TUT0101 — BA 1200</li><li>TUT0201 — SS 2105</li></ul>" },
  ],
  202: [{ page_id: 3, url: "welcome", title: "Welcome to MAT237", front_page: true, updated_at: at(-50), html_url: "https://q.utoronto.ca/courses/202/pages/welcome",
    body: "<p>Welcome! Start with <a href=\"/courses/202/modules\">Modules</a>. The textbook is on <a href=\"/courses/202/files/5001/preview\">this PDF</a>.</p>" },
    { page_id: 4, url: "notes-1-1", title: "Notes 1.1", updated_at: at(-5), html_url: "https://q.utoronto.ca/courses/202/pages/notes-1-1", body: "<p>Open sets and closed sets.</p>" }],
  303: [],
};

const CONVERSATIONS = [
  { id: 9001, subject: "Re: remark request for PS2", workflow_state: "unread", last_message: "I've updated your mark to 17.5/20.", last_message_at: at(-1, 14, 0), context_name: "CSC263H1", message_count: 2,
    participants: [{ id: 1, name: "Alex Student" }, { id: 2, name: "Sam TA" }],
    messages: [
      { id: 2, author_id: 2, body: "I've updated your mark to 17.5/20.\n\nThanks for pointing it out.", created_at: at(-1, 14, 0) },
      { id: 1, author_id: 1, body: "Hi, I think Q2 was marked incorrectly.", created_at: at(-3, 10, 0), attachments: [{ id: 5003, display_name: "ps3_starter.py", url: "https://q.utoronto.ca/files/5003/download" }] },
    ] },
  { id: 9002, subject: "Group project partners", workflow_state: "read", last_message: "Sounds good, see you Tuesday.", last_message_at: at(-6), context_name: "MAT237Y1", message_count: 4, participants: [{ id: 1, name: "Alex Student" }, { id: 3, name: "Ada Li" }] },
];

/** path → response. Throw a string (like Rust does) for HTTP errors. */
export function route(path) {
  const [p, q = ""] = path.split("?");
  let m;
  if (p === "/api/v1/users/self") return { id: 1, name: "Alex Student", short_name: "Alex", primary_email: "alex.student@mail.utoronto.ca" };
  if (p === "/api/v1/users/self/colors") return { custom_colors: { course_101: "#2f6f9f", course_202: "#a2572e", course_303: "#6a5aa8" } };
  if (p === "/api/v1/conversations/unread_count") return { unread_count: "1" };
  if (p === "/api/v1/conversations") return CONVERSATIONS.map(({ messages, ...c }) => c);
  if ((m = p.match(/^\/api\/v1\/conversations\/(\d+)$/))) return CONVERSATIONS.find((c) => c.id == m[1]) ?? fail(404);
  if (p === "/api/v1/courses") return COURSES;
  if (p === "/api/v1/planner/items") return PLANNER;
  if (p === "/api/v1/announcements") return Object.values(ANN).flat();
  if (p === "/api/v1/users/self/activity_stream") return [];
  if ((m = p.match(/^\/api\/v1\/courses\/(\d+)$/))) {
    const c = COURSES.find((c) => c.id == m[1]) ?? fail(404);
    return q.includes("syllabus_body") ? { ...c, syllabus_body: m[1] == 303 ? "<h2>PHL245 Syllabus</h2><p>Grading: 10 exercise sets (50%), final (50%).</p>" : "" } : c;
  }
  if ((m = p.match(/^\/api\/v1\/courses\/(\d+)\/tabs$/))) return tabs(+m[1], m[1] == 101 ? [["context_external_tool_9", "Crowdmark"]] : []);
  if ((m = p.match(/^\/api\/v1\/courses\/(\d+)\/assignment_groups$/))) return groups[m[1]] ?? [];
  if ((m = p.match(/^\/api\/v1\/courses\/(\d+)\/assignments\/(\d+)$/))) {
    const a = (groups[m[1]] ?? []).flatMap((g) => g.assignments).find((a) => a.id == m[2]) ?? fail(404);
    return { ...a, description: a.id === 3001 ? DESCRIPTION : a.description ?? null, rubric: a.id === 3001 || a.id === 3002 ? RUBRIC : undefined };
  }
  if ((m = p.match(/^\/api\/v1\/courses\/(\d+)\/assignments\/(\d+)\/submissions\/self$/))) {
    return m[2] == 3002
      ? { ...sub({ workflow_state: "graded", score: 17.5 }), rubric_assessment: { r1: { points: 10, comments: "Clean proof." }, r2: { points: 6 } },
          submission_comments: [{ id: 1, author_name: "Sam TA", comment: "Good work. Tighten the bound in Q2.", created_at: at(-10) }] }
      : { ...sub({}), submission_comments: [] };
  }
  if ((m = p.match(/^\/api\/v1\/courses\/(\d+)\/discussion_topics$/))) return q.includes("only_announcements") ? ANN[m[1]] : DISC[m[1]];
  if ((m = p.match(/^\/api\/v1\/courses\/(\d+)\/discussion_topics\/(\d+)$/))) return [...Object.values(ANN).flat(), ...Object.values(DISC).flat()].find((t) => t.id == m[2]) ?? fail(404);
  if ((m = p.match(/^\/api\/v1\/courses\/(\d+)\/discussion_topics\/(\d+)\/view$/))) {
    if (m[2] == 7101) return {
      participants: [{ id: 11, display_name: "Ada Li" }, { id: 12, display_name: "Sam TA" }, { id: 13, display_name: "Alex Student" }],
      view: [
        { id: 1, user_id: 11, message: "<p>Heap sort isn't stable: equal keys can swap during sift-down.</p>", created_at: at(-2, 12), replies: [
          { id: 2, user_id: 12, message: "<p>Right. Can you give a 3-element example?</p>", created_at: at(-2, 15), replies: [
            { id: 3, user_id: 13, message: "<p>[2a, 2b, 1] works.</p>", created_at: at(-1, 9) }] }] },
        { id: 4, deleted: true, created_at: at(-1, 10) },
      ] };
    return { participants: [], view: [] };
  }
  if ((m = p.match(/^\/api\/v1\/courses\/(\d+)\/modules$/))) return MODULES[m[1]] ?? [];
  if ((m = p.match(/^\/api\/v1\/courses\/101\/modules\/403\/items$/)))
    return Array.from({ length: 6 }, (_, i) => ({ id: 100 + i, title: `Past exam ${2019 + i}.pdf`, type: "File", indent: 0, content_id: 5001 }));
  if ((m = p.match(/^\/api\/v1\/courses\/(\d+)\/pages$/))) return (PAGES[m[1]] ?? []).map(({ body, ...pg }) => pg);
  if ((m = p.match(/^\/api\/v1\/courses\/(\d+)\/pages\/(.+)$/))) return (PAGES[m[1]] ?? []).find((pg) => pg.url === decodeURIComponent(m[2])) ?? fail(404);
  if ((m = p.match(/^\/api\/v1\/courses\/(\d+)\/front_page$/))) return (PAGES[m[1]] ?? []).find((pg) => pg.front_page) ?? fail(404);
  // PHL245 hides its Files tab: Canvas answers 401 "unauthorized", which Rust maps to http-403.
  if ((m = p.match(/^\/api\/v1\/courses\/(\d+)\/folders\/root$/))) return m[1] == 101 ? FOLDERS[6001] : fail(403);
  if ((m = p.match(/^\/api\/v1\/folders\/(\d+)$/))) return FOLDERS[m[1]] ?? fail(404);
  if ((m = p.match(/^\/api\/v1\/folders\/(\d+)\/folders$/))) return Object.values(FOLDERS).filter((f) => f.parent_folder_id == m[1]);
  if ((m = p.match(/^\/api\/v1\/folders\/(\d+)\/files$/))) return Object.values(FILES).filter((f) => f.folder_id == m[1]);
  if ((m = p.match(/^\/api\/v1\/(?:courses\/\d+\/)?files\/(\d+)$/))) return FILES[m[1]] ?? fail(404);
  return undefined;
}

function fail(status) {
  throw `http-${status}`;
}

export const FILE_KIND = { 5001: "pdf", 5002: "png", 5003: "text", 5004: "docx" };

// ---------- ACORN / Degree Explorer (shapes from the community API registry) ----------

const slot = (dayName, start, end, buildingCode, room, instructors = []) => ({ day: { dayCode: dayName.slice(0, 2).toUpperCase(), dayName }, startTime: start, endTime: end, buildingCode, room, instructors });
const meeting = (displayName, times, who, extra = {}) => ({ sectionNo: displayName.slice(3), displayName, teachMethod: displayName.slice(0, 3), deliveryMode: "INPER", commaSeparatedInstructorNames: who, waitlistRank: null, times, ...extra });

export const ACORN = {
  syncedAt: Math.floor(Date.now() / 1000) - 1800,
  state: "idle",
  note: "",
  registrations: [{ candidacyPostCode: "ASPRGHBSC", sessionDescription: "Fall-Winter 2025-2026", registrationParams: { sessionCode: "20259", postCode: "ASPRGHBSC" } }],
  enrolled: {
    "20259": {
      APP: [
        { code: "CSC263H1", sectionCode: "F", title: "Data Structures and Analysis", status: "APP", sessionCode: "20259",
          meetings: [meeting("LEC0101", [slot("Monday", "10:00", "11:00", "BA", "1160"), slot("Wednesday", "10:00", "11:00", "BA", "1160")], "F. Ellen"),
                     meeting("TUT0201", [slot("Friday", "14:00", "15:00", "SS", "2105")], "")] },
        { code: "MAT237Y1", sectionCode: "Y", title: "Multivariable Calculus with Proofs", status: "APP", sessionCode: "20259",
          meetings: [meeting("LEC0201", [slot("Tuesday", "13:00", "14:00", "MP", "102"), slot("Thursday", "13:00", "14:00", "MP", "102"), slot("Wednesday", "10:00", "12:00", "MP", "203")], "J. Bell")] },
        { code: "PHL245H1", sectionCode: "F", title: "Modern Symbolic Logic", status: "APP", sessionCode: "20259",
          meetings: [meeting("LEC5101", [slot("Thursday", "18:00", "20:00", "SS", "1069")], "A. Logician")] },
        { code: "STA247H1", sectionCode: "S", title: "Probability with Computer Applications", status: "APP", sessionCode: "20261",
          meetings: [meeting("LEC0101", [slot("Monday", "09:00", "11:00", "SS", "2102")], "N. Stat")] },
      ],
      WAIT: [
        { code: "CSC258H1", sectionCode: "F", title: "Computer Organization", status: "WAIT", sessionCode: "20259",
          meetings: [meeting("LEC0101", [slot("Tuesday", "15:00", "17:00", "BA", "1170")], "S. Engels", { waitlistRank: 4 })] },
      ],
      DROP: [],
    },
  },
  notifications: { notifications: [{ title: "Winter 2026 course enrolment opens Nov 17", message: "Check your start time on the Enrolment page." }], actionNotices: [] },
  profile: { personId: "x", registrationStatusList: [] },
  history: {
    facultyCourses: [{
      studentSessions: [
        { sessionCode: "20249", sessionName: "2024 Fall", studentCourses: [
          { courseCode: "CSC148H1", courseTitle: "Introduction to Computer Science", enteredMark: "A", markPercentValue: 86 },
          { courseCode: "MAT137Y1", courseTitle: "Calculus with Proofs", enteredMark: "B+", markPercentValue: 78 },
          { courseCode: "PSY100H1", courseTitle: "Introductory Psychology", enteredMark: "CR", markPercentValue: 64 } ] },
        { sessionCode: "20251", sessionName: "2025 Winter", studentCourses: [
          { courseCode: "CSC165H1", courseTitle: "Mathematical Expression and Reasoning", enteredMark: "A-", markPercentValue: "82" },
          { courseCode: "STA130H1", courseTitle: "Statistical Reasoning", enteredMark: "B", markPercentValue: 74 } ] },
      ],
    }],
  },
};

// ---------- sample file bytes for end-to-end tests ----------

export function samplePdf(text) {
  const stream = `BT /F1 32 Tf 72 700 Td (${text}) Tj ET`;
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [4 0 R] /Count 1 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let s = "%PDF-1.4\n";
  const off = [];
  objs.forEach((o, i) => { off.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = s.length;
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(s, "latin1");
}

export const SAMPLE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAIAAAAt/+nTAAAAQklEQVR42u3PQQ0AAAgEoNe/tFr4CiaQnwSFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhcULBu1AAQfXHD0AAAAASUVORK5CYII=",
  "base64",
);
