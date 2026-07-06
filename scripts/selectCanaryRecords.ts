import * as fs from 'fs';

async function selectCanary() {
    const auditFilePath = 'migration-reports/audit-rows.json';
    if (!fs.existsSync(auditFilePath)) {
        console.error('Audit rows not found.');
        return;
    }
    const rows = JSON.parse(fs.readFileSync(auditFilePath, 'utf-8'));
    
    // Filter migratable rows
    const migratableRows = rows.filter((r: any) => 
        ['MIGRATABLE_GENERATED_ID', 'MIGRATABLE_SAFE_ID', 'MIGRATABLE_PRICE_NULL', 'MIGRATABLE_GENERATED_ID_AND_PRICE_NULL', 'READY_WITH_EXISTING_ID'].includes(r.classification)
    );

    const today = new Date('2026-06-27T00:00:00Z');
    const opStart = new Date(today);
    opStart.setDate(today.getDate() - 2);
    const opEnd = new Date(today);
    opEnd.setDate(today.getDate() + 3);

    console.log(`Today: ${today.toISOString().split('T')[0]}`);
    console.log(`Op Window: ${opStart.toISOString().split('T')[0]} to ${opEnd.toISOString().split('T')[0]}`);

    // Select:
    // 1. 5 undelivered records within the current operational window
    const opUndelivered = migratableRows.filter((r: any) => {
        const d = r.data;
        if (d.isDelivered) return false;
        if (!d.normalizedDue) return false;
        const due = new Date(d.normalizedDue + 'T00:00:00Z');
        return due >= opStart && due <= opEnd;
    });

    // 2. 5 overdue undelivered records (due < June 27, 2026)
    const overdueUndelivered = migratableRows.filter((r: any) => {
        const d = r.data;
        if (d.isDelivered) return false;
        if (!d.normalizedDue) return false;
        const due = new Date(d.normalizedDue + 'T00:00:00Z');
        return due < today;
    }).slice(0, 5);

    // 3. 10 delivered historical records
    const deliveredHistoric = migratableRows.filter((r: any) => {
        return r.data.isDelivered === true;
    }).slice(0, 10);

    console.log(`Found operational undelivered count: ${opUndelivered.length}`);
    console.log(`Found overdue undelivered count: ${overdueUndelivered.length}`);
    console.log(`Found delivered historic count: ${deliveredHistoric.length}`);

    const selected = [
        ...opUndelivered,
        ...overdueUndelivered,
        ...deliveredHistoric
    ];

    console.log(`Total selected: ${selected.length}`);
    selected.forEach((s, idx) => {
        console.log(`${idx + 1}: ID=${s.data.orderId}, Due=${s.data.normalizedDue}, Delivered=${s.data.isDelivered}, Name=${s.data.customerName}`);
    });

    // Write to a temporary file
    fs.writeFileSync('migration-reports/selected-canary-rows.json', JSON.stringify(selected, null, 2));
}

selectCanary().catch(console.error);
