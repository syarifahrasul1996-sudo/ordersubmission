import { google } from 'googleapis';
import * as fs from 'fs';

async function main() {
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
    if (!apiKey) {
        throw new Error('GOOGLE_SHEETS_API_KEY not found');
    }
    const sheets = google.sheets({ version: 'v4', auth: apiKey });
    const spreadsheetId = '1myU9apnYWWtU3snnCw14qI6ZS05i4DY6oOswLz1sCwo';
    const range = "'Februari 2025'!A1:L100";

    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = res.data.values || [];
    console.log(`Fetched ${rows.length} rows.`);
    console.log('Row 99 (index 98):', JSON.stringify(rows[98]));
}

main().catch(console.error);
