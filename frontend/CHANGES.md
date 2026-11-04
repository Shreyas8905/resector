# Round 3

- **Branding**: "ReSector" is spelled out (Re + Sector in the brand accent, so it changes with the theme) under the logo in the rail and large on Home.
- **Theme**: a one-click Light/Dark button in the rail; "Text size" menu keeps Auto and text size. The two stay in sync.
- **Multiple drafts per dashboard**: a Drafts list in the Write view (new, duplicate, delete, open). Each draft has an "AI can read this" tick; ticked drafts are used as context by Ask ("Also read my drafts") and by Autopilot (outline and sections). Backend: `context_draft_ids` on the autopilot endpoints and `draft_ids` on `/ask`; the text of those drafts is given to the model as the author's own writing (never cited).
- **Draft not appearing, fixed (two causes)**: the Write view lived inside the wrapper that "Hide side panels" / focus mode hides, so it rendered blank after hiding panels; and "Add to draft" from Ask on a first visit created a draft that the initial load then switched away from.
- Canvas controls restyled (rounded floating controls, softer dots).

---

# Round 2: calmer and more spacious

Second pass after feedback that round 1 felt crowded. Inspired by Figma: fewer things on screen, each with a word, generous spacing.

- **Slim labelled rail** (5.5rem) replaces the big sidebar: Home, Dashboards, Chat, Related, Helpers, Search; AI setup and Look at the bottom. The four one-shot helpers open from "Helpers" with a sentence each. No collapse button, no mobile overlay logic.
- **Home** is a greeting, three large "Start here" cards, "Pick up where you left off" (your latest dashboards open in one click) and quick-helper chips.
- **Dashboards list**: big cards, a "New dashboard" card first, search once you have more than six, naming happens in a centred dialog.
- **Board** (canvas): the add tools are a floating bottom-centre toolbar with words; the overview map is off by default (More menu); 56px header; large friendly empty state; the canvas fades in.
- **Smoothness**: each screen eases in; loading uses skeletons instead of bare text.
- Rounder corners, `.float` / `.card` / `.skeleton` utilities in `globals.css`.

---

# Round 1: UI/UX revamp

Logic, API calls and routes are unchanged. Only the interface was reworked.

**Look**
- Dark mode is true black (#000); light mode is polar white. Brand blue (from the logo) is used for navigation, selection and highlights. Each tool has its own colour (`--tool-*` in `globals.css`).
- Theme now follows the system by default; the Appearance menu offers Light / Dark / System and a text-size setting (Normal, Large, Extra large). All text is in rem, so it scales.
- Bigger click targets (min 40px buttons), stronger focus ring, AA contrast.

**Layout**
- Left navigation rail with words next to icons, grouped by job. `Ctrl+K` opens a command palette to jump anywhere.
- `src/components/ThemeToggle.tsx` was removed; `AppearanceMenu.tsx` replaces it.
- Dashboard: one slim header (back, name, saved tick, Canvas / Compare / Write switcher, find, Assistant, More). Undo/redo, compare table, export, focus mode and token use live in the More menu.
- Ask, Connections and Comments share one "Assistant" dock with tabs, instead of three competing panels.
- Add tools (papers, library, my research, note, group) are a left strip with labels, not a floating bar.
- Write view: its controls (draft picker, Edit/Preview, Tools) sit in the dashboard header, so the old second header row is gone. The editor is a centred 46rem serif column with a large title. The writing tools pane steps aside while the Assistant dock is open.

**Not verified in the build sandbox:** `npm run build` and a visual check (dependencies could not be installed there). `out/` is stale build output, so rebuild it.
