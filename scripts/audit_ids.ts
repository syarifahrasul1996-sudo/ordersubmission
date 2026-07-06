
import * as fs from 'fs';

function runAudit() {
    const data = JSON.parse(fs.readFileSync('migration-reports/audit-rows.json', 'utf-8'));
    const uniqueIds = new Set();
    const unsafeIds = [];

    data.forEach(row => {
        const id = row.data.originalOrderId;
        if (id && id !== null) {
            uniqueIds.add(id);
            // Check if ID is unsafe according to firestore rules (isValidId uses ^[a-zA-Z0-9_\-]+$)
            if (!/^[a-zA-Z0-9_\-]+$/.test(id)) {
                unsafeIds.push(id);
            }
        }
    });

    console.log(`Total unique original IDs: ${uniqueIds.size}`);
    console.log(`Total unsafe IDs: ${unsafeIds.length}`);
    console.log('Unsafe samples:', unsafeIds.slice(0, 20));
    
    fs.writeFileSync('unsafe_ids_audit.json', JSON.stringify({
        totalUnique: uniqueIds.size,
        unsafeCount: unsafeIds.length,
        unsafeIds: unsafeIds
    }, null, 2));
}

runAudit();
