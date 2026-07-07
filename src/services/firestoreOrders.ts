import { getDb } from '../lib/firebase';
const db = getDb();
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
    Timestamp 
} from 'firebase/firestore';
import { AppState } from '../types';
import { handleFirestoreError, OperationType } from './firestoreUtils';

export const orderDataSource = import.meta.env.VITE_ORDER_DATA_SOURCE ?? 'sheets';
export const isFirestoreCanary = orderDataSource === 'firestore-canary';

/**
 * Maps a Firestore document to AppState structure.
 */
export function mapFirestoreDocToAppState(docId: string, data: any): AppState {
    const deliveryDateMillis = data.deliveryDate instanceof Timestamp 
        ? data.deliveryDate.toMillis() 
        : (data.deliveryDate && typeof data.deliveryDate.toMillis === 'function' 
            ? data.deliveryDate.toMillis() 
            : (data.deliveryDate?.seconds ? data.deliveryDate.seconds * 1000 : null));

    return {
        mainType: data.customerOrder === 'Resume' ? 'Resume' : (data.customerOrder === 'Surat' ? 'Surat' : 'Lain-lain'),
        subType: '',
        urgency: data.customerJenis === 'Urgent' ? 'urgent' : (data.customerJenis === 'Super Urgent' ? 'super' : 'noturgent'),
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
        customerJenis: data.customerJenis || '',
        customerDue: data.originalDue || '',
        dueTimestamp: deliveryDateMillis || undefined,
        isDelivered: data.isDelivered || false,
        orderLink: data.orderLink || '',
        googleSheetLink: data.orderLink || '',
        orderId: data.documentId || docId,
        price: typeof data.price === 'number' ? data.price : undefined,
        status: data.status || undefined,
        type: data.type || undefined,
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
        customerJenis: state.customerJenis || '',
        deliveryDate: deliveryDate,
        originalDue: state.customerDue || '',
        orderLink: state.orderLink || '',
        price: typeof state.price === 'number' ? state.price : null,
        isDelivered: state.isDelivered || false,
        migrationVersion: '1.0-canary',
        migratedAt: Timestamp.fromDate(new Date())
    };
}

/**
 * Fetch 5 operational undelivered orders within window:
 * [-2 days to +3 days from today] -> represented as >= startDate and < endDate.
 */
export async function getOperationalOrders(): Promise<AppState[]> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const startDate = new Date(today);
    startDate.setUTCDate(today.getUTCDate() - 2);

    const endDate = new Date(today);
    endDate.setUTCDate(today.getUTCDate() + 4); // < 4 days after today (half-open)

    const q = query(
        collection(db, 'orders_canary'),
        where('isDelivered', '==', false),
        where('deliveryDate', '>=', Timestamp.fromDate(startDate)),
        where('deliveryDate', '<', Timestamp.fromDate(endDate)),
        orderBy('deliveryDate', 'asc'),
        limit(50)
    );

    try {
        const snap = await getDocs(snapQueryWithFallback(q));
        return snap.docs
            .map(doc => mapFirestoreDocToAppState(doc.id, doc.data()))
            .filter(state => state.status !== 'draft' && state.type !== 'draft' && state.customerOrder !== 'draft' && !state.historyId?.startsWith('draft_'));
    } catch (error) {
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

    const q = query(
        collection(db, 'orders_canary'),
        where('isDelivered', '==', false),
        where('deliveryDate', '<', Timestamp.fromDate(today)),
        orderBy('deliveryDate', 'desc')
    );

    try {
        const snap = await getDocs(snapQueryWithFallback(q));
        return snap.docs
            .map(doc => mapFirestoreDocToAppState(doc.id, doc.data()))
            .filter(state => state.status !== 'draft' && state.type !== 'draft' && state.customerOrder !== 'draft' && !state.historyId?.startsWith('draft_'));
    } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'orders_canary');
        return [];
    }
}

/**
 * Fetch delivered historical records (limit 100).
 */
export async function getArchivedOrders(): Promise<AppState[]> {
    const q = query(
        collection(db, 'orders_archive_canary'),
        where('isDelivered', '==', true),
        orderBy('deliveryDate', 'desc'),
        limit(50)
    );

    try {
        const snap = await getDocs(snapQueryWithFallback(q));
        return snap.docs
            .map(doc => mapFirestoreDocToAppState(doc.id, doc.data()))
            .filter(state => state.status !== 'draft' && state.type !== 'draft' && state.customerOrder !== 'draft' && !state.historyId?.startsWith('draft_'));
    } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'orders_archive_canary');
        return [];
    }
}

/**
 * Saves or updates an order in the appropriate canary collection.
 */
export async function saveOrderToFirestore(state: AppState): Promise<void> {
    const docId = state.orderId || state.historyId;
    if (!docId) throw new Error("Order ID is missing.");

    const isDelivered = state.isDelivered || false;
    const collectionName = isDelivered ? 'orders_archive_canary' : 'orders_canary';

    const docRef = doc(db, collectionName, docId);
    
    try {
        // Check if document already exists to preserve migratedAt
        const existingSnap = await getDoc(docRef);
        const docData = mapAppStateToFirestoreDoc(state);
        
        if (existingSnap.exists()) {
            const existingData = existingSnap.data();
            if (existingData.migratedAt) {
                docData.migratedAt = existingData.migratedAt;
            }
        }

        await setDoc(docRef, docData);
    } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, collectionName);
    }
}

import { CANARY_DATA } from './canaryData';

/**
 * Seeds the 20 canary records to firestore collections from the client side.
 */
export async function seedCanaryData(): Promise<{ undelivered: number; delivered: number }> {
    let undeliveredCount = 0;
    let deliveredCount = 0;

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

        try {
            await setDoc(docRef, docData);
        } catch (error) {
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

/**
 * Fallback to help execute queries even if index is not ready yet.
 */
function snapQueryWithFallback(q: any) {
    return q;
}

