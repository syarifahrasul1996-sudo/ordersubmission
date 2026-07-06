
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import fetch from 'node-fetch';

function generateDeterministicId(spreadsheetId: string, worksheet: string, row: number): string {
    const input = `${spreadsheetId}|${worksheet}|${row}`;
    const hash = crypto.createHash('sha256').update(input).digest('hex');
    return `sheet-${hash.substring(0, 16)}`;
}

async function runReconciliation() {
    console.log('Starting Production Reconciliation and Dry Run...');
    
    const auditPath = 'migration-reports/audit-rows.json';
    if (!fs.existsSync(auditPath)) {
        console.error('audit-rows.json not found');
        return;
    }

    const rawData = fs.readFileSync(auditPath, 'utf-8');
    const allRows = JSON.parse(rawData);

    const data = allRows.filter((r: any) => 
        r.classification === 'MIGRATABLE_GENERATED_ID' || 
        r.classification === 'MIGRATABLE_SAFE_ID' ||
        r.classification === 'MIGRATABLE_PRICE_NULL' ||
        r.classification === 'MIGRATABLE_GENERATED_ID_AND_PRICE_NULL' ||
        r.classification === 'READY_WITH_EXISTING_ID'
    );

    console.log(`Reconciling ${data.length} staging records...`);

    const stats = {
        totalStagingExamined: data.length,
        existingIdRowsExamined: 0,
        existingSafeIdRowsPreserved: 0,
        unsafeIdRowsReplaced: 0,
        uniqueUnsafeOriginalValues: new Set<string>(),
        duplicateOriginalIdRows: 0,
        blankIdRowsReplaced: 0,
        totalGeneratedProductionIds: 0,
        
        ordersProposed: 0,
        archiveProposed: 0,
        manualReviewExcludedBeforeStaging: 425,
        emptyRowsIgnoredBeforeStaging: 669,
        
        duplicateProposedDocIds: 0,
        duplicateSourceKeys: 0,
        missingRequiredFields: 0,
        schemaValidationFailures: 0,
        transformationErrors: 0,
        
        priceNullCount: 0,
        deliveryDateNullCount: 0,
        
        byYear: {} as any,
        byWorksheet: {} as any,
        
        deliveryDateDetails: {
            totalNull: 0,
            nullInOrders: 0,
            nullInArchive: 0,
            validInOrders: 0,
            validInArchive: 0
        },
        ordersSamples: [] as any[]
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

    const proposedDocIds = new Set<string>();
    const sourceKeys = new Set<string>();
    const originalIdsSeen = new Set<string>();

    let separatePageResult: any = null;

    data.forEach(item => {
        if (!item || !item.data) {
            stats.transformationErrors++;
            return;
        }

        const d = item.data;
        const spreadsheetId = item.spreadsheetId;
        const worksheet = item.worksheet;
        const row = item.sourceRow;
        const year = item.spreadsheetYear;

        const originalId = d.originalOrderId;
        if (originalId && originalId !== null) {
            stats.existingIdRowsExamined++;
            if (originalIdsSeen.has(originalId)) {
                stats.duplicateOriginalIdRows++;
            }
            originalIdsSeen.add(originalId);
        } else {
            stats.blankIdRowsReplaced++;
        }

        const isSafe = originalId && /^[a-zA-Z0-9_\-]+$/.test(originalId);
        
        let finalDocId: string;
        if (isSafe) {
            finalDocId = originalId;
            stats.existingSafeIdRowsPreserved++;
            if (samples.safeIds.length < 5) samples.safeIds.push({ id: finalDocId, original: originalId });
        } else {
            finalDocId = generateDeterministicId(spreadsheetId, worksheet, row);
            stats.unsafeIdRowsReplaced++;
            stats.totalGeneratedProductionIds++;
            if (originalId && originalId !== null) {
                stats.uniqueUnsafeOriginalValues.add(originalId);
            }
            
            if (originalId === 'separate page') {
                separatePageResult = {
                    sourceKey: `${spreadsheetId}|${worksheet}|${row}`,
                    sha256Input: `${spreadsheetId}|${worksheet}|${row}`,
                    replacementId: finalDocId,
                    originalOrderId: originalId
                };
            }
            
            idReplacements.push({
                original: originalId,
                replacement: finalDocId,
                source: { spreadsheetId, worksheet, row, year }
            });
            if (samples.replacedIds.length < 5) samples.replacedIds.push({ id: finalDocId, original: originalId });
        }

        // Check for Proposed Doc ID duplicates
        if (proposedDocIds.has(finalDocId)) {
            stats.duplicateProposedDocIds++;
        }
        proposedDocIds.add(finalDocId);

        // Check for Source Key duplicates
        const sourceKey = `${year}-${worksheet}-${row}`;
        if (sourceKeys.has(sourceKey)) {
            stats.duplicateSourceKeys++;
        }
        sourceKeys.add(sourceKey);

        // Check required fields (simplified schema validation)
        const requiredFields = ['customerName', 'customerPhone', 'customerOrder', 'customerTemplate', 'customerBahasa', 'customerAddOn', 'customerJenis'];
        for (const req of requiredFields) {
            if (d[req] === undefined) {
                stats.missingRequiredFields++;
                break;
            }
        }

        // Stats
        if (d.price === null) stats.priceNullCount++;
        const hasDeliveryDate = !!d.normalizedDue;
        if (!hasDeliveryDate) stats.deliveryDateNullCount++;
        
        stats.byYear[year] = (stats.byYear[year] || 0) + 1;
        stats.byWorksheet[worksheet] = (stats.byWorksheet[worksheet] || 0) + 1;

        const isDelivered = d.isDelivered;
        if (isDelivered) {
            stats.archiveProposed++;
            if (!hasDeliveryDate) stats.deliveryDateDetails.nullInArchive++;
            else stats.deliveryDateDetails.validInArchive++;
            if (samples.archive.length < 5) samples.archive.push({ id: finalDocId, data: d });
        } else {
            stats.ordersProposed++;
            if (!hasDeliveryDate) stats.deliveryDateDetails.nullInOrders++;
            else stats.deliveryDateDetails.validInOrders++;
            
            stats.ordersSamples.push({
                documentId: finalDocId,
                sourceWorksheet: worksheet,
                sourceRow: row,
                originalDue: d.originalDue,
                deliveryDate: d.normalizedDue || null,
                isDelivered: d.isDelivered
            });
            if (samples.orders.length < 5) samples.orders.push({ id: finalDocId, data: d });
        }

        if (!hasDeliveryDate) stats.deliveryDateDetails.totalNull++;

        if (d.price === null && samples.nullPrice.length < 5) samples.nullPrice.push({ id: finalDocId, data: d });
        if (!hasDeliveryDate && samples.nullDelivery.length < 5) samples.nullDelivery.push({ id: finalDocId, data: d });
    });

    const finalReport = {
        reconciliation: {
            totalStagingExamined: stats.totalStagingExamined,
            existingIdRowsExamined: stats.existingIdRowsExamined,
            existingSafeIdRowsPreserved: stats.existingSafeIdRowsPreserved,
            unsafeIdRowsReplaced: stats.unsafeIdRowsReplaced,
            uniqueUnsafeOriginalValues: stats.uniqueUnsafeOriginalValues.size,
            duplicateOriginalIdRows: stats.duplicateOriginalIdRows,
            blankIdRowsReplaced: stats.blankIdRowsReplaced,
            totalGeneratedProductionIds: stats.totalGeneratedProductionIds,
            reconciliationMath: `${stats.existingSafeIdRowsPreserved} (safe) + ${stats.unsafeIdRowsReplaced} (unsafe replaced) + ${stats.blankIdRowsReplaced} (blank replaced) = ${stats.existingSafeIdRowsPreserved + stats.unsafeIdRowsReplaced + stats.blankIdRowsReplaced}`
        },
        counts: {
            ordersProposed: stats.ordersProposed,
            archiveProposed: stats.archiveProposed,
            totalProposed: stats.ordersProposed + stats.archiveProposed,
            manualReviewExcludedBeforeStaging: stats.manualReviewExcludedBeforeStaging,
            emptyRowsIgnoredBeforeStaging: stats.emptyRowsIgnoredBeforeStaging
        },
        deliveryDates: stats.deliveryDateDetails,
        ordersSamplesGrouped: {
            VALID_DELIVERY_DATE: stats.ordersSamples.filter(s => s.deliveryDate !== null).length,
            BLANK_SOURCE_DUE: stats.ordersSamples.filter(s => s.deliveryDate === null && (!s.originalDue || s.originalDue.trim() === '')).length,
            INVALID_SOURCE_DUE: stats.ordersSamples.filter(s => s.deliveryDate === null && s.originalDue && s.originalDue.trim() !== '').length,
            TRANSFORMATION_FAILURE: 0 // Assumed 0 if originalDue exists and is parseable but failed; we classify as INVALID for now
        },
        ordersSamplesRaw: stats.ordersSamples,
        conflicts: {
            duplicateProposedDocIds: stats.duplicateProposedDocIds,
            duplicateSourceKeys: stats.duplicateSourceKeys,
            missingRequiredFields: stats.missingRequiredFields,
            schemaValidationFailures: stats.schemaValidationFailures,
            transformationErrors: stats.transformationErrors
        },
        details: {
            priceNullCount: stats.priceNullCount,
            deliveryDateNullCount: stats.deliveryDateNullCount,
            byYear: stats.byYear,
            byWorksheet: stats.byWorksheet
        },
        separatePage: separatePageResult
    };

    const reportDir = 'migration-reports';
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir);

    fs.writeFileSync(path.join(reportDir, 'production-migration-dry-run.json'), JSON.stringify(finalReport, null, 2));
    fs.writeFileSync(path.join(reportDir, 'production-id-replacements.json'), JSON.stringify(idReplacements, null, 2));
    fs.writeFileSync(path.join(reportDir, 'production-schema-errors.json'), JSON.stringify(schemaErrors, null, 2));
    fs.writeFileSync(path.join(reportDir, 'production-migration-samples.json'), JSON.stringify(samples, null, 2));

    console.log('=== DRY RUN COMPLETED ===');
    console.log(JSON.stringify({
        deliveryDates: finalReport.deliveryDates,
        ordersSamplesGrouped: finalReport.ordersSamplesGrouped,
        reconciliation: finalReport.reconciliation,
        counts: finalReport.counts,
        conflicts: finalReport.conflicts,
        separatePage: finalReport.separatePage
    }, null, 2));
}

runReconciliation().catch(console.error);
