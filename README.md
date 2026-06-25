# Order Submission App

A React/Vite order-management web app with monthly Google Sheets storage, local/offline retry support, dashboard reporting, customer document generation, and optional browser push notifications.

## Requirements

- Node.js 20 or newer
- npm
- A Google Apps Script deployment for Google Sheets synchronization
- A Gemini API key only when using AI letter/agreement generation

## Local setup

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

```env
GEMINI_API_KEY=""
GEMINI_MODEL="gemini-3.5-flash"
PORT="3000"
DATA_DIR="./runtime-data"
VAPID_SUBJECT="mailto:admin@example.com"
```

`GEMINI_API_KEY` is optional unless AI document generation is used. `DATA_DIR` stores generated VAPID keys and scheduled push-notification data outside the source tree.

## Google Apps Script setup

1. Open the spreadsheet that should receive orders.
2. Open **Extensions > Apps Script**.
3. Replace the existing script with the complete contents of `apps-script.js`.
4. Select **Deploy > New deployment > Web app**.
5. Set **Execute as** to **Me** and **Who has access** to **Anyone**.
6. Copy the deployed `/exec` URL.
7. In this app, open **History > Database Settings**.
8. Enter the global Apps Script URL, then configure each annual spreadsheet ID. A year-specific script URL can override the global URL when required.

After changing `apps-script.js`, create a new Apps Script deployment version or update the existing deployment. Editing the source alone does not update an already deployed web app version.

The script creates or updates monthly worksheet tabs and stores these columns:

1. Delivered
2. Customer Name
3. Phone
4. Order
5. Template
6. Language
7. Add-on
8. Type
9. Due Date/Time
10. Link
11. Order ID
12. Price

## Optional Google Docs generation

The Auto Doc feature uses Firebase Authentication and the Google Docs/Drive APIs. Before using it, verify that:

- The project Firebase configuration in the app belongs to your intended Firebase project.
- Google sign-in is enabled in Firebase Authentication.
- The deployed domain is listed under Firebase authorized domains.
- Google Docs API and Google Drive API are enabled for the Google Cloud project.

These services require your own Google project permissions and cannot be fully tested from a local source audit alone.

## Quality checks

Run the complete verification suite:

```bash
npm run check
```

This executes strict TypeScript checking, automated tests, the production build, JavaScript syntax checks, and a production-server smoke test.

Individual commands:

```bash
npm run lint
npm test
npm run build
npm run smoke
npm start
```

## Order visibility rule

Pending orders are shown in the active work window only: from the beginning of two days before today through the end of three days after today. Delivered orders remain available in history. Invalid or missing due dates are not silently converted to the current date.

## Generated runtime files

The server creates these files inside `DATA_DIR`:

- `vapid-keys.json`
- `scheduled-pushes.json`

Do not commit these files. Preserve `vapid-keys.json` between deployments so existing browser push subscriptions remain valid.
