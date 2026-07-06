import * as fs from 'fs';
import * as crypto from 'crypto';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDocs, limit, query, Timestamp, serverTimestamp, writeBatch } from 'firebase/firestore/lite';

async function migrateStaging() {
    const isDryRun = process.argv.includes('--dry-run');
    const collectionName = 'orders_migration_staging';
    
    // 1. Check source fingerprint
    const auditFilePath = 'migration-reports/audit-rows.json';
    if (!fs.existsSync(auditFilePath)) {
        console.error('Audit rows not found. Run npm run audit:sheets first.');
        process.exit(1);
    }
    const auditContent = fs.readFileSync(auditFilePath);
    const currentFingerprint = crypto.createHash('sha256').update(auditContent).digest('hex');
    
    // Approved fingerprint from dry run
    const approvedFingerprint = '465c14f3f4abf0ced7640bb9a2ed7709bb5c76cd8628bab09cc886dceba43112';
    
    if (currentFingerprint !== approvedFingerprint) {
        console.error('ERROR: Source fingerprint mismatch!');
        console.error(`Expected: ${approvedFingerprint}`);
        console.error(`Found:    ${currentFingerprint}`);
        process.exit(1);
    }

    // 2. Initialize Firebase Client
    const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
    const app = initializeApp(config);
    const db = getFirestore(app, config.firestoreDatabaseId);

    // 3. Confirm target is empty
    console.log(`Checking if collection '${collectionName}' is empty...`);
    const q = query(collection(db, collectionName), limit(1));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
        console.error(`ERROR: Collection '${collectionName}' is NOT empty. Staging migration aborted.`);
        process.exit(1);
    }

    // 4. Prepare data
    const rows = JSON.parse(auditContent.toString());
    const migratableRows = rows.filter((r: any) => 
        r.classification === 'MIGRATABLE_GENERATED_ID' || 
        r.classification === 'MIGRATABLE_SAFE_ID' ||
        r.classification === 'MIGRATABLE_PRICE_NULL' ||
        r.classification === 'MIGRATABLE_GENERATED_ID_AND_PRICE_NULL' ||
        r.classification === 'READY_WITH_EXISTING_ID'
    );

    console.log(`Starting staging migration of ${migratableRows.length} documents...`);

    const batchSize = 400;
    let processedCount = 0;
    
    for (let i = 0; i < migratableRows.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = migratableRows.slice(i, i + batchSize);
        
        for (const row of chunk) {
            const data = row.data;
            const docId = data.orderId;
            const docRef = doc(db, collectionName, docId);
            
            // Transform date to Firestore Timestamp if available
            let deliveryDate: any = null;
            if (data.normalizedDue) {
                const [year, month, day] = data.normalizedDue.split('-').map(Number);
                deliveryDate = Timestamp.fromDate(new Date(year, month - 1, day));
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
                isDelivered: data.isDelivered,
                sourceSpreadsheetId: row.spreadsheetId,
                sourceSpreadsheetYear: row.spreadsheetYear,
                sourceWorksheet: row.worksheet,
                sourceRow: row.sourceRow,
                sourceKey: `${row.spreadsheetId}|${row.worksheet}|${row.sourceRow}`,
                auditClassification: row.classification,
                migrationVersion: '1.0-staging',
                migratedAt: serverTimestamp()
            };
            
            batch.set(docRef, docData);
        }
        
        await batch.commit();
        processedCount += chunk.length;
        console.log(`Migrated ${processedCount}/${migratableRows.length} documents...`);
    }

    console.log('Staging migration complete.');

    // 5. Generate summary
    const summary = {
        fingerprint: currentFingerprint,
        timestamp: new Date().toISOString(),
        totalMigrated: processedCount,
        collection: collectionName,
        projectId: config.projectId
    };
    
    if (!fs.existsSync('migration-reports')) fs.mkdirSync('migration-reports');
    fs.writeFileSync('migration-reports/firestore-staging-write-summary.json', JSON.stringify(summary, null, 2));
}

migrateStaging().catch(e => {
    console.error('Migration failed:', e.message);
    process.exit(1);
});
