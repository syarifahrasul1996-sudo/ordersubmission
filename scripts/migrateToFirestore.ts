import * as fs from 'fs';
import * as path from 'path';

async function migrate() {
    const isDryRun = process.argv.includes('--dry-run');
    
    if (!fs.existsSync('migration-reports/audit-rows.json')) {
        console.error('Audit rows not found. Run npm run audit:sheets first.');
        process.exit(1);
    }

    const rows = JSON.parse(fs.readFileSync('migration-reports/audit-rows.json', 'utf-8'));
    
    const proposedDocuments: any[] = [];
    const excludedRows: any[] = [];
    const ignoredEmptyRows: any[] = [];
    const samples: Record<string, any[]> = {};
    
    let generatedIdCount = 0;
    let existingSafeIdCount = 0;
    let unsafeReplacedCount = 0;
    let duplicateIdCount = 0;
    let duplicateSourceKeyCount = 0;
    
    const idSet = new Set<string>();
    const sourceKeySet = new Set<string>();

    for (const row of rows) {
        // Collect samples (5 per classification)
        const cls = row.classification;
        if (!samples[cls]) samples[cls] = [];
        if (samples[cls].length < 5) {
            samples[cls].push(row);
        }

        if (row.classification === 'IGNORED_EMPTY_ROW') {
            ignoredEmptyRows.push(row);
            continue;
        }

        if (row.classification === 'REQUIRES_MANUAL_REVIEW') {
            excludedRows.push({
                spreadsheetYear: row.spreadsheetYear,
                worksheet: row.worksheet,
                sourceRow: row.sourceRow,
                reasons: row.reasons,
                originalRow: row.originalRow
            });
            continue;
        }

        // Migratable row
        const data = row.data;
        const sourceKey = `${row.spreadsheetId}|${row.worksheet}|${row.sourceRow}`;
        
        if (sourceKeySet.has(sourceKey)) {
            duplicateSourceKeyCount++;
            continue;
        }
        sourceKeySet.add(sourceKey);

        let finalId = data.orderId;
        const isGenerated = data.generatedOrderId;

        if (isGenerated) {
            generatedIdCount++;
        } else {
            // Check if "unsafe" - user didn't specify exactly what unsafe means, 
            // but usually it means duplicates or invalid characters.
            // Since manual review already handled duplicates and length,
            // all remaining non-generated IDs should be "safe" by our audit standards.
            // However, let's track duplicates here just in case.
            if (idSet.has(finalId)) {
                duplicateIdCount++;
                // If it's a duplicate, we MUST replace it with a generated ID to avoid overwriting
                finalId = `gen-${finalId}-${row.spreadsheetYear}-${row.sourceRow}`;
                unsafeReplacedCount++;
            } else {
                existingSafeIdCount++;
            }
        }
        
        idSet.add(finalId);

        const doc = {
            id: finalId,
            customerName: data.customerName,
            customerPhone: data.customerPhone,
            customerOrder: data.customerOrder,
            customerTemplate: data.customerTemplate,
            customerBahasa: data.customerBahasa,
            customerAddOn: data.customerAddOn,
            customerJenis: data.customerJenis,
            deliveryDate: data.normalizedDue, // YYYY-MM-DD
            originalDue: data.originalDue,
            orderLink: data.orderLink,
            price: data.price,
            isDelivered: data.isDelivered,
            metadata: {
                sourceSpreadsheet: row.spreadsheetYear,
                sourceWorksheet: row.worksheet,
                sourceRow: row.sourceRow,
                migratedAt: new Date().toISOString(),
                isGeneratedId: isGenerated || finalId.startsWith('gen-')
            }
        };

        proposedDocuments.push(doc);
    }

    const report = {
        summary: {
            isDryRun,
            proposedDocumentCount: proposedDocuments.length,
            excludedRowCount: excludedRows.length,
            ignoredEmptyRowCount: ignoredEmptyRows.length,
            generatedIdCount,
            existingSafeIdCount,
            unsafeExistingIdsReplaced: unsafeReplacedCount,
            duplicateIdCount,
            duplicateSourceKeyCount
        }
    };

    if (!fs.existsSync('migration-reports')) fs.mkdirSync('migration-reports');
    
    fs.writeFileSync('migration-reports/firestore-migration-dry-run.json', JSON.stringify(report, null, 2));
    fs.writeFileSync('migration-reports/firestore-migration-excluded.json', JSON.stringify(excludedRows, null, 2));
    fs.writeFileSync('migration-reports/firestore-migration-samples.json', JSON.stringify(samples, null, 2));

    console.log('--- FIRESTORE MIGRATION DRY RUN ---');
    console.log(JSON.stringify(report.summary, null, 2));
    console.log(`\nProposed Documents: ${proposedDocuments.length}`);
    console.log(`Excluded Rows: ${excludedRows.length}`);
    console.log(`Ignored Empty Rows: ${ignoredEmptyRows.length}`);
    console.log(`Reports generated in migration-reports/`);
}

migrate().catch(console.error);
