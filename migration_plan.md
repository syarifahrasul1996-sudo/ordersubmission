
# Migration Plan: Google Sheets to Firestore

## 1. Firestore Schema (`orders` collection)

| Field | Type | Description |
| :--- | :--- | :--- |
| `orderId` | `string` | Unique identifier (from Column K) |
| `isDelivered` | `boolean` | Status (from Column A) |
| `customerName` | `string` | Name (from Column B) |
| `customerPhone` | `string` | Phone Number (from Column C) |
| `customerOrder` | `string` | Order details (from Column D) |
| `customerTemplate` | `string` | Template (from Column E) |
| `customerBahasa` | `string` | Bahasa (from Column F) |
| `customerAddOn` | `string` | Add On (from Column G) |
| `customerJenis` | `string` | Jenis (from Column H) |
| `customerDue` | `string` | Due date (from Column I) |
| `orderLink` | `string` | Link (from Column J) |
| `price` | `number` | Price (from Column L) |
| `year` | `string` | Derived from sheet name (2024, 2025, 2026) |
| `createdAt` | `timestamp` | Server timestamp |

## 2. Migration Script Logic

1.  **Initialize OAuth client** to access Google Sheets API.
2.  **Iterate** through the provided Spreadsheet IDs:
    *   2024: `1B9zdWXVLnvj0jNNVnKxcb6cJnS1VLCIdB4j-RR3wOlg`
    *   2025: `1myU9apnYWWtU3snnCw14qI6ZS05i4DY6oOswLz1sCwo`
    *   2026: `1kUAJYUVhr9bPYErtpnohpvuGGyhBSvJyEOIyzEFivJo`
3.  **Fetch data** from the first sheet (assuming 'Sheet1' or similar default) using `spreadsheets.values.get`.
4.  **Parse rows**, map columns to Firestore schema.
5.  **Write to Firestore** using a batch operation (`writeBatch`) for efficiency.

## 3. Verification Steps

1.  **Count records**: Compare total rows in Google Sheets vs document count in Firestore collection.
2.  **Sampling**: Randomly select 5 orders from each sheet and verify data mapping accuracy in Firestore.
3.  **Unique constraints**: Ensure no duplicate `orderId` entries.
