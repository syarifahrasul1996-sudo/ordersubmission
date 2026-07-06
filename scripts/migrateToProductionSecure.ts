import * as fs from 'fs';
import * as crypto from 'crypto';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { GoogleAuth } from 'google-auth-library';

// --- IMMUTABLE EXPECTED CONSTANTS ---
export const EXPECTED_PROJECT_ID = "deft-verbena-smln4";
export const EXPECTED_DATABASE_ID = "ai-studio-ordersubmission-812e5ca5-4c13-4685-aeb6-9c38e1052adb";
export const EXPECTED_STAGING_COUNT = 5983;
export const EXPECTED_STAGING_MANIFEST_SHA256 = "1556ae28e1cbbf3f22012d544dd33794f350bd7bb472d862a72b43a4597c3ee9";
export const EXPECTED_PAYLOAD_SHA256 = "377058797bcd3e0a0d02deb60059b0f131f6cb39a40921509a55752c35d3e306";

async function main() {
    console.log('--- STARTING SECURE MIGRATION VERIFICATION ---');

    // 1. Check command line confirmation flag
    const hasConfirm = process.argv.includes('--confirm-production-write');
    const runWrite = process.argv.includes('--execute-write-now');

    if (runWrite && !hasConfirm) {
        console.error('ERROR: Missing required flag: --confirm-production-write when running live write.');
        process.exit(1);
    }

    if (!hasConfirm && !runWrite) {
        console.log('INFO: Running in PREFLIGHT mode (neither write flag is specified). Only read-only validations will be performed.');
    }

    // 2. Verify staging manifest hash and count
    const manifestPath = 'migration-reports/staging-authoritative-manifest.json';
    if (!fs.existsSync(manifestPath)) {
        console.error('ERROR: Staging manifest file not found!');
        process.exit(1);
    }
    const manifestStr = fs.readFileSync(manifestPath, 'utf-8');
    const manifestSha = crypto.createHash('sha256').update(manifestStr).digest('hex');

    if (manifestSha !== EXPECTED_STAGING_MANIFEST_SHA256) {
        console.error(`ERROR: Staging manifest hash mismatch! Found: ${manifestSha}, Expected: ${EXPECTED_STAGING_MANIFEST_SHA256}`);
        process.exit(1);
    }

    let manifestData: any[];
    try {
        manifestData = JSON.parse(manifestStr);
    } catch (e: any) {
        console.error(`ERROR: Staging manifest JSON is invalid/truncated: ${e.message}`);
        process.exit(1);
    }

    if (!Array.isArray(manifestData) || manifestData.length !== EXPECTED_STAGING_COUNT) {
        console.error(`ERROR: Staging manifest count mismatch! Found: ${manifestData?.length}, Expected: ${EXPECTED_STAGING_COUNT}`);
        process.exit(1);
    }
    console.log('✔ Staging manifest count and fingerprint verified.');

    // 3. Verify production payload hash and count
    const payloadPath = 'migration-reports/production-payload-manifest.json';
    if (!fs.existsSync(payloadPath)) {
        console.error('ERROR: Production payload manifest file not found!');
        process.exit(1);
    }
    const payloadStr = fs.readFileSync(payloadPath, 'utf-8');
    const payloadSha = crypto.createHash('sha256').update(payloadStr).digest('hex');

    if (payloadSha !== EXPECTED_PAYLOAD_SHA256) {
        console.error(`ERROR: Production payload hash mismatch! Found: ${payloadSha}, Expected: ${EXPECTED_PAYLOAD_SHA256}`);
        process.exit(1);
    }

    let payloadData: any[];
    try {
        payloadData = JSON.parse(payloadStr);
    } catch (e: any) {
        console.error(`ERROR: Production payload JSON is invalid/truncated: ${e.message}`);
        process.exit(1);
    }

    if (!Array.isArray(payloadData) || payloadData.length !== EXPECTED_STAGING_COUNT) {
        console.error(`ERROR: Production payload count mismatch! Found: ${payloadData?.length}, Expected: ${EXPECTED_STAGING_COUNT}`);
        process.exit(1);
    }
    console.log('✔ Production payload count and fingerprint verified.');

    // 4. Verify no duplicate IDs or source keys in payload
    const payloadIds = new Set<string>();
    const payloadSourceKeys = new Set<string>();
    for (const doc of payloadData) {
        if (!doc.targetCollection || !doc.documentId || !doc.sourceKey) {
            console.error('ERROR: Payload item is missing required fields (targetCollection, documentId, sourceKey)');
            process.exit(1);
        }
        const uniqueKey = `${doc.targetCollection}|${doc.documentId}`;
        if (payloadIds.has(uniqueKey)) {
            console.error(`ERROR: Duplicate document ID in production payload: ${uniqueKey}`);
            process.exit(1);
        }
        payloadIds.add(uniqueKey);

        if (payloadSourceKeys.has(doc.sourceKey)) {
            console.error(`ERROR: Duplicate source key in production payload: ${doc.sourceKey}`);
            process.exit(1);
        }
        payloadSourceKeys.add(doc.sourceKey);
    }
    console.log('✔ Production payload uniqueness and consistency verified.');

    // 5. Verify GCP Authentication & Project Matching
    let authProjectId = '';
    try {
        const auth = new GoogleAuth({
            scopes: 'https://www.googleapis.com/auth/cloud-platform'
        });
        authProjectId = await auth.getProjectId();
        console.log(`Authenticated GCP Project ID: ${authProjectId}`);
    } catch (e: any) {
        console.error(`ERROR: GCP authentication failed: ${e.message}`);
        process.exit(1);
    }

    if (authProjectId !== EXPECTED_PROJECT_ID) {
        console.error(`ERROR: Authentication project mismatch! Authenticated: ${authProjectId}, Expected: ${EXPECTED_PROJECT_ID}`);
        process.exit(1);
    }
    console.log('✔ Authenticated project matches expected production project.');

    // 6. Initialize Firestore explicitly targeting the named database
    let app;
    if (process.env.SERVICE_ACCOUNT_CREDENTIALS && process.env.SERVICE_ACCOUNT_CREDENTIALS.startsWith('{')) {
        const creds = JSON.parse(process.env.SERVICE_ACCOUNT_CREDENTIALS);
        app = initializeApp({
            projectId: EXPECTED_PROJECT_ID,
            credential: cert(creds)
        });
    } else {
        app = initializeApp({
            projectId: EXPECTED_PROJECT_ID,
            credential: applicationDefault()
        });
    }

    const db = getFirestore(app, EXPECTED_DATABASE_ID);
    console.log(`Initialized Firestore targeting database: ${EXPECTED_DATABASE_ID}`);

    const dbDatabaseId = (db as any).databaseId || (db as any)._databaseId;
    if (dbDatabaseId !== EXPECTED_DATABASE_ID) {
        console.error(`ERROR: Named database is incorrect! Found: ${dbDatabaseId}, Expected: ${EXPECTED_DATABASE_ID}`);
        process.exit(1);
    }
    console.log('✔ Named database verified.');

    // 7. Verify source staging collection matches expected document count
    console.log('Checking orders_migration_staging collection size...');
    try {
        const stagingSnap = await db.collection('orders_migration_staging').get();
        if (stagingSnap.size !== EXPECTED_STAGING_COUNT) {
            console.error(`ERROR: Firestore staging collection size mismatch! Found: ${stagingSnap.size}, Expected: ${EXPECTED_STAGING_COUNT}`);
            process.exit(1);
        }
        console.log('✔ Firestore staging document count verified in target database.');
    } catch (e: any) {
        console.error(`ERROR: Firestore staging verification failed: ${e.message}`);
        process.exit(1);
    }

    // 8. Verify target collections are empty before write
    console.log('Checking if production target collections are empty...');
    try {
        const ordersSnap = await db.collection('orders').limit(1).get();
        if (!ordersSnap.empty) {
            console.error('ERROR: Production collection "orders" is NOT empty!');
            process.exit(1);
        }
        const archiveSnap = await db.collection('orders_archive').limit(1).get();
        if (!archiveSnap.empty) {
            console.error('ERROR: Production collection "orders_archive" is NOT empty!');
            process.exit(1);
        }
        console.log('✔ Production target collections are empty.');
    } catch (e: any) {
        console.error(`ERROR: Firestore target collection verification failed: ${e.message}`);
        process.exit(1);
    }

    // --- HARD EXECUTION GUARD: REQUIRE EXPLICIT DRY RUN BY DEFAULT ---
    if (!runWrite) {
        console.log('\n✔ All execution guards and checks PASSED successfully!');
        if (!hasConfirm) {
            console.log('PREFLIGHT COMPLETE. To proceed further, you must provide: --confirm-production-write');
        } else {
            console.log('DRY RUN COMPLETE. To execute the production write, you must supply: --execute-write-now');
        }
        return;
    }

    console.log('\n=========================================');
    console.log('WARNING: EXECUTING LIVE PRODUCTION WRITE!');
    console.log('=========================================');

    // Batch writing of production payload (not executed under current task rules)
    console.log('Migration execution is currently disabled for safety.');
}

if (process.env.NODE_ENV !== 'test') {
    main().catch(e => {
        console.error('Migration failed:', e);
        process.exit(1);
    });
}
