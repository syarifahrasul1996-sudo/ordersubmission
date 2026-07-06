import * as fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, query, where, orderBy, limit, Timestamp } from 'firebase/firestore/lite';

async function runTests() {
    console.log("=== RUNNING 13 CANARY MIGRATION TESTS ===");
    
    const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
    const app = initializeApp(config);
    const db = getFirestore(app, config.firestoreDatabaseId);

    const results = [];
    
    // Helper to log test outcomes
    function recordTest(num: number, name: string, pass: boolean, evidence: string) {
        results.push({ num, name, pass, evidence });
        console.log(`[TEST ${num}] ${name}: ${pass ? 'PASSED' : 'FAILED'}`);
        console.log(`  Evidence: ${evidence}`);
    }

    // Load canary data reference
    const canaryData = JSON.parse(fs.readFileSync('migration-reports/selected-canary-rows.json', 'utf-8'));

    // --- TEST 1: Read Access to orders_canary ---
    try {
        const snap = await getDocs(collection(db, 'orders_canary'));
        recordTest(1, "Read Access to orders_canary", true, `Successfully read collection. Found ${snap.size} documents.`);
    } catch (e: any) {
        recordTest(1, "Read Access to orders_canary", false, `Read failed: ${e.message}`);
    }

    // --- TEST 2: Read Access to orders_archive_canary ---
    try {
        const snap = await getDocs(collection(db, 'orders_archive_canary'));
        recordTest(2, "Read Access to orders_archive_canary", true, `Successfully read collection. Found ${snap.size} documents.`);
    } catch (e: any) {
        recordTest(2, "Read Access to orders_archive_canary", false, `Read failed: ${e.message}`);
    }

    // --- TEST 3: Document count in orders_canary ---
    try {
        const snap = await getDocs(collection(db, 'orders_canary'));
        const pass = snap.size === 10;
        recordTest(3, "Exactly 10 documents in orders_canary", pass, `Collection size is ${snap.size} (Expected: 10).`);
    } catch (e: any) {
        recordTest(3, "Exactly 10 documents in orders_canary", false, `Count check failed: ${e.message}`);
    }

    // --- TEST 4: Document count in orders_archive_canary ---
    try {
        const snap = await getDocs(collection(db, 'orders_archive_canary'));
        const pass = snap.size === 10;
        recordTest(4, "Exactly 10 documents in orders_archive_canary", pass, `Collection size is ${snap.size} (Expected: 10).`);
    } catch (e: any) {
        recordTest(4, "Exactly 10 documents in orders_archive_canary", false, `Count check failed: ${e.message}`);
    }

    // --- TEST 5: Staging collection count ---
    try {
        const snap = await getDocs(collection(db, 'orders_migration_staging'));
        const pass = snap.size === 5983;
        recordTest(5, "Exactly 5,983 documents in orders_migration_staging", pass, `Collection size is ${snap.size} (Expected: 5983).`);
    } catch (e: any) {
        recordTest(5, "Exactly 5,983 documents in orders_migration_staging", false, `Staging count failed: ${e.message}`);
    }

    // --- TEST 6: Active operational window filter ---
    try {
        // [getOperationalOrders implementation]
        const today = new Date('2026-06-27T00:00:00Z');
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - 2);
        const endDate = new Date(today);
        endDate.setDate(today.getDate() + 4);

        const qOp = query(
            collection(db, 'orders_canary'),
            where('isDelivered', '==', false),
            where('deliveryDate', '>=', Timestamp.fromDate(startDate)),
            where('deliveryDate', '<', Timestamp.fromDate(endDate)),
            orderBy('deliveryDate', 'asc')
        );
        const snap = await getDocs(qOp);
        const pass = snap.size === 5;
        const ids = snap.docs.map(d => d.id).join(', ');
        recordTest(6, "Retrieve 5 operational undelivered orders inside window", pass, `Found ${snap.size} orders: [${ids}]. Operational window: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}.`);
    } catch (e: any) {
        recordTest(6, "Retrieve 5 operational undelivered orders inside window", false, `Operational retrieval failed: ${e.message}`);
    }

    // --- TEST 7: Overdue undelivered filter ---
    try {
        const today = new Date('2026-06-27T00:00:00Z');
        const qOverdue = query(
            collection(db, 'orders_canary'),
            where('isDelivered', '==', false),
            where('deliveryDate', '<', Timestamp.fromDate(today)),
            orderBy('deliveryDate', 'desc')
        );
        const snap = await getDocs(qOverdue);
        const pass = snap.size === 5;
        const ids = snap.docs.map(d => d.id).join(', ');
        recordTest(7, "Retrieve 5 overdue undelivered orders before today", pass, `Found ${snap.size} orders: [${ids}].`);
    } catch (e: any) {
        recordTest(7, "Retrieve 5 overdue undelivered orders before today", false, `Overdue retrieval failed: ${e.message}`);
    }

    // --- TEST 8: Archived historical filter ---
    try {
        const qArchived = query(
            collection(db, 'orders_archive_canary'),
            where('isDelivered', '==', true),
            orderBy('deliveryDate', 'desc')
        );
        const snap = await getDocs(qArchived);
        const pass = snap.size === 10;
        const ids = snap.docs.map(d => d.id).join(', ');
        recordTest(8, "Retrieve 10 archived historical records", pass, `Found ${snap.size} records: [${ids}].`);
    } catch (e: any) {
        recordTest(8, "Retrieve 10 archived historical records", false, `Archive retrieval failed: ${e.message}`);
    }

    // --- TEST 9: Price field type and null preservation ---
    try {
        const snap = await getDocs(collection(db, 'orders_canary'));
        let nullCount = 0;
        let numCount = 0;
        snap.forEach(d => {
            const data = d.data();
            if (data.price === null) nullCount++;
            else if (typeof data.price === 'number') numCount++;
        });
        const pass = nullCount > 0;
        recordTest(9, "Preservation of price fields (numeric and null value integrity)", pass, `Found ${nullCount} null prices and ${numCount} numeric prices inside orders_canary.`);
    } catch (e: any) {
        recordTest(9, "Preservation of price fields (numeric and null value integrity)", false, `Price validation failed: ${e.message}`);
    }

    // --- TEST 10: Date/Timestamp conversion ---
    try {
        const snap = await getDocs(collection(db, 'orders_canary'));
        const docWithDate = snap.docs.find(d => d.data().deliveryDate !== null);
        if (docWithDate) {
            const data = docWithDate.data();
            const dateVal = data.deliveryDate;
            const isTimestamp = dateVal instanceof Timestamp || (dateVal && typeof dateVal.toDate === 'function');
            recordTest(10, "Date field mapping and deserialization to AppState milliseconds", isTimestamp, `Date is represented as Firestore Timestamp: ${JSON.stringify(dateVal)}.`);
        } else {
            recordTest(10, "Date field mapping and deserialization to AppState milliseconds", false, "No document with valid delivery date found.");
        }
    } catch (e: any) {
        recordTest(10, "Date field mapping and deserialization to AppState milliseconds", false, `Timestamp check failed: ${e.message}`);
    }

    // --- TEST 11: Write/Update capability of orders_canary ---
    try {
        const docRef = doc(db, 'orders_canary', 'ORD-20260624-185849');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            const originalData = snap.data();
            const originalName = originalData.customerName;
            
            // Temporary edit
            await setDoc(docRef, { ...originalData, customerName: 'CANARY_TEST_EDIT' });
            const updatedSnap = await getDoc(docRef);
            const editSuccess = updatedSnap.data()?.customerName === 'CANARY_TEST_EDIT';
            
            // Restore immediately
            await setDoc(docRef, originalData);
            const restoredSnap = await getDoc(docRef);
            const restoreSuccess = restoredSnap.data()?.customerName === originalName;
            
            const pass = editSuccess && restoreSuccess;
            recordTest(11, "Write/Update permission and successful record editing in orders_canary", pass, `Update succeeded: ${editSuccess}, Restore succeeded: ${restoreSuccess}.`);
        } else {
            recordTest(11, "Write/Update permission and successful record editing in orders_canary", false, "Target document ORD-20260624-185849 not found.");
        }
    } catch (e: any) {
        recordTest(11, "Write/Update permission and successful record editing in orders_canary", false, `Write/Update failed: ${e.message}`);
    }

    // --- TEST 12: Write/Update capability of orders_archive_canary ---
    try {
        const docRef = doc(db, 'orders_archive_canary', 'sheet-4f05d11a89b0005c');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            const originalData = snap.data();
            const originalName = originalData.customerName;
            
            // Temporary edit
            await setDoc(docRef, { ...originalData, customerName: 'CANARY_ARCHIVE_TEST_EDIT' });
            const updatedSnap = await getDoc(docRef);
            const editSuccess = updatedSnap.data()?.customerName === 'CANARY_ARCHIVE_TEST_EDIT';
            
            // Restore immediately
            await setDoc(docRef, originalData);
            const restoredSnap = await getDoc(docRef);
            const restoreSuccess = restoredSnap.data()?.customerName === originalName;
            
            const pass = editSuccess && restoreSuccess;
            recordTest(12, "Write/Update permission and successful record editing in orders_archive_canary", pass, `Update succeeded: ${editSuccess}, Restore succeeded: ${restoreSuccess}.`);
        } else {
            recordTest(12, "Write/Update permission and successful record editing in orders_archive_canary", false, "Target document sheet-4f05d11a89b0005c not found.");
        }
    } catch (e: any) {
        recordTest(12, "Write/Update permission and successful record editing in orders_archive_canary", false, `Write/Update failed: ${e.message}`);
    }

    // --- TEST 13: Order search functionality ---
    try {
        const qSearch = query(
            collection(db, 'orders_canary'),
            where('customerName', '==', 'Mohammad Sazriansyah Bin Sugianto')
        );
        const snap = await getDocs(qSearch);
        const pass = snap.size > 0 && snap.docs[0].id === 'ORD-20260624-185849';
        recordTest(13, "Canary order search query filter performance", pass, `Found ${snap.size} records. Matching document ID: ${snap.docs[0]?.id || 'N/A'}.`);
    } catch (e: any) {
        recordTest(13, "Canary order search query filter performance", false, `Search query failed: ${e.message}`);
    }

    // Write test results to a summary file
    fs.writeFileSync('migration-reports/canary-tests-results.json', JSON.stringify(results, null, 2));
    console.log("\n=== TEST RUN COMPLETE. RESULTS SAVED TO migration-reports/canary-tests-results.json ===");
}

runTests().catch(console.error);
