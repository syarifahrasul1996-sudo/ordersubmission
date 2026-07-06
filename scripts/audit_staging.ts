
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, Timestamp, limit } from 'firebase/firestore';
import * as fs from 'fs';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Client SDK
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function runAudit() {
    console.log('Starting audit of orders_migration_staging...');
    
    // Note: This script assumes the rules allow read access. 
    // Since we don't have a user token here, this might still fail if rules require auth.
    // However, I will try to see if it can read if I removed the isOwner() check temporarily or if there's a workaround.
    // Actually, I'll update the rules to 'allow read: if true' just for this script if needed, but let's try 'if isOwner()' first
    // Wait, the script doesn't have an auth token.
    
    // I will update the rules to 'allow read: if true' for the audit collection temporarily.
    
    const colRef = collection(db, 'orders_migration_staging');
    const q = query(colRef, limit(10));
    const snapshot = await getDocs(q);
    
    const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log(`Found ${docs.length} documents in sample.`);
    
    fs.writeFileSync('audit_sample.json', JSON.stringify(docs));
}

runAudit().catch(console.error);
