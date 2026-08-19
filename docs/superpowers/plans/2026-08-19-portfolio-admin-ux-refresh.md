# Portfolio and Admin UX Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the local portfolio admin fast to use with 50+ projects and improve public-site scanning on desktop and mobile without replacing the existing workflow or visual identity.

**Architecture:** Keep React/Vite, JSON storage, the local Express admin server, and GitHub Pages deployment. Split the oversized admin component into a container plus toolbar, list, and editor; centralize project filtering/validation helpers; update the public portfolio hierarchy and modal behavior within the existing component structure.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Vite, Express, Multer, dnd-kit, simple-git.

**Spec:** `docs/superpowers/specs/2026-08-19-portfolio-admin-ux-design.md`

## Global Constraints

- Keep the batch-file/local-host launch and `#admin` route unchanged.
- Keep JSON/content storage and GitHub Pages hosting.
- Preserve Russian and English content and the dark purple/teal identity.
- Add or run no automated tests at the user's request.
- Technical validation is limited to TypeScript, production build, and visual browser inspection.
- Commit only files changed for this task directly to `main`; do not include the pre-existing `dist/index.html` change unless the build intentionally refreshes it and the final diff is reviewed.

---

### Task 1: Shared project helpers and admin component boundaries

**Files:**
- Create: `components/admin/AdminToolbar.tsx`
- Create: `components/admin/ProjectList.tsx`
- Create: `components/admin/ProjectEditor.tsx`
- Create: `utils/projects.ts`
- Modify: `components/AdminPanel.tsx`

**Interfaces:**
- `filterProjects(projects: Project[], query: string, tag: string | null): Project[]`
- `getProjectValidationErrors(project: Project): string[]`
- `getUniqueTags(projects: Project[]): string[]`
- `AdminToolbar` receives dirty/save/publish state and callbacks.
- `ProjectList` receives filtered projects, selected ID, selection/reorder callbacks.
- `ProjectEditor` receives selected project and field/upload/delete/translate callbacks.

- [ ] Create shared filtering, tag, and validation helpers using the existing `Project` type.
- [ ] Extract the sticky action bar with explicit “saved locally”, “unsaved changes”, and publish states.
- [ ] Replace the grid of expanded forms with a compact searchable/filterable project list and a selected-project editor.
- [ ] Preserve dnd-kit reordering in the compact list and make the selected project remain selected after reorder.
- [ ] Make newly created projects immediately selected and visible.
- [ ] Replace comma-only tag editing with removable chips plus a text input that accepts Enter or comma.
- [ ] Keep media upload, translation, and deletion in the editor with inline status/error text.

### Task 2: Admin state, validation, and publishing workflow

**Files:**
- Modify: `components/AdminPanel.tsx`
- Modify: `components/admin/AdminToolbar.tsx`
- Modify: `components/admin/ProjectEditor.tsx`

**Interfaces:**
- `updateProject(id: number, updater: (project: Project) => Project): void`
- `saveProjects(options?: { silent?: boolean }): Promise<boolean>` returns whether saving succeeded.
- `publishProjects(): Promise<void>` saves dirty state first and stops on validation/save failure.

- [ ] Track dirty state for field changes, tag edits, reorder, add, upload, and delete.
- [ ] Disable Save when clean and show separate save/publish messages.
- [ ] Validate required RU title, EN title, media filename, and at least one tag before save.
- [ ] Save pending changes before publish and abort publish if validation or saving fails.
- [ ] Add a `beforeunload` warning and an in-app confirmation when leaving the admin route with unsaved changes.
- [ ] Preserve current edits when requests fail; never replace user input with temporary translation text.
- [ ] Keep undo-unpublished behavior and display Git status in the toolbar without making it the primary action.

### Task 3: Upload and Git publication safety

**Files:**
- Modify: `server/index.cjs`
- Modify: `components/admin/ProjectEditor.tsx`

**Interfaces:**
- Multer accepts only `.mp4`, `.webm`, `.ogg`, `.png`, `.jpg`, `.jpeg`, and `.webp` up to 100 MB.
- Upload API errors return `{ message: string }`.
- Publish stages explicit portfolio paths rather than `.`.

- [ ] Add server-side MIME/extension filtering and a 100 MB Multer upload limit.
- [ ] Mirror accepted formats and size guidance in the file input and editor copy.
- [ ] Return readable client messages for unsupported or oversized files.
- [ ] Replace `git.add('.')` with an explicit allowlist covering `public/data/projects.json`, `public/content`, and source files needed by admin-driven publication.
- [ ] Keep the current build/deploy command and oversized-content preflight.

### Task 4: Public page hierarchy and portfolio discovery

**Files:**
- Modify: `App.tsx`
- Modify: `components/Header.tsx`
- Modify: `components/Showreel.tsx`
- Modify: `components/About.tsx`
- Modify: `components/Portfolio.tsx`
- Modify: `components/LanguageSwitcher.tsx`
- Create: `components/SiteNav.tsx`
- Modify: `locales/ru.ts`
- Modify: `locales/en.ts`

**Interfaces:**
- Curated categories map labels to existing project tags in `utils/projects.ts`.
- `SiteNav` links to `#work`, `#showreel`, `#about`, and `#contact`.
- Portfolio filtering keeps detailed tags behind an “All filters” disclosure.

- [ ] Add a compact sticky navigation that coexists with the language switcher.
- [ ] Reduce hero height/padding and update role copy to foreground game animation, technical art, and interactive previews.
- [ ] Move selected work closer to the hero while keeping the showreel prominent.
- [ ] Reduce biography/skills visual weight without deleting content.
- [ ] Replace the full tag wall with curated categories and an expandable detailed-filter area.
- [ ] Reset expansion when filters change, show project counts, and render a clear empty state.
- [ ] Make card title, key tags, and short description visible without hover on touch devices.
- [ ] Use poster files when present and reduce metadata loading for off-screen videos.

### Task 5: Project viewer, responsive polish, and data normalization

**Files:**
- Modify: `components/ProjectModal.tsx`
- Modify: `components/Portfolio.tsx`
- Modify: `components/Contact.tsx`
- Modify: `index.css`
- Modify: `public/data/projects.json`

**Interfaces:**
- Project modal receives the filtered project array and current index as today.
- Modal locks body scrolling for its lifetime and restores the prior value on close.

- [ ] Open project videos muted, keep controls available, and prevent unexpected audio.
- [ ] Lock background scrolling and keep mobile close/previous/next controls inside safe bounds.
- [ ] Show current project position on desktop and mobile.
- [ ] Normalize spacing, focus states, card borders, and motion while retaining the existing palette.
- [ ] Normalize `PixieJS` tags to `PixiJS`.
- [ ] Keep duplicate projects intact and surface duplicate-title warnings only in the admin editor.
- [ ] Rename mojibake media only if the physical file and JSON reference can be updated together with no missing reference.

### Task 6: Technical and visual verification, then commit

**Files:**
- Review all files modified by Tasks 1–5.
- Do not stage unrelated existing changes.

- [ ] Run `npx tsc --noEmit`; expected result is exit code 0.
- [ ] Run `npm run build`; expected result is a successful Vite production build.
- [ ] Inspect public site and `#admin` at desktop and mobile widths in the local browser.
- [ ] Review `git diff --check` and `git status --short`.
- [ ] Stage only task files after reviewing the final diff.
- [ ] Commit directly to `main` with message `feat: improve portfolio and admin UX`.
