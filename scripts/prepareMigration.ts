import * as fs from 'fs';
import * as crypto from 'crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

async function prepare() {
    const filePath = 'migration-reports/audit-rows.json';
    if (!fs.existsSync(filePath)) {
        console.error('Audit rows not found.');
        process.exit(1);
    }

    const content = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    console.log(`SOURCE_FINGERPRINT: ${hash}`);

    const serviceAccount = JSON.parse(fs.readFileSync('scripts/service-account.json', 'utf-8'));
    console.log(`SERVICE_ACCOUNT_EMAIL: ${serviceAccount.client_email}`);
    console.log(`SERVICE_ACCOUNT_PROJECT_ID: ${serviceAccount.project_id}`);

    const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
    console.log(`CONFIG_PROJECT_ID: ${config.projectId}`);

    // Initialize Admin SDK
    try {
        const sandboxProjectId = 'ais-asia-east1-870a50fa75dd4c8';
        initializeApp({
            projectId: sandboxProjectId
        });
        console.log(`Initialized Admin SDK for project: ${sandboxProjectId}`);
    } catch (e: any) {
        if (e.code === 'app/duplicate-app') {
            console.log('Admin SDK already initialized.');
        } else {
            throw e;
        }
    }

    const db = getFirestore();
    const collectionName = 'orders_migration_staging';
    
    try {
        console.log(`Checking collection: ${collectionName}...`);
        const snapshot = await db.collection(collectionName).limit(1).get();
        console.log(`TARGET_COLLECTION: ${collectionName}`);
        console.log(`COLLECTION_EMPTY: ${snapshot.empty}`);
        if (!snapshot.empty) {
            console.warn('WARNING: Collection is NOT empty!');
        }
    } catch (e: any) {
        console.error('Error accessing Firestore:', e.message);
        if (e.stack) console.error(e.stack);
        
        // Try to list collections as a fallback test
        try {
            console.log('Attempting to list collections...');
            const collections = await db.listCollections();
            console.log('Collections found:', collections.map(c => c.id));
        } catch (e2: any) {
            console.error('Failed to list collections:', e2.message);
        }
    }
}

prepare().catch(console.error);
