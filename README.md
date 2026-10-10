# Produce & HV

A buildless, offline-capable prep count PWA styled after the supplied Prep Count reference. No dependencies, account, backend, or developer fees are needed to use the app.

## Preview

From this directory run `npm run preview`, then open http://127.0.0.1:4173.

Alternatively: `python3 -m http.server 4173 --bind 127.0.0.1 --directory dist`.

Open through HTTP rather than double-clicking the HTML file; modules and service workers require an appropriate origin. On a phone, deploy to an HTTPS host first. A computer's localhost address will not open the app on a phone.

## Features

- 45 confirmed items: Produce (12), Prepared (24), HV (9).
- Whole-number +/- steps, direct decimal entry (up to 3 decimal places), and distinct blank/zero values.
- Device-local IndexedDB autosaving, dated sheets, history and filled-only filtering.
- Edit category and item names; add/remove items. Each sheet keeps its own list; new sheets inherit the current list with blank counts.
- Copy a filled-only text summary; export all current-sheet rows as CSV.
- Download/restore JSON backups of all sheets. Restore validates the complete backup before replacing data, and asks for confirmation.
- Installable manifest, PNG home-screen icons, offline service worker, and explicit update activation.

“Prepared” is a temporary label for the original right-hand column. Change it with Edit, or update `dist/core.js` before deployment. SW abbreviations and other confirmed shorthand are preserved.

## GitHub Pages

Upload the contents of `dist/` to a dedicated repository and enable Pages from its publishing branch. Alternatively put those contents into `/docs` and select that folder as the Pages source. All asset paths, manifest URLs and service-worker scope are relative, so a repository subpath is supported. The service worker deletes only this app's scoped caches; the database includes the app's path to avoid collisions with other PWAs on the same GitHub Pages origin.

Changes to defaults affect newly initialized devices, not existing saved sheets. For each deployed asset update, increment the cache version in `dist/sw.js`. Existing users apply the update from “Backup, export & install” after it has downloaded. Publishing an update does not clear counts.

## Storage and limitations

Data stays in this browser/device and is not synchronized or uploaded. Use one app tab at a time when editing; simultaneous tabs can overwrite one another's state. Changing the hostname or path creates a separate storage location; transfer data with backup/restore. Clearing site data may erase sheets. Export backups regularly, even when persistent storage is granted. If storage fails, the app shows a warning and keeps temporary counts available for export.

Load the app online once, and wait for “Ready for offline use.” After adding it to the Home Screen, open that installed app online once as well. Actual iOS/Android installation must be checked on those devices.

## Checks

Run `npm test` for count handling, corrected catalog, historical isolation, backup validation, and CSV escaping. Browser QA should additionally verify mobile layout, count reload persistence, offline reload, new/history, editing, backup/restore, and repository-subpath installation.
