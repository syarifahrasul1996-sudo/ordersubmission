import * as fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, Timestamp } from 'firebase/firestore/lite';

async function writeCanary() {
    const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
    const app = initializeApp(config);
    const db = getFirestore(app, config.firestoreDatabaseId);

    const selectedRows = JSON.parse(fs.readFileSync('migration-reports/selected-canary-rows.json', 'utf-8'));
    console.log(`Loaded ${selectedRows.length} selected canary records to write.`);

    let undeliveredCount = 0;
    let deliveredCount = 0;

    for (const row of selectedRows) {
        const data = row.data;
        const docId = data.orderId;
        const isDelivered = data.isDelivered;
        
        const targetCollection = isDelivered ? 'orders_archive_canary' : 'orders_canary';
        const docRef = doc(db, targetCollection, docId);

        // Transform date to Firestore Timestamp if available
        let deliveryDate: any = null;
        if (data.normalizedDue) {
            const [year, month, day] = data.normalizedDue.split('-').map(Number);
            deliveryDate = Timestamp.fromDate(new Date(Date.UTC(year, month - 1, day)));
        }

        const docData = {
            documentId: docId,
            originalOrderId: data.originalOrderId || null,
            generatedOrderId: data.generatedOrderId,
            customerName: data.customerName,
            customerPhone: data.customerPhone,
            customerOrder: data.customerOrder,
            customerTemplate: data.customerTemplate,
            customerBahasa: data.customerBahasa,
            customerAddOn: data.customerAddOn,
            customerJenis: data.customerJenis,
            deliveryDate: deliveryDate,
            originalDue: data.originalDue,
            orderLink: data.orderLink,
            price: data.price, // Preserve null
            isDelivered: isDelivered,
            sourceSpreadsheetId: row.spreadsheetId,
            sourceSpreadsheetYear: row.spreadsheetYear,
            sourceWorksheet: row.worksheet,
            sourceRow: row.sourceRow,
            sourceKey: `${row.spreadsheetId}|${row.worksheet}|${row.sourceRow}`,
            auditClassification: row.classification,
            migrationVersion: '1.0-canary',
            migratedAt: Timestamp.fromDate(new Date())
        };

        await setDoc(docRef, docData);
        if (isDelivered) {
            deliveredCount++;
        } else {
            undeliveredCount++;
        }
        console.log(`Wrote ${docId} (Delivered=${isDelivered}) to ${targetCollection}`);
    }

    console.log(`=== WRITE RESULTS ===`);
    console.log(`Successfully wrote ${undeliveredCount} records to orders_canary`);
    console.log(`Successfully wrote ${deliveredCount} records to orders_archive_canary`);
}

writeCanary().catch(console.error);
