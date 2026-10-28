# UI/UX polish

Logic, API calls, routes and the logo files are unchanged. The palette tokens in `globals.css` are the same hex values.

- Design system in `src/app/globals.css`: shared `.btn`, `.field`, `.icon-btn`, reading typography (`.prose`), motion that respects reduced-motion.
- Fonts bundled with the app (IBM Plex Sans for UI, Source Serif 4 for reading text): works offline in Tauri. New deps: `@fontsource/ibm-plex-sans`, `@fontsource-variable/source-serif-4`.
- `src/components/ui/Dialogs.tsx`: in-app confirm / prompt / toast replacing `window.prompt/confirm/alert` (unreliable in desktop webviews).
- Theme is applied before first paint (no light flash in dark mode).
- Shell: persistent sidebar (collapsible to an icon rail), grouped navigation, new home screen.
- Chat: serif answers without bubbles, same markdown / tables / citations / images / figure cards; auto-growing composer; clearer empty state.
- Tools, Settings, Dashboards list, Canvas toolbar and panels restyled with the same tokens.
