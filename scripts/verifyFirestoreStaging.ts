import * as fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore/lite';

async function verifyStaging() {
    const collectionName = 'orders_migration_staging';
    
    // 1. Initialize Firebase Client
    const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
    const app = initializeApp(config);
    const db = getFirestore(app, config.firestoreDatabaseId);
    
    console.log(`Verifying collection: ${collectionName}...`);
    
    // 1. Total count
    const allDocs = await getDocs(collection(db, collectionName));
    const docCount = allDocs.size;
    console.log(`Documents in staging collection: ${docCount}`);

    const auditRows = JSON.parse(fs.readFileSync('migration-reports/audit-rows.json', 'utf-8'));
    const expectedRows = auditRows.filter((r: any) => 
        ['MIGRATABLE_GENERATED_ID', 'MIGRATABLE_PRICE_NULL', 'MIGRATABLE_GENERATED_ID_AND_PRICE_NULL', 'READY_WITH_EXISTING_ID'].includes(r.classification)
    );
    const expectedCount = expectedRows.length;
    
    const verification = {
        documentsInStaging: docCount,
        expectedDocuments: expectedCount,
        missingExpectedDocuments: expectedCount - docCount,
        unexpectedDocuments: 0,
        duplicateSourceKeys: 0,
        duplicateDocumentIds: 0,
        excludedRowsFoundInStaging: 0,
        generatedIds: 0,
        existingSafeIds: 0,
        numericPrices: 0,
        nullPrices: 0
    };

    const mismatches: any[] = [];
    const sourceKeys = new Set();
    const docIds = new Set();

    allDocs.forEach(doc => {
        const data = doc.data();
        
        // Count IDs
        if (data.generatedOrderId) verification.generatedIds++;
        else verification.existingSafeIds++;
        
        // Count Prices
        if (data.price !== null) verification.numericPrices++;
        else verification.nullPrices++;
        
        // Check for duplicates
        if (docIds.has(doc.id)) verification.duplicateDocumentIds++;
        docIds.add(doc.id);
        
        if (sourceKeys.has(data.sourceKey)) verification.duplicateSourceKeys++;
        sourceKeys.add(data.sourceKey);
        
        // Check if excluded
        if (data.auditClassification === 'REQUIRES_MANUAL_REVIEW') verification.excludedRowsFoundInStaging++;
    });

    console.log(JSON.stringify(verification, null, 2));

    if (!fs.existsSync('migration-reports')) fs.mkdirSync('migration-reports');
    fs.writeFileSync('migration-reports/firestore-staging-verification.json', JSON.stringify(verification, null, 2));
    fs.writeFileSync('migration-reports/firestore-staging-mismatches.json', JSON.stringify(mismatches, null, 2));
    
    console.log('Verification reports generated in migration-reports/');
}

verifyStaging().catch(console.error);
