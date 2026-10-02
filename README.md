# Quirkus

A fast desktop app for U of T **Quercus** (Canvas) and **ACORN**, with an MCP server so Claude and other AI
assistants can read your deadlines, assignments, grades, and timetable.

Unofficial. Not affiliated with the University of Toronto or Instructure. "Quercus" and "ACORN" are U of T's names
for its systems; this app just talks to them. MIT licensed.

## Download

From the [latest release](../../releases/latest):

| Platform | File | Notes |
|---|---|---|
| Windows | `Quirkus.exe` (portable, ~10 MB) or `Quirkus_x.y.z_x64-setup.exe` (installer, ~4 MB) | Needs WebView2, which Windows 10/11 include |
| Linux | `.deb`, `.rpm`, or `.AppImage` | |
| macOS | `.dmg` (universal) | Built by CI, not yet tested on a Mac |

**Windows warning.** Builds aren't code-signed yet. Downloaded copies show "Windows protected your PC": choose
**More info → Run anyway**. PCs with **Smart App Control** on can't run unsigned apps at all. Signing is planned.

## What it does

- **Home**: what's due in the next two weeks, today's classes, courses with current scores, recent announcements.
- **Due**: every dated item across your courses, overdue first.
- **Courses**: home, announcements, assignments, modules, files, pages, discussions, grades, syllabus.
  Quizzes, people, and LTI tools open in a Quercus window that shares your sign-in.
- **Files**: PDFs, images, audio, video, code, Word (`.docx`), PowerPoint (`.pptx`), Excel (`.xlsx`, `.xls`, `.csv`),
  OpenDocument, Jupyter notebooks, Markdown, HTML, and zip listings open inside the app. PowerPoint shows each
  slide's text and pictures, not its layout. Old `.doc` and `.ppt`, Keynote, and Pages files open in your default
  program instead. Files in a module you open are downloaded in the background, so clicking one is instant.
- **ACORN**: timetable (Fall/Winter, rooms, instructors, waitlist rank), academic history from Degree Explorer, and notices.
- **Search**: `Ctrl K` finds any course, assignment, page, or module file.
- **Notifications**: new announcements, grades, and messages, plus a reminder before unfinished work is due.
  Checked every 10 minutes. Each kind can be turned off in Settings.
- **Calendar**: add your Quercus due dates to Google Calendar, Outlook, or your default calendar app, and export
  your ACORN timetable as an `.ics` file. Timetable term dates are estimated; reading weeks aren't removed.
- **Settings**: theme, accent colour, window zoom, 24-hour clock, start page, what Home shows, and which courses
  appear. A welcome tour walks through these on first run.
- Works offline from its local copy. Adapts from a narrow side-by-side window to full screen.

Submitting work, taking quizzes, and enrolling happen in the real Quercus/ACORN pages. The app never changes
anything in Quercus or ACORN.

## Use with Claude (MCP)

The same program is an [MCP](https://modelcontextprotocol.io) server: run it with the `mcp` argument.
Sign in once in the app first; the server uses that sign-in. Exact commands with your install path are in
**Settings → Use with Claude**.

**Claude Code**

```sh
claude mcp add --scope user quirkus -- "C:\Users\<you>\AppData\Local\Quirkus\quirkus.exe" mcp
```

**Claude Desktop** (`%APPDATA%\Claude\claude_desktop_config.json` on Windows)

```json
{ "mcpServers": { "quirkus": { "command": "C:\\Users\\<you>\\AppData\\Local\\Quirkus\\quirkus.exe", "args": ["mcp"] } } }
```

Tools (all read-only): `list_courses`, `upcoming_deadlines`, `course_assignments`, `get_assignment`, `grades`,
`announcements`, `course_modules`, `read_page`, `read_file` (PDF text included), `search`, `inbox`, `timetable`,
`academic_history`. Ask things like "what's due this week?", "summarize the PS3 instructions", or
"when's my next class?".

## Privacy and security

- **Your data stays on your computer.** The app talks only to `q.utoronto.ca`, `acorn.utoronto.ca`,
  `degreeexplorer.utoronto.ca`, and the UofT sign-in pages. No analytics, no servers of ours.
- **Sign-in**: the normal UofT page opens in a separate window. Your password goes only to UofT. The app keeps the
  resulting Quercus session (or an access token, if you choose that) in its config folder, readable only by you
  (`0600` on Linux/macOS).
- **ACORN** has no public API. After you sign in, the app opens ACORN and Degree Explorer in hidden windows, where
  UofT sign-in completes on its own, and runs a fixed script that makes the same read-only requests ACORN's own
  pages make ([route list](https://github.com/SleepyPandas/unofficial-UofT-api-registry)). Those windows can only
  hand back five named results (`src-tauri/capabilities/acorn.json`, `valid_key` in `src-tauri/src/acorn.rs`).
- **Calendar links**: the Google and Outlook buttons open your browser with your private Quercus calendar link, so
  that service receives the link. Nothing is sent unless you press one.
- **Everything is deleted on sign-out**: session, cached pages and files, ACORN data. Your appearance and
  notification settings stay.
- **MCP** only runs if you add it to an AI client, and only reads. Remember that whatever it reads is sent to that
  AI provider under their terms.

## Develop

Prerequisites: Node 20+, Rust (rustup), and on Linux/WSL:

```sh
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev librsvg2-dev \
  libayatana-appindicator3-dev libxdo-dev pkg-config
```

```sh
npm install
npm run tauri dev      # run with hot reload
npm run check          # type-check the frontend
npm test               # UI tests (headless Chromium, fake Quercus) + Rust tests + MCP end-to-end
npm run shots          # UI tests, saving screenshots to tests/shots/
npm run e2e            # release binary vs. a fake Quercus (Linux/WSLg)
npm run tauri build    # Linux release + .deb/.rpm/.AppImage
```

### Windows builds (from Linux/WSL)

```sh
sudo apt install -y lld llvm nsis clang
rustup target add x86_64-pc-windows-msvc && cargo install --locked cargo-xwin
npm run build:windows  # → release/Quirkus.exe (portable) and the NSIS installer under src-tauri/target/
```

Test the installed Windows app with Windows' Node (drives WebView2 over remote debugging with an isolated profile):
`node.exe tests\e2e-windows.mjs "%LOCALAPPDATA%\Quirkus\quirkus.exe"`

### CI

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`: type check, UI tests, Rust tests, and
the MCP end-to-end test on Linux, plus the Rust tests on Windows and macOS.

### Releases

Push a tag like `v0.1.0`. `.github/workflows/release.yml` builds Windows, macOS, and Linux and attaches everything,
including the portable `Quirkus.exe`, to a draft GitHub release.

### Layout

```
src-tauri/src/canvas.rs   Canvas API client: auth, pagination, memory + disk cache, background refresh
src-tauri/src/lib.rs      Tauri commands, sign-in window, qc:// image proxy, files, notifications, calendar file
src/lib/prefs.svelte.ts   Settings (saved in the webview's localStorage) and how they're applied
src/lib/convert.ts        Office, notebook, Markdown, and zip readers for the file viewer
src/views/Welcome.svelte  First-run tour; its steps are the components in src/components/setup/
src-tauri/src/acorn.rs    ACORN / Degree Explorer sync
src-tauri/src/mcp.rs      MCP server (`quirkus mcp`)
src/lib/api.svelte.ts     query(): reactive, cache-first reads that update in place
src/lib/paths.ts          Every Canvas endpoint the app uses (the MCP server uses the same ones)
src/views/                Screens
tests/                    UI, end-to-end (Linux, Windows), and MCP tests with a fake Quercus
```
