
import * as fs from 'fs';
import * as path from 'path';

function sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_\-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function runDryRun() {
    console.log('Starting production migration dry run...');
    
    let rawData = fs.readFileSync('migration-reports/audit-rows.json', 'utf-8');
    // Attempt to fix truncation by closing the JSON if needed
    if (!rawData.endsWith(']')) {
        console.log('Fixing truncated JSON...');
        const lastBrace = rawData.lastIndexOf('}');
        if (lastBrace !== -1) {
            rawData = rawData.substring(0, lastBrace + 1) + '\n]';
        }
    }
    
    let data: any[] = [];
    try {
        data = JSON.parse(rawData);
    } catch (e) {
        console.error('Failed to parse audit-rows.json, trying recovery...');
        // Recovery: find all full objects
        const matches = rawData.match(/\{[\s\S]*?\}/g);
        if (matches) {
            data = matches.map(m => {
                try { return JSON.parse(m); } catch(err) { return null; }
            }).filter(Boolean);
        }
    }

    console.log(`Processing ${data.length} records...`);

    const results = {
        totalStagingExamined: data.length,
        ordersProposed: 0,
        archiveProposed: 0,
        existingSafeIds: 0,
        unsafeIdsReplaced: 0,
        duplicatesFound: 0,
        duplicateSourceKeyCount: 0,
        missingFields: 0,
        schemaFailures: 0,
        priceNullCount: 0,
        deliveryDateNullCount: 0,
        byYear: {} as any,
        byWorksheet: {} as any
    };

    const idReplacements: any[] = [];
    const schemaErrors: any[] = [];
    const samples: any = {
        orders: [],
        archive: [],
        safeIds: [],
        replacedIds: [],
        nullPrice: [],
        nullDelivery: []
    };

    const docIds = new Set();
    const sourceKeys = new Set();

    data.forEach(item => {
        if (!item || !item.data) return;
        const d = item.data;
        const meta = {
            year: item.spreadsheetYear,
            worksheet: item.worksheet,
            row: item.sourceRow
        };

        // 1. Audit ID
        const originalId = d.originalOrderId || d.orderId;
        const isSafe = originalId && /^[a-zA-Z0-9_\-]+$/.test(originalId);
        
        let finalDocId = originalId;
        if (!isSafe) {
            finalDocId = `sheet-${sanitizeId(originalId || 'row-' + item.sourceRow)}`;
            idReplacements.push({
                original: originalId,
                replacement: finalDocId,
                source: meta
            });
            results.unsafeIdsReplaced++;
        } else {
            results.existingSafeIds++;
        }

        // 2. Check Duplicates
        if (docIds.has(finalDocId)) results.duplicatesFound++;
        docIds.add(finalDocId);
        
        const sourceKey = `${meta.year}-${meta.worksheet}-${meta.row}`;
        if (sourceKeys.has(sourceKey)) results.duplicateSourceKeyCount++;
        sourceKeys.add(sourceKey);

        // 3. Stats
        if (d.price === null) results.priceNullCount++;
        if (d.deliveryDate === null) results.deliveryDateNullCount++;
        
        results.byYear[meta.year] = (results.byYear[meta.year] || 0) + 1;
        results.byWorksheet[meta.worksheet] = (results.byWorksheet[meta.worksheet] || 0) + 1;

        const isDelivered = d.isDelivered;
        if (isDelivered) {
            results.archiveProposed++;
            if (samples.archive.length < 5) samples.archive.push({ id: finalDocId, data: d });
        } else {
            results.ordersProposed++;
            if (samples.orders.length < 5) samples.orders.push({ id: finalDocId, data: d });
        }

        if (isSafe && samples.safeIds.length < 5) samples.safeIds.push({ id: finalDocId, original: originalId });
        if (!isSafe && samples.replacedIds.length < 5) samples.replacedIds.push({ id: finalDocId, original: originalId });
        if (d.price === null && samples.nullPrice.length < 5) samples.nullPrice.push({ id: finalDocId, data: d });
        if (d.deliveryDate === null && samples.nullDelivery.length < 5) samples.nullDelivery.push({ id: finalDocId, data: d });
    });

    // Write reports
    const reportDir = 'migration-reports';
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir);

    fs.writeFileSync(path.join(reportDir, 'production-migration-dry-run.json'), JSON.stringify(results, null, 2));
    fs.writeFileSync(path.join(reportDir, 'production-id-replacements.json'), JSON.stringify(idReplacements, null, 2));
    fs.writeFileSync(path.join(reportDir, 'production-schema-errors.json'), JSON.stringify(schemaErrors, null, 2));
    fs.writeFileSync(path.join(reportDir, 'production-migration-samples.json'), JSON.stringify(samples, null, 2));

    console.log('Dry run reports generated in migration-reports/');
}

runDryRun();
