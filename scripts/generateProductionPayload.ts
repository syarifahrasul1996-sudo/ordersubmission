import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore/lite';

async function main() {
    console.log('Loading staging documents from Firestore...');
    const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
    const app = initializeApp(config);
    const db = getFirestore(app, config.firestoreDatabaseId);

    const snapshot = await getDocs(collection(db, 'orders_migration_staging'));
    const docs: any[] = [];
    snapshot.forEach(docSnap => {
        docs.push(docSnap.data());
    });
    console.log(`Loaded ${docs.length} staging documents.`);

    // Group to count original IDs and track duplicates
    const idCounts: Record<string, number> = {};
    for (const d of docs) {
        const origId = d.originalOrderId;
        if (origId && origId.trim() !== '') {
            idCounts[origId] = (idCounts[origId] || 0) + 1;
        }
    }

    const payload: any[] = [];
    let safePreserved = 0;
    let unsafeReplaced = 0;
    let blankReplaced = 0;
    let ordersCount = 0;
    let archiveCount = 0;

    for (const d of docs) {
        const isDeliv = d.isDelivered;
        const targetCollection = isDeliv ? 'orders_archive' : 'orders';

        if (isDeliv) archiveCount++;
        else ordersCount++;

        const origId = d.originalOrderId;
        let finalId = d.documentId;
        let reasons: string[] = [];

        const isBlank = !origId || origId.trim() === '';

        if (isBlank) {
            blankReplaced++;
            // Generate sheet-<hash of sourceSpreadsheetId|sourceWorksheet|sourceRow> using first 16 chars of SHA-256
            const sKey = `${d.sourceSpreadsheetId}|${d.sourceWorksheet}|${d.sourceRow}`;
            const hash = crypto.createHash('sha256').update(sKey).digest('hex');
            finalId = `sheet-${hash.substring(0, 16)}`;
        } else {
            // Apply safety checks on existing ID
            if (!/^[A-Za-z0-9_\-]+$/.test(origId)) {
                reasons.push("Contains invalid characters");
            }
            if (origId.length > 128) {
                reasons.push("Exceeds length limit");
            }
            if (origId === '.' || origId === '..') {
                reasons.push("Reserved path name");
            }
            if (idCounts[origId] > 1) {
                reasons.push("Duplicated original ID");
            }
            if (origId.startsWith('sheet-')) {
                reasons.push("Conflicts with sheet- format");
            }

            if (reasons.length > 0) {
                unsafeReplaced++;
                const sKey = `${d.sourceSpreadsheetId}|${d.sourceWorksheet}|${d.sourceRow}`;
                const hash = crypto.createHash('sha256').update(sKey).digest('hex');
                finalId = `sheet-${hash.substring(0, 16)}`;
            } else {
                safePreserved++;
                finalId = origId;
            }
        }

        // Deep copy of fields and mapping
        const prodDoc = {
            targetCollection,
            documentId: finalId,
            sourceKey: d.sourceKey,
            customerName: d.customerName,
            customerPhone: d.customerPhone,
            customerOrder: d.customerOrder,
            customerTemplate: d.customerTemplate,
            customerBahasa: d.customerBahasa,
            customerAddOn: d.customerAddOn,
            customerJenis: d.customerJenis,
            deliveryDate: d.deliveryDate,
            originalDue: d.originalDue,
            orderLink: d.orderLink,
            price: d.price,
            isDelivered: d.isDelivered,
            originalOrderId: origId || null,
            metadata: {
                sourceSpreadsheet: d.sourceSpreadsheetYear,
                sourceWorksheet: d.sourceWorksheet,
                sourceRow: d.sourceRow,
                migratedAt: new Date().toISOString(),
                isGeneratedId: isBlank || reasons.length > 0
            }
        };

        payload.push(prodDoc);
    }

    // Sort by targetCollection|documentId
    payload.sort((a, b) => {
        const keyA = `${a.targetCollection}|${a.documentId}`;
        const keyB = `${b.targetCollection}|${b.documentId}`;
        return keyA.localeCompare(keyB);
    });

    // Check collisions and duplicates
    const uniqueDocIds = new Set<string>();
    const uniqueSourceKeys = new Set<string>();
    let duplicateIdsCount = 0;
    let duplicateSourceKeysCount = 0;

    for (const p of payload) {
        // ID uniqueness must be within its collection
        const colIdKey = `${p.targetCollection}|${p.documentId}`;
        if (uniqueDocIds.has(colIdKey)) {
            duplicateIdsCount++;
        }
        uniqueDocIds.add(colIdKey);

        if (uniqueSourceKeys.has(p.sourceKey)) {
            duplicateSourceKeysCount++;
        }
        uniqueSourceKeys.add(p.sourceKey);
    }

    // Serialize and hash manifest
    const manifestStr = JSON.stringify(payload, null, 2);
    const payloadSha = crypto.createHash('sha256').update(manifestStr).digest('hex');

    const summary = {
        payloadDocumentCount: payload.length,
        ordersCount,
        ordersArchiveCount: archiveCount,
        uniqueDocumentIds: uniqueDocIds.size,
        uniqueSourceKeys: uniqueSourceKeys.size,
        unsafeIdsReplaced: unsafeReplaced,
        blankIdsReplaced: blankReplaced,
        duplicateIdsFound: duplicateIdsCount,
        duplicateSourceKeysFound: duplicateSourceKeysCount,
        payloadSha256: payloadSha
    };

    console.log('\n--- PRODUCTION PAYLOAD SUMMARY ---');
    console.log(JSON.stringify(summary, null, 2));

    if (!fs.existsSync('migration-reports')) {
        fs.mkdirSync('migration-reports');
    }

    fs.writeFileSync('migration-reports/production-payload-manifest.json', manifestStr);
    fs.writeFileSync('migration-reports/production-payload-summary.json', JSON.stringify(summary, null, 2));

    console.log('Saved:');
    console.log(' - migration-reports/production-payload-manifest.json');
    console.log(' - migration-reports/production-payload-summary.json');
}

main().catch(console.error);
