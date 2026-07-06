import * as fs from 'fs';
import * as crypto from 'crypto';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { GoogleAuth } from 'google-auth-library';

async function main() {
    console.log('--- Auth Info ---');
    try {
        const auth = new GoogleAuth({
            scopes: 'https://www.googleapis.com/auth/cloud-platform'
        });
        const client = await auth.getClient();
        const projectId = await auth.getProjectId();
        let email = 'unknown';
        if ('email' in client) {
            email = (client as any).email;
        } else if ('credentials' in client && client.credentials && (client.credentials as any).client_email) {
            email = (client.credentials as any).client_email;
        }
        console.log(`Service Account Email: ${email}`);
        console.log(`Credential Project ID: ${projectId}`);
    } catch (e: any) {
        console.log(`Auth check failed: ${e.message}`);
    }

    const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
    const targetProjectId = config.projectId;
    const targetDatabaseId = config.firestoreDatabaseId;

    console.log('\n--- Firestore Connection ---');
    console.log(`Target Project ID: ${targetProjectId}`);
    console.log(`Target Database ID: ${targetDatabaseId}`);

    let app;
    if (process.env.SERVICE_ACCOUNT_CREDENTIALS && process.env.SERVICE_ACCOUNT_CREDENTIALS.startsWith('{')) {
        const creds = JSON.parse(process.env.SERVICE_ACCOUNT_CREDENTIALS);
        app = initializeApp({
            projectId: targetProjectId,
            credential: cert(creds)
        });
        console.log(`Using explicitly provided SERVICE_ACCOUNT_CREDENTIALS for ${creds.client_email}`);
    } else {
        app = initializeApp({
            projectId: targetProjectId,
            credential: applicationDefault()
        });
    }
    const db = getFirestore(app, targetDatabaseId);

    console.log('\n--- Fetching Staging Documents ---');
    const collectionName = 'orders_migration_staging';
    const snapshot = await db.collection(collectionName).get();
    console.log(`Fetched ${snapshot.size} documents.`);

    const manifest: any[] = [];
    const sourceKeys = new Set<string>();
    const duplicateSourceKeys: string[] = [];
    const missingSourceKeys: string[] = [];
    const docIds = new Set<string>();

    let safePreserved = 0;
    let unsafeReplaced = 0;
    let blankReplaced = 0;
    let ordersProposed = 0;
    let archiveProposed = 0;

    snapshot.forEach(doc => {
        const d = doc.data();
        const documentId = doc.id;
        
        const sourceKey = d.sourceKey || (d.spreadsheetYear && d.worksheet && d.sourceRow ? `${d.spreadsheetYear}-${d.worksheet}-${d.sourceRow}` : null);
        
        if (sourceKey) {
            if (sourceKeys.has(sourceKey)) duplicateSourceKeys.push(sourceKey);
            sourceKeys.add(sourceKey);
        } else {
            missingSourceKeys.push(documentId);
        }
        docIds.add(documentId);

        const isDeliv = d.isDelivered !== undefined ? d.isDelivered : (d.data?.isDelivered !== undefined ? d.data.isDelivered : null);
        const origId = d.originalOrderId !== undefined ? d.originalOrderId : (d.orderId !== undefined ? d.orderId : (d.data?.originalOrderId || d.data?.orderId || null));
        const classif = d.auditClassification || d.classification || null;

        manifest.push({
            documentId,
            sourceKey: sourceKey || null,
            sourceSpreadsheetId: d.sourceSpreadsheetId || d.spreadsheetId || null,
            sourceWorksheet: d.sourceWorksheet || d.worksheet || null,
            sourceRow: d.sourceRow || null,
            auditClassification: classif,
            isDelivered: isDeliv,
            originalOrderId: origId
        });

        if (isDeliv === true) archiveProposed++;
        else if (isDeliv === false) ordersProposed++;

        if (!origId || origId.trim() === '') {
            blankReplaced++;
        } else if (origId === documentId) {
            safePreserved++;
        } else {
            unsafeReplaced++;
        }
    });

    manifest.sort((a, b) => a.documentId.localeCompare(b.documentId));

    const manifestStr = JSON.stringify(manifest, null, 2);
    const manifestSha256 = crypto.createHash('sha256').update(manifestStr).digest('hex');

    fs.writeFileSync('migration-reports/staging-authoritative-manifest.json', manifestStr);

    const summary = {
        projectId: targetProjectId,
        databaseId: targetDatabaseId,
        collection: collectionName,
        documentCount: snapshot.size,
        uniqueDocumentIdCount: docIds.size,
        uniqueSourceKeyCount: sourceKeys.size,
        duplicateSourceKeys,
        missingSourceKeys,
        manifestSha256
    };
    fs.writeFileSync('migration-reports/staging-authoritative-summary.json', JSON.stringify(summary, null, 2));
    
    console.log('\n--- Output Summary ---');
    console.log(JSON.stringify(summary, null, 2));

    console.log('\n--- Reconciliations ---');
    console.log(`SAFE_EXISTING_ID_PRESERVED: ${safePreserved}`);
    console.log(`UNSAFE_EXISTING_ID_REPLACED: ${unsafeReplaced}`);
    console.log(`BLANK_ID_REPLACED: ${blankReplaced}`);
    console.log(`orders proposed: ${ordersProposed}`);
    console.log(`orders_archive proposed: ${archiveProposed}`);

    console.log('\n--- Source Check ---');
    const auditPath = 'migration-reports/audit-rows.json';
    if (fs.existsSync(auditPath)) {
        const fileBuffer = fs.readFileSync(auditPath);
        const sourceSha = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        
        let recordCount = 0;
        try {
             const sourceData = JSON.parse(fileBuffer.toString('utf-8'));
             recordCount = Array.isArray(sourceData) ? sourceData.length : 0;
        } catch (e) {
            const raw = fileBuffer.toString('utf-8');
            const matches = raw.match(/\{\s*"spreadsheetYear"/g);
            recordCount = matches ? matches.length : 0;
        }

        console.log(`Source filename: ${auditPath}`);
        console.log(`File byte size: ${fileBuffer.length}`);
        console.log(`Parsed record count: ${recordCount}`);
        console.log(`Calculated SHA-256: ${sourceSha}`);
        console.log(`Matches approved fingerprint: ${sourceSha === '465c14f3f4abf0ced7640bb9a2ed7709bb5c76cd8628bab09cc886dceba43112' ? 'YES' : 'NO'}`);
    } else {
        console.log(`Source file not found at ${auditPath}`);
    }
}

main().catch(console.error);
