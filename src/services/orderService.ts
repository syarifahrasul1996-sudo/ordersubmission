import { getDb } from '../lib/firebase';
import { 
    collection, 
    query, 
    where, 
    orderBy, 
    limit, 
    getDocs, 
    doc, 
    setDoc, 
    getDoc,
    deleteDoc,
    Timestamp 
} from 'firebase/firestore';
import { AppState } from '../types';
import { handleFirestoreError, OperationType } from './firestoreUtils';
import { normalizeJenis } from '../utils';

const db = getDb();

/**
 * Captures and returns a lightweight call stack trace to identify which logic paths triggered the database write.
 */
function getCallerTrace(): string {
    try {
        const err = new Error();
        const stack = err.stack;
        if (!stack) return "Unknown caller path (stack trace unavailable)";
        const lines = stack.split('\n');
        // Filter out frames that are internal to Error, getCallerTrace or orderService itself
        const filtered = lines
            .slice(1) // Skip "Error" header
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.includes('getCallerTrace') && !line.includes('Error'));
        return filtered.slice(0, 4).join(' -> ');
    } catch (e) {
        return "Trace capture failed";
    }
}

export const orderDataSource = "sheets";
export const isFirestoreCanary = true;

/**
 * Maps a Firestore document to AppState structure.
 */
export function mapFirestoreDocToAppState(docId: string, data: any): AppState {
    const deliveryDateMillis = data.deliveryDate instanceof Timestamp 
        ? data.deliveryDate.toMillis() 
        : (data.deliveryDate && typeof data.deliveryDate.toMillis === 'function' 
            ? data.deliveryDate.toMillis() 
            : (data.deliveryDate?.seconds ? data.deliveryDate.seconds * 1000 : null));

    const lastUpdatedMillis = data.lastUpdated instanceof Timestamp 
        ? data.lastUpdated.toMillis() 
        : (data.lastUpdated && typeof data.lastUpdated.toMillis === 'function' 
            ? data.lastUpdated.toMillis() 
            : (data.lastUpdated?.seconds ? data.lastUpdated.seconds * 1000 : (typeof data.lastUpdated === 'number' ? data.lastUpdated : null)));

    return {
        mainType: data.customerOrder === 'Resume' ? 'Resume' : (data.customerOrder === 'Surat' ? 'Surat' : 'Lain-lain'),
        subType: '',
        urgency: data.customerJenis === 'Urgent' ? 'urgent' : (data.customerJenis === 'Super Urgent' ? 'super' : (data.customerJenis === 'Semi Urgent' ? 'semi' : 'noturgent')),
        baseHours: 0,
        addons: data.customerAddOn ? [data.customerAddOn] : [],
        template: data.customerTemplate || '',
        language: data.customerBahasa === 'English' ? 'en' : 'ms',
        softcopyLang: data.customerBahasa || 'Melayu',
        clLangs: [],
        resumeLangs: [],
        isEditMode: false,
        extraHours: 0,
        customDoc: '',
        spreadsheetId: data.sourceSpreadsheetId || '',
        timestamp: deliveryDateMillis || Date.now(),
        historyId: docId,
        customerName: data.customerName || '',
        customerPhone: data.customerPhone || '',
        customerOrder: data.customerOrder || '',
        customerTemplate: data.customerTemplate || '',
        customerBahasa: data.customerBahasa || '',
        customerAddOn: data.customerAddOn || '',
        customerJenis: normalizeJenis(data.customerJenis || ''),
        customerDue: data.originalDue || '',
        dueTimestamp: deliveryDateMillis || undefined,
        isDelivered: data.isDelivered || false,
        orderLink: data.orderLink || '',
        googleSheetLink: data.orderLink || '',
        orderId: data.documentId || docId,
        price: typeof data.price === 'number' ? data.price : undefined,
        status: data.status || undefined,
        type: data.type || undefined,
        lastModifiedLocally: data.lastModifiedLocally || undefined,
        lastUpdated: lastUpdatedMillis || undefined,
        version: typeof data.version === 'number' ? data.version : 1,
        isDeleted: data.isDeleted || false,
        messages: data.messages || []
    };
}

/**
 * Converts AppState back to Firestore operational document structure,
 * preserving migratedAt if updating, or setting new server timestamp.
 */
export function mapAppStateToFirestoreDoc(state: AppState) {
    let deliveryDate: Timestamp | null = null;
    if (state.dueTimestamp) {
        deliveryDate = Timestamp.fromMillis(state.dueTimestamp);
    }

    return {
        documentId: state.orderId || state.historyId,
        originalOrderId: state.orderId || null,
        generatedOrderId: false,
        customerName: state.customerName || '',
        customerPhone: state.customerPhone || '',
        customerOrder: state.customerOrder || '',
        customerTemplate: state.customerTemplate || '',
        customerBahasa: state.customerBahasa || '',
        customerAddOn: state.customerAddOn || '',
        customerJenis: normalizeJenis(state.customerJenis || ''),
        deliveryDate: deliveryDate,
        originalDue: state.customerDue || '',
        orderLink: state.orderLink || '',
        price: typeof state.price === 'number' ? state.price : null,
        isDelivered: state.isDelivered || false,
        migrationVersion: '1.0-canary',
        migratedAt: Timestamp.fromDate(new Date()),
        lastModifiedLocally: state.lastModifiedLocally || null,
        lastUpdated: state.lastUpdated ? Timestamp.fromMillis(state.lastUpdated) : Timestamp.fromDate(new Date()),
        version: typeof state.version === 'number' ? state.version : 1,
        isDeleted: state.isDeleted || false,
        messages: state.messages || []
    };
}

/**
 * Fetch 50 operational undelivered orders within window.
 */
export async function getOperationalOrders(): Promise<AppState[]> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const startDate = new Date(today);
    startDate.setUTCDate(today.getUTCDate() - 2);

    const endDate = new Date(today);
    endDate.setUTCDate(today.getUTCDate() + 4);

    console.log(`[orderService] [getOperationalOrders] Fetching active orders from 'orders_canary' inside window [${startDate.toISOString()} to ${endDate.toISOString()}]`);

    const q = query(
        collection(db, 'orders_canary'),
        where('isDelivered', '==', false),
        where('deliveryDate', '>=', Timestamp.fromDate(startDate)),
        where('deliveryDate', '<', Timestamp.fromDate(endDate)),
        orderBy('deliveryDate', 'asc'),
        limit(50)
    );

    try {
        console.log('[FIRESTORE_DIAGNOSTIC] [getOperationalOrders] EXECUTING getDocs (orders_canary query) at:', new Date().toISOString());
        const snap = await getDocs(q);
        console.log(`[orderService] [getOperationalOrders] Found ${snap.size} documents.`);
        return snap.docs
            .map(doc => mapFirestoreDocToAppState(doc.id, doc.data()))
            .filter(state => state.status !== 'draft' && state.type !== 'draft' && state.customerOrder !== 'draft' && !state.historyId?.startsWith('draft_'));
    } catch (error) {
        console.error(`[orderService] [getOperationalOrders] Failed:`, error);
        handleFirestoreError(error, OperationType.LIST, 'orders_canary');
        return [];
    }
}

/**
 * Fetch overdue undelivered orders (due < today).
 */
export async function getOverdueOrders(): Promise<AppState[]> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    console.log(`[orderService] [getOverdueOrders] Fetching overdue orders from 'orders_canary' (deliveryDate < ${today.toISOString()})`);

    const q = query(
        collection(db, 'orders_canary'),
        where('isDelivered', '==', false),
        where('deliveryDate', '<', Timestamp.fromDate(today)),
        orderBy('deliveryDate', 'desc')
    );

    try {
        console.log('[FIRESTORE_DIAGNOSTIC] [getOverdueOrders] EXECUTING getDocs (orders_canary overdue query) at:', new Date().toISOString());
        const snap = await getDocs(q);
        console.log(`[orderService] [getOverdueOrders] Found ${snap.size} documents.`);
        return snap.docs
            .map(doc => mapFirestoreDocToAppState(doc.id, doc.data()))
            .filter(state => state.status !== 'draft' && state.type !== 'draft' && state.customerOrder !== 'draft' && !state.historyId?.startsWith('draft_'));
    } catch (error) {
        console.error(`[orderService] [getOverdueOrders] Failed:`, error);
        handleFirestoreError(error, OperationType.LIST, 'orders_canary');
        return [];
    }
}

/**
 * Fetch delivered historical records.
 */
export async function getArchivedOrders(): Promise<AppState[]> {
    console.log(`[orderService] [getArchivedOrders] Fetching archived orders from 'orders_archive_canary'`);

    const q = query(
        collection(db, 'orders_archive_canary'),
        where('isDelivered', '==', true),
        orderBy('deliveryDate', 'desc'),
        limit(50)
    );

    try {
        console.log('[FIRESTORE_DIAGNOSTIC] [getArchivedOrders] EXECUTING getDocs (orders_archive_canary query) at:', new Date().toISOString());
        const snap = await getDocs(q);
        console.log(`[orderService] [getArchivedOrders] Found ${snap.size} documents.`);
        return snap.docs
            .map(doc => mapFirestoreDocToAppState(doc.id, doc.data()))
            .filter(state => state.status !== 'draft' && state.type !== 'draft' && state.customerOrder !== 'draft' && !state.historyId?.startsWith('draft_'));
    } catch (error) {
        console.error(`[orderService] [getArchivedOrders] Failed:`, error);
        handleFirestoreError(error, OperationType.LIST, 'orders_archive_canary');
        return [];
    }
}

/**
 * Saves or updates an order in the appropriate canary collection.
 * Returns the updated conflict-resolved lastUpdated timestamp and version on success.
 */
export async function saveOrderToFirestore(state: AppState): Promise<{ lastUpdated: number; version: number } | null> {
    const docId = state.orderId || state.historyId;
    if (!docId) throw new Error("Order ID is missing.");

    const isDelivered = state.isDelivered || false;
    const collectionName = isDelivered ? 'orders_archive_canary' : 'orders_canary';
    const altCollectionName = isDelivered ? 'orders_canary' : 'orders_archive_canary';

    const docRef = doc(db, collectionName, docId);
    const altDocRef = doc(db, altCollectionName, docId);
    
    console.log(`[orderService] [saveOrderToFirestore] saving order ID ${docId} to ${collectionName}. State:`, JSON.stringify(state));

    try {
        // Check if document already exists to preserve migratedAt and prevent older overwrites
        console.log(`[orderService] [saveOrderToFirestore] checking existence of ${docId} in both active & archived collections to prevent overwrite conflicts`);
        
        // Fetch from both to make sure we catch if it shifted collections
        const [activeSnap, archiveSnap] = await Promise.all([
            getDoc(doc(db, 'orders_canary', docId)),
            getDoc(doc(db, 'orders_archive_canary', docId))
        ]);

        let existingData: any = null;
        if (activeSnap.exists()) {
            existingData = activeSnap.data();
        } else if (archiveSnap.exists()) {
            existingData = archiveSnap.data();
        }

        const docData = mapAppStateToFirestoreDoc(state);
        const writeTime = Date.now();
        let finalVersion = 1;

        if (existingData) {
            if (existingData.migratedAt) {
                docData.migratedAt = existingData.migratedAt;
            }
            
            // Conflict check: compare incoming local state against existing db state
            const existingLastUpdated = existingData.lastUpdated instanceof Timestamp 
                ? existingData.lastUpdated.toMillis() 
                : (existingData.lastUpdated?.seconds ? existingData.lastUpdated.seconds * 1000 : Number(existingData.lastUpdated) || 0);
            
            const existingModified = Number(existingData.lastModifiedLocally) || existingLastUpdated || 0;
            const incomingModified = Number(state.lastModifiedLocally) || Number(state.lastUpdated) || 0;
            const existingVersion = Number(existingData.version) || 1;
            
            if (existingModified > incomingModified) {
                console.warn(`[orderService] [saveOrderToFirestore] Overwrite prevented for order ID ${docId}. Remote db is newer (remote: ${existingModified}, local: ${incomingModified}).`);
                return null;
            }

            // Increment version and set lastUpdated to now for this write
            finalVersion = existingVersion + 1;
            docData.version = finalVersion;
            docData.lastUpdated = Timestamp.fromMillis(writeTime);
        } else {
            finalVersion = 1;
            docData.version = finalVersion;
            docData.lastUpdated = Timestamp.fromMillis(writeTime);
        }

        console.log(`[orderService] [saveOrderToFirestore] setDoc on ${collectionName}/${docId} with data:`, JSON.stringify(docData));
        console.log('[FIRESTORE_DIAGNOSTIC] [saveOrderToFirestore] EXECUTING setDoc on:', collectionName, '/', docId, 'data:', JSON.stringify(docData), 'at:', new Date().toISOString());
        console.debug(`[FIRESTORE_DIAGNOSTIC] [saveOrderToFirestore] [BEFORE WRITE] Type: tempahan, Collection: ${collectionName}, DocID: ${docId}, Timestamp: ${new Date().toISOString()}, CallerTrace: ${getCallerTrace()}, Payload:`, JSON.stringify(docData));
        await setDoc(docRef, docData);
        console.debug(`[FIRESTORE_DIAGNOSTIC] [saveOrderToFirestore] [AFTER WRITE] Type: tempahan, Collection: ${collectionName}, DocID: ${docId}, Timestamp: ${new Date().toISOString()} - Write successful.`);

        console.log(`[orderService] [saveOrderToFirestore] deleting from alt collection ${altCollectionName}/${docId}`);
        console.log('[FIRESTORE_DIAGNOSTIC] [saveOrderToFirestore] EXECUTING deleteDoc on:', altCollectionName, '/', docId, 'at:', new Date().toISOString());
        await deleteDoc(altDocRef).catch((e) => {
            console.log(`[orderService] [saveOrderToFirestore] optional alt collection cleanup no-op for ${docId}:`, e);
        });

        return { lastUpdated: writeTime, version: finalVersion };
    } catch (error) {
        console.error(`[orderService] [saveOrderToFirestore] Failed:`, error);
        handleFirestoreError(error, OperationType.WRITE, collectionName);
        return null;
    }
}

/**
 * Deletes an order from both Canary collections in Firestore.
 */
export async function deleteOrderFromFirestore(orderId: string): Promise<void> {
    const activeRef = doc(db, 'orders_canary', orderId);
    const archiveRef = doc(db, 'orders_archive_canary', orderId);
    
    console.log(`[orderService] [deleteOrderFromFirestore] Deleting order ID ${orderId} from both active & archive collections`);

    try {
        console.log(`[orderService] [deleteOrderFromFirestore] deleteDoc active ${orderId}`);
        console.log('[FIRESTORE_DIAGNOSTIC] [deleteOrderFromFirestore] EXECUTING deleteDoc active on orders_canary/', orderId, 'at:', new Date().toISOString());
        console.debug(`[FIRESTORE_DIAGNOSTIC] [deleteOrderFromFirestore] [BEFORE DELETE] Type: tempahan, Collection: orders_canary, DocID: ${orderId}, Timestamp: ${new Date().toISOString()}, CallerTrace: ${getCallerTrace()}`);
        await deleteDoc(activeRef).catch((e) => console.log(`[orderService] [deleteOrderFromFirestore] active delete no-op:`, e));
        console.debug(`[FIRESTORE_DIAGNOSTIC] [deleteOrderFromFirestore] [AFTER DELETE] Type: tempahan, Collection: orders_canary, DocID: ${orderId}, Timestamp: ${new Date().toISOString()} - Delete call processed.`);
        
        console.log(`[orderService] [deleteOrderFromFirestore] deleteDoc archive ${orderId}`);
        console.log('[FIRESTORE_DIAGNOSTIC] [deleteOrderFromFirestore] EXECUTING deleteDoc archive on orders_archive_canary/', orderId, 'at:', new Date().toISOString());
        console.debug(`[FIRESTORE_DIAGNOSTIC] [deleteOrderFromFirestore] [BEFORE DELETE] Type: tempahan, Collection: orders_archive_canary, DocID: ${orderId}, Timestamp: ${new Date().toISOString()}, CallerTrace: ${getCallerTrace()}`);
        await deleteDoc(archiveRef).catch((e) => console.log(`[orderService] [deleteOrderFromFirestore] archive delete no-op:`, e));
        console.debug(`[FIRESTORE_DIAGNOSTIC] [deleteOrderFromFirestore] [AFTER DELETE] Type: tempahan, Collection: orders_archive_canary, DocID: ${orderId}, Timestamp: ${new Date().toISOString()} - Delete call processed.`);
    } catch (error) {
        console.error(`[orderService] [deleteOrderFromFirestore] Failed:`, error);
        handleFirestoreError(error, OperationType.WRITE, 'orders_canary/archive_canary');
    }
}

/**
 * Saves a draft order to Firestore.
 */
export async function saveDraftToFirestore(state: AppState): Promise<void> {
    const draftId = state.historyId || state.orderId;
    if (!draftId) {
        throw new Error("Draft ID is required to save a draft.");
    }

    const docRef = doc(db, 'orders_canary', draftId);
    const docData = {
        ...mapAppStateToFirestoreDoc(state),
        status: 'draft' as const,
        documentId: draftId,
    };

    console.log(`[orderService] [saveDraftToFirestore] setDoc on orders_canary/${draftId} with data:`, JSON.stringify(docData));

    try {
        console.log('[FIRESTORE_DIAGNOSTIC] [saveDraftToFirestore] EXECUTING setDoc on orders_canary/', draftId, 'data:', JSON.stringify(docData), 'at:', new Date().toISOString());
        console.debug(`[FIRESTORE_DIAGNOSTIC] [saveDraftToFirestore] [BEFORE WRITE] Type: draft, Collection: orders_canary, DraftID: ${draftId}, Timestamp: ${new Date().toISOString()}, CallerTrace: ${getCallerTrace()}, Payload:`, JSON.stringify(docData));
        await setDoc(docRef, docData);
        console.debug(`[FIRESTORE_DIAGNOSTIC] [saveDraftToFirestore] [AFTER WRITE] Type: draft, Collection: orders_canary, DraftID: ${draftId}, Timestamp: ${new Date().toISOString()} - Write successful.`);
        console.log(`[orderService] Draft ${draftId} successfully saved to Firestore.`);
    } catch (error) {
        console.error(`[orderService] [saveDraftToFirestore] Failed:`, error);
        handleFirestoreError(error, OperationType.WRITE, 'orders_canary');
    }
}

/**
 * Deletes a draft order from Firestore.
 */
export async function deleteDraftFromFirestore(draftId: string): Promise<void> {
    if (!draftId) return;
    const docRef = doc(db, 'orders_canary', draftId);
    
    console.log(`[orderService] [deleteDraftFromFirestore] deleteDoc on orders_canary/${draftId}`);

    try {
        console.log('[FIRESTORE_DIAGNOSTIC] [deleteDraftFromFirestore] EXECUTING deleteDoc on orders_canary/', draftId, 'at:', new Date().toISOString());
        console.debug(`[FIRESTORE_DIAGNOSTIC] [deleteDraftFromFirestore] [BEFORE DELETE] Type: draft, Collection: orders_canary, DraftID: ${draftId}, Timestamp: ${new Date().toISOString()}, CallerTrace: ${getCallerTrace()}`);
        await deleteDoc(docRef);
        console.debug(`[FIRESTORE_DIAGNOSTIC] [deleteDraftFromFirestore] [AFTER DELETE] Type: draft, Collection: orders_canary, DraftID: ${draftId}, Timestamp: ${new Date().toISOString()} - Delete successful.`);
        console.log(`[orderService] Draft ${draftId} successfully deleted from Firestore.`);
    } catch (error) {
        console.error(`[orderService] [deleteDraftFromFirestore] Failed:`, error);
        handleFirestoreError(error, OperationType.DELETE, 'orders_canary');
    }
}

/**
 * Creates/Promotes a draft order to a final order atomically using a single setDoc.
 * This completely avoids double-write race conditions and cleans up drafts sequentially.
 */
export async function createOrder(finalState: AppState, draftId?: string): Promise<void> {
    console.log(`[orderService] [createOrder] Initiating atomic order creation for orderId: ${finalState.orderId}, draftId: ${draftId}`);

    const finalOrderId = finalState.orderId || finalState.historyId;
    if (!finalOrderId) {
        throw new Error("Final Order ID is required to create order.");
    }

    const isDelivered = finalState.isDelivered || false;
    const targetCollection = isDelivered ? 'orders_archive_canary' : 'orders_canary';
    const altCollection = isDelivered ? 'orders_canary' : 'orders_archive_canary';

    const finalDocRef = doc(db, targetCollection, finalOrderId);
    const finalAltDocRef = doc(db, altCollection, finalOrderId);

    // Prepare final document data
    const finalDocData = {
        ...mapAppStateToFirestoreDoc(finalState),
        status: 'final' as const,
        documentId: finalOrderId,
    };

    console.log(`[orderService] [createOrder] Creating final order with single atomic setDoc at ${targetCollection}/${finalOrderId}:`, JSON.stringify(finalDocData));

    try {
        // 1. Single atomic write to create/update final document
        console.log('[FIRESTORE_DIAGNOSTIC] [createOrder] EXECUTING setDoc on final collection:', targetCollection, '/', finalOrderId, 'data:', JSON.stringify(finalDocData), 'at:', new Date().toISOString());
        console.debug(`[FIRESTORE_DIAGNOSTIC] [createOrder] [BEFORE WRITE] Type: tempahan, Collection: ${targetCollection}, FinalOrderID: ${finalOrderId}, Timestamp: ${new Date().toISOString()}, CallerTrace: ${getCallerTrace()}, Payload:`, JSON.stringify(finalDocData));
        await setDoc(finalDocRef, finalDocData);
        console.debug(`[FIRESTORE_DIAGNOSTIC] [createOrder] [AFTER WRITE] Type: tempahan, Collection: ${targetCollection}, FinalOrderID: ${finalOrderId}, Timestamp: ${new Date().toISOString()} - Write successful.`);
        console.log(`[orderService] [createOrder] Atomic write succeeded for ${finalOrderId}.`);

        // 2. Perform alternative collection cleanup sequentially & non-blocking to avoid batch permission noise
        console.log(`[orderService] [createOrder] Cleaning up alternative path ${altCollection}/${finalOrderId}`);
        console.log('[FIRESTORE_DIAGNOSTIC] [createOrder] EXECUTING deleteDoc on alternative collection:', altCollection, '/', finalOrderId, 'at:', new Date().toISOString());
        await deleteDoc(finalAltDocRef).catch((err) => {
            console.log(`[orderService] [createOrder] alternative path deletion ignored (no-op):`, err);
        });

        // 3. Clean up the draft document if different from finalOrderId and present
        if (draftId && draftId !== finalOrderId) {
            const draftDocRef = doc(db, 'orders_canary', draftId);
            console.log(`[orderService] [createOrder] Cleaning up draft ${draftId} from orders_canary`);
            console.log('[FIRESTORE_DIAGNOSTIC] [createOrder] EXECUTING deleteDoc on draft collection: orders_canary/', draftId, 'at:', new Date().toISOString());
            await deleteDoc(draftDocRef).catch((err) => {
                console.warn(`[orderService] [createOrder] draft cleanup failed for ${draftId}:`, err);
            });
        }
    } catch (error) {
        console.error(`[orderService] [createOrder] Error in atomic order creation:`, error);
        handleFirestoreError(error, OperationType.WRITE, targetCollection);
    }
}

/**
 * Promotes a draft order to a final order (kept for full compatibility).
 */
export async function promoteDraftToFinalInFirestore(draftId: string, finalState: AppState): Promise<void> {
    // Delegating to the single atomic creation function
    await createOrder(finalState, draftId);
}

/**
 * Retrieves all drafts from Firestore 'orders_canary'.
 */
export async function getDraftsFromFirestore(): Promise<AppState[]> {
    console.log(`[orderService] [getDraftsFromFirestore] Querying drafts from 'orders_canary'`);

    const q = query(
        collection(db, 'orders_canary'),
        where('status', '==', 'draft'),
        orderBy('migratedAt', 'desc')
    );

    try {
        console.log('[FIRESTORE_DIAGNOSTIC] [getDraftsFromFirestore] EXECUTING getDocs (orders_canary drafts query) at:', new Date().toISOString());
        const snap = await getDocs(q);
        console.log(`[orderService] [getDraftsFromFirestore] Found ${snap.size} drafts directly.`);
        return snap.docs.map(doc => {
            const state = mapFirestoreDocToAppState(doc.id, doc.data());
            state.status = 'draft';
            return state;
        });
    } catch (error) {
        console.warn(`[orderService] [getDraftsFromFirestore] Direct drafts fetch failed. Falling back to client-side filter.`, error);
        try {
            console.log('[FIRESTORE_DIAGNOSTIC] [getDraftsFromFirestore] EXECUTING fallback getDocs (orders_canary full list) at:', new Date().toISOString());
            const allSnap = await getDocs(collection(db, 'orders_canary'));
            console.log(`[orderService] [getDraftsFromFirestore] Fallback scanned ${allSnap.size} total docs.`);
            return allSnap.docs
                .filter(doc => doc.id.startsWith('draft_') || doc.data().status === 'draft')
                .map(doc => {
                    const state = mapFirestoreDocToAppState(doc.id, doc.data());
                    state.status = 'draft';
                    return state;
                });
        } catch (fallbackError) {
            console.error(`[orderService] [getDraftsFromFirestore] Fallback failed:`, fallbackError);
            handleFirestoreError(fallbackError, OperationType.LIST, 'orders_canary drafts fallback');
            return [];
        }
    }
}

import { CANARY_DATA } from './canaryData';

/**
 * Seeds the canary records.
 */
export async function seedCanaryData(): Promise<{ undelivered: number; delivered: number }> {
    let undeliveredCount = 0;
    let deliveredCount = 0;

    console.log(`[orderService] [seedCanaryData] Seeding ${CANARY_DATA.length} canary records`);

    for (const row of CANARY_DATA) {
        const data = row.data;
        const docId = data.orderId;
        const isDelivered = data.isDelivered;
        
        const targetCollection = isDelivered ? 'orders_archive_canary' : 'orders_canary';
        const docRef = doc(db, targetCollection, docId);

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
            price: data.price,
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

        try {
            console.log(`[orderService] [seedCanaryData] Seeding ${targetCollection}/${docId}`);
            console.log('[FIRESTORE_DIAGNOSTIC] [seedCanaryData] EXECUTING setDoc on:', targetCollection, '/', docId, 'at:', new Date().toISOString());
            console.debug(`[FIRESTORE_DIAGNOSTIC] [seedCanaryData] [BEFORE WRITE] Type: tempahan, Collection: ${targetCollection}, DocID: ${docId}, Timestamp: ${new Date().toISOString()}, CallerTrace: ${getCallerTrace()}, Payload:`, JSON.stringify(docData));
            await setDoc(docRef, docData);
            console.debug(`[FIRESTORE_DIAGNOSTIC] [seedCanaryData] [AFTER WRITE] Type: tempahan, Collection: ${targetCollection}, DocID: ${docId}, Timestamp: ${new Date().toISOString()} - Write successful.`);
        } catch (error) {
            console.error(`[orderService] [seedCanaryData] Seeding failed for ${docId}:`, error);
            handleFirestoreError(error, OperationType.WRITE, targetCollection);
        }
        if (isDelivered) {
            deliveredCount++;
        } else {
            undeliveredCount++;
        }
    }

    return { undelivered: undeliveredCount, delivered: deliveredCount };
}
