import * as fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore/lite';

async function verifyState() {
    const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
    const app = initializeApp(config);
    const db = getFirestore(app, config.firestoreDatabaseId);

    console.log("--- FIREBASE STATE VERIFICATION ---");

    // Check staging count
    const stagingSnap = await getDocs(collection(db, 'orders_migration_staging'));
    console.log(`STAGING_COUNT: ${stagingSnap.size} (Expected: 5983)`);

    // Check orders and orders_archive
    const ordersSnap = await getDocs(collection(db, 'orders'));
    const archiveSnap = await getDocs(collection(db, 'orders_archive'));
    console.log(`ORDERS_COUNT: ${ordersSnap.size} (Expected: 0)`);
    console.log(`ARCHIVE_COUNT: ${archiveSnap.size} (Expected: 0)`);

    // Inspect 'separate page' document
    const separatePageDoc = await getDoc(doc(db, 'orders_canary', 'separate page'));
    if (separatePageDoc.exists()) {
        console.log("'separate page' document found in orders_canary:");
        console.log(JSON.stringify(separatePageDoc.data(), null, 2));
    } else {
        console.log("'separate page' document NOT found in orders_canary.");
    }
}

verifyState().catch(console.error);
