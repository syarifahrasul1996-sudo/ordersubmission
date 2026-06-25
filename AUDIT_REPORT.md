# Project Audit and Repair Report

## Scope

The complete source tree was reviewed for build failures, type inconsistencies, date-window behavior, local-state handling, Google Sheets synchronization, offline retries, dashboard calculations, document generation, notifications, server persistence, PWA assets, dependencies, and deployment instructions.

## Issues repaired

### 1. Type checking was not actually protecting the React code

The project lacked React type packages, so many component values were effectively untyped. Strict TypeScript checking, unused-code checking, and the required React type packages are now enabled.

### 2. A duplicate root component imported a file that did not exist

The unused root-level `ViewSection.tsx` caused the type-check to fail. The orphan file and other unreachable duplicate modules were removed.

### 3. Invalid due dates became today's date

Missing or malformed due dates previously fell back to a synchronization timestamp. Old or incomplete records could therefore appear as current unfinished orders. Date parsing now rejects invalid values and never substitutes the sync time as a deadline.

### 4. Pending-order counts ignored the intended work window

Home and History did not use the same filtering rule. Pending orders now use one shared active window: two days before today through three days after today. Delivered records remain available in full history.

### 5. Dashboard rows read the wrong due-date value

Cloud dashboard data could derive dates from the wrong field or treat invalid values as today. Dashboard rows now normalize the actual due field and exclude invalid deadlines from date-based calculations.

### 6. Google Apps Script could not process several actions used by the app

The previous script contained duplicated declarations, duplicated returns, incomplete routing, and no compatible POST action routing. `apps-script.js` was rewritten as one backend supporting:

- recent order synchronization
- dashboard order retrieval
- link lookup
- delivered-status updates
- order search
- deletion
- order updates
- legacy row submissions

Both JSONP/GET requests and POST-compatible requests now use the same action handlers.

### 7. Failed cloud writes were incorrectly treated as successful

The browser used an unreadable `no-cors` POST fallback for some updates. A network request could therefore look successful even when Apps Script rejected or ignored it. Status changes, deletion, and updates now require a verifiable success response or enter the offline retry queue.

### 8. Different screens could use different Apps Script deployments

Some screens used the saved global URL while others silently used a hard-coded URL. Normal saves, searches, background link checks, status updates, and offline retries now share the same resolution order: year-specific URL, global URL, explicit fallback, then bundled default.

### 9. Offline retries could duplicate or lose intent

Queue entries are now deduplicated by action and order, normalized from legacy payloads, retained until Apps Script explicitly confirms success, and resolved against the current configured deployment before retrying.

### 10. Notification registration ran repeatedly

The app could repeatedly attempt push registration while state changed. Permission is now requested only through the Settings control. Existing granted subscriptions can still be restored silently.

### 11. Old deadlines could generate immediate notifications

Notification checks are now limited to valid, undelivered orders in the active window. The due-now browser alert also has a short grace interval, preventing stale records from alerting immediately after launch.

### 12. Draft and history updates used inconsistent shapes

Draft restoration, remote result mapping, active-order updates, and history persistence were normalized so saved state, generated messages, order IDs, prices, and links remain attached to the correct record.

### 13. Autosave could delete or overwrite useful draft state

Customer information validation now occurs before destructive draft changes. Autosave updates are silent, while explicit saves provide feedback. Updates target the correct history item instead of relying on whichever item happens to be active.

### 14. Price parsing lost valid values

Price normalization now accepts stored numeric/string values consistently and preserves a valid zero instead of treating it as missing.

### 15. Google Docs requests did not fully validate failures

Document creation, content updates, and permission changes now check HTTP responses and surface service errors rather than continuing as though the document was complete.

### 16. The PWA depended on an external image

Manifest, service worker, page metadata, header, and notification icons now use local `192x192` and `512x512` assets so installation and offline behavior do not depend on Imgur.

### 17. Server runtime files were fragile

VAPID keys and scheduled notifications now use a configurable data directory and atomic JSON writes. Invalid files are handled safely, generated secrets are ignored by Git, and expired push subscriptions are removed correctly.

### 18. Server endpoints lacked sufficient validation

Push payloads, alerts, AI request size, document mode, language, and model configuration are validated. A health endpoint and a production smoke test were added.

### 19. Error suppression hid real browser failures

The page no longer suppresses broad `Unexpected token` errors. A React error boundary now catches rendering failures and offers a safe reload path.

### 20. Dependencies included known advisories and unused packages

Compatible patched dependency versions were installed, unused packages were removed, and the npm audit is clean at the time of this repair.

## Automated coverage added

- Date parsing and active-window tests
- Google Apps Script helper, routing, and error-response tests
- Strict TypeScript check
- Vite/client and Express/server production build
- Apps Script and service-worker syntax checks
- Production server smoke test for the health endpoint, VAPID endpoint, invalid push input, and SPA response

## Required one-time deployment actions

1. Redeploy the repaired `apps-script.js` and copy the resulting `/exec` URL into **History > Database Settings**.
2. Verify every annual spreadsheet ID and any year-specific script URL.
3. Create a production `.env` and keep `DATA_DIR` persistent between deployments.
4. Configure Firebase Authentication, Google Docs API, Google Drive API, and authorized domains only when Auto Doc is required.

Live Google Sheets, Google Docs, Firebase, Gemini, and push-delivery checks require your own credentials, browser permission, and deployed endpoints. The local automated suite verifies the application and server behavior without pretending those external accounts were available during the audit.
