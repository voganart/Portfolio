# Portfolio and Admin UX Refresh

## Goal

Improve day-to-day content management and make the public portfolio easier to scan, while preserving:

- the local batch-file launch and `#admin` route;
- the current JSON/content storage model;
- the existing save and GitHub Pages publish workflow;
- the dark purple/teal visual identity;
- Russian and English content.

No automated tests will be added or run. Final content and interaction acceptance is manual by the owner. Build and TypeScript checks are allowed as basic technical validation.

## Admin panel

### Information architecture

Replace the wall of 50 expanded forms with a two-pane desktop workspace:

- left pane: compact searchable project list with thumbnail, order, title, tags, and drag handle;
- right pane: editor for the selected project;
- sticky top bar: project count, unsaved-state indicator, site preview, save, and publish;
- mobile/narrow fallback: list first, editor opens below or as a full-width panel.

The current grid/list toggle will be removed because neither view scales well for editing. Reordering remains available in the compact list.

### Editing workflow

- Search by RU/EN title, filename, or tag.
- Filter by tag.
- Add a project and select it immediately.
- Keep RU and EN fields grouped and clearly labeled.
- Treat tags as individual removable chips with a simple input for new tags.
- Keep media preview and upload in the editor; show filename and file metadata without making the stored filename the primary editing control.
- Preserve automatic RU-to-EN translation, but show progress and failure inline.
- Delete stays behind confirmation and clearly states that saving is required to persist the deletion.

### State and safety

- Track dirty state after edits, reorder, upload, add, or delete.
- Warn before leaving the admin route with unsaved changes.
- Disable Save when nothing changed.
- Publish first saves pending edits, then publishes.
- Display separate statuses for local save and GitHub publication.
- Limit upload types and size on both client and server, with readable errors.
- Publish stages only portfolio source/data/content files required by the workflow, not arbitrary repository changes.

## Public portfolio

### Page hierarchy

- Keep the hero, but reduce unused vertical space and make the role more specific to game animation, technical art, and interactive previews.
- Add a compact sticky navigation for Work, Showreel, About, and Contact.
- Bring selected work closer to the first screen.
- Keep the showreel prominent without forcing visitors through a long section before reaching projects.
- Reduce the visual weight of the skills section and long biography.

### Portfolio browsing

- Replace the 26-tag wall with a short curated category row: Featured, 2D/Spine, 3D, VFX/UI, Game Prototypes, and Renders.
- Add an “All filters” control for detailed tags when needed.
- Reset “show all” correctly when the category changes.
- Show a useful project count and an empty state.
- Keep three desktop columns and one mobile column, but improve card hierarchy and consistency.
- Make title, key tags, and a short description usable without hover.
- Use explicit poster images where available and avoid loading metadata for every off-screen video.

### Project viewer

- Keep keyboard navigation and previous/next controls.
- Open videos muted by default; never start unexpected audio.
- Lock background scrolling while open.
- Improve mobile sizing and keep close/navigation controls reachable.
- Add the current project position and preserve the active filter context.

## Data cleanup

- Normalize `PixieJS` to `PixiJS`.
- Repair mojibake filenames only when the physical file and JSON reference can be renamed together safely.
- Do not merge duplicate projects automatically; flag duplicate titles in the admin UI.
- Reuse existing data fields. No database or CMS migration.

## Components and boundaries

- Split `AdminPanel.tsx` into focused list, editor, toolbar, and status components.
- Keep project loading/saving/publishing in the admin container.
- Extract shared project/category helpers instead of duplicating tag logic.
- Keep the public project card and modal separate.
- Add small reusable UI primitives only where they reduce duplication; no design-system rewrite.

## Error handling

- Show actionable inline errors for load, save, upload, translation, and publish.
- Preserve user edits after recoverable request failures.
- Do not publish if save or validation fails.
- Validate required RU/EN title, media filename, and at least one tag before save/publish.

## Validation and acceptance

- No automated tests.
- Run TypeScript and production build checks only.
- Visually inspect the public site and admin at desktop and mobile widths.
- Owner performs the final manual workflow check: launch batch file, edit/add/reorder/upload, save, preview, and publish.

## Out of scope

- Authentication or remote admin access.
- Replacing JSON with a database or external CMS.
- Changing hosting away from GitHub Pages.
- Rebuilding the site in another framework.
- Large content rewrite or automatic deletion/merging of existing projects.
