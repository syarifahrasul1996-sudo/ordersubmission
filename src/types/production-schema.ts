
/**
 * Production Order Schema (Firestore)
 * Collection: orders | orders_archive
 */
interface OrderDocument {
  // --- Core Identity ---
  documentId: string;           // Primary Key (Safe Original ID or Generated sheet-<hash>)
  
  // --- Customer Data ---
  customerName: string;         // Required
  customerPhone: string;        // Required
  customerOrder: string;        // Required
  customerTemplate: string;     // Required
  customerBahasa: string;       // Required
  customerAddOn: string;        // Required
  customerJenis: string;        // Required
  
  // --- Order Details ---
  deliveryDate: Date | null;    // Firestore Timestamp (null if not delivered)
  originalDue: string;          // Raw due date text from spreadsheet
  orderLink: string;            // URL or empty string
  price: number | null;         // Numeric price or null
  isDelivered: boolean;         // true -> orders_archive, false -> orders
  
  // --- Migration Metadata (Immutable) ---
  migrationVersion: "1.0-production";
  migratedAt: Date;             // Firestore Timestamp
  
  // --- Sync / Conflict Resolution ---
  lastUpdated: Date | null;     // Last updated timestamp for multi-device sync
  version: number;              // Monotonically increasing version counter
  
  // --- Audit Tracking (Optional/Internal) ---
  originalOrderId?: string | null;   // The raw value from the spreadsheet
  generatedOrderId?: boolean;        // true if documentId was generated from sourceKey
  sourceSpreadsheetId?: string;
  sourceSpreadsheetYear?: string;
  sourceWorksheet?: string;
  sourceRow?: number;
  sourceKey?: string;                // spreadsheetId|worksheet|row
  auditClassification?: string;
}
