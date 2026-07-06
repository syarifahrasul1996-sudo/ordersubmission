import * as fs from 'fs';
import { execSync } from 'child_process';
import * as crypto from 'crypto';

const ORIGINAL_SCRIPT_PATH = 'scripts/migrateToProductionSecure.ts';
const TEMP_SCRIPT_PATH = 'scripts/migrateToProductionSecure.test-temp.ts';

const STAGING_MANIFEST_PATH = 'migration-reports/staging-authoritative-manifest.json';
const PAYLOAD_MANIFEST_PATH = 'migration-reports/production-payload-manifest.json';

const EXPECTED_PROJECT_ID = "deft-verbena-smln4";
const EXPECTED_DATABASE_ID = "ai-studio-ordersubmission-812e5ca5-4c13-4685-aeb6-9c38e1052adb";
const EXPECTED_STAGING_COUNT = 5983;

let stagingManifestBackup: string | null = null;
let payloadManifestBackup: string | null = null;

function backupFiles() {
    if (fs.existsSync(STAGING_MANIFEST_PATH)) {
        stagingManifestBackup = fs.readFileSync(STAGING_MANIFEST_PATH, 'utf-8');
    }
    if (fs.existsSync(PAYLOAD_MANIFEST_PATH)) {
        payloadManifestBackup = fs.readFileSync(PAYLOAD_MANIFEST_PATH, 'utf-8');
    }
}

function restoreFiles() {
    if (stagingManifestBackup !== null) {
        fs.writeFileSync(STAGING_MANIFEST_PATH, stagingManifestBackup);
    }
    if (payloadManifestBackup !== null) {
        fs.writeFileSync(PAYLOAD_MANIFEST_PATH, payloadManifestBackup);
    }
    if (fs.existsSync(TEMP_SCRIPT_PATH)) {
        fs.unlinkSync(TEMP_SCRIPT_PATH);
    }
}

function getOnDiskHashes() {
    const sContent = fs.existsSync(STAGING_MANIFEST_PATH) ? fs.readFileSync(STAGING_MANIFEST_PATH, 'utf-8') : '';
    const pContent = fs.existsSync(PAYLOAD_MANIFEST_PATH) ? fs.readFileSync(PAYLOAD_MANIFEST_PATH, 'utf-8') : '';
    return {
        staging: crypto.createHash('sha256').update(sContent).digest('hex'),
        payload: crypto.createHash('sha256').update(pContent).digest('hex')
    };
}

function getScriptWithBypassedJSONAndHashes(): string {
    const originalContent = fs.readFileSync(ORIGINAL_SCRIPT_PATH, 'utf-8');
    const hashes = getOnDiskHashes();
    return originalContent
        .replace(/const EXPECTED_STAGING_MANIFEST_SHA256 = ".*";/, `const EXPECTED_STAGING_MANIFEST_SHA256 = "${hashes.staging}";`)
        .replace(/const EXPECTED_PAYLOAD_SHA256 = ".*";/, `const EXPECTED_PAYLOAD_SHA256 = "${hashes.payload}";`)
        .replace(/manifestData = JSON\.parse\(manifestStr\);/, `manifestData = new Array(${EXPECTED_STAGING_COUNT}).fill({});`)
        .replace(/payloadData = JSON\.parse\(payloadStr\);/, `payloadData = []; for (let i = 0; i < ${EXPECTED_STAGING_COUNT}; i++) { payloadData.push({ targetCollection: i % 2 === 0 ? 'orders' : 'orders_archive', documentId: 'doc-' + i, sourceKey: 'key-' + i }); }`);
}

function runScript(scriptPath: string): { status: number; stdout: string; stderr: string } {
    try {
        const stdout = execSync(`npx tsx ${scriptPath}`, { stdio: 'pipe', env: { ...process.env, NODE_ENV: 'production' } });
        return { status: 0, stdout: stdout.toString(), stderr: '' };
    } catch (e: any) {
        return {
            status: e.status ?? 1,
            stdout: e.stdout?.toString() ?? '',
            stderr: e.stderr?.toString() ?? ''
        };
    }
}

async function runTests() {
    console.log('=== STARTING SECURITY GUARD UNIT TESTS ===\n');
    backupFiles();

    let passedTests = 0;
    let failedTests = 0;

    function assertFailure(testName: string, result: { status: number; stdout: string; stderr: string }, expectedSnippet: string) {
        const combined = result.stdout + '\n' + result.stderr;
        if (result.status !== 0 && combined.includes(expectedSnippet)) {
            console.log(`✔ [PASS] ${testName}`);
            passedTests++;
        } else {
            console.error(`❌ [FAIL] ${testName}`);
            console.error(`  Expected non-zero exit code and output containing "${expectedSnippet}"`);
            console.error(`  Got exit code: ${result.status}`);
            console.error(`  Combined Output:\n${combined}\n`);
            failedTests++;
        }
    }

    try {
        // Test 1: Staging manifest file missing
        if (fs.existsSync(STAGING_MANIFEST_PATH)) fs.unlinkSync(STAGING_MANIFEST_PATH);
        const res1 = runScript(ORIGINAL_SCRIPT_PATH);
        assertFailure('Test 1: Staging manifest file missing', res1, 'Staging manifest file not found');
        restoreFiles();

        // Test 2: Staging manifest invalid/truncated JSON
        fs.writeFileSync(STAGING_MANIFEST_PATH, '{"incomplete_json": ');
        const invalidJsonHash = crypto.createHash('sha256').update('{"incomplete_json": ').digest('hex');
        let scriptContent = fs.readFileSync(ORIGINAL_SCRIPT_PATH, 'utf-8');
        let tempContent = scriptContent.replace(
            /const EXPECTED_STAGING_MANIFEST_SHA256 = ".*";/,
            `const EXPECTED_STAGING_MANIFEST_SHA256 = "${invalidJsonHash}";`
        );
        fs.writeFileSync(TEMP_SCRIPT_PATH, tempContent);
        const res2 = runScript(TEMP_SCRIPT_PATH);
        assertFailure('Test 2: Staging manifest truncated/invalid JSON', res2, 'Staging manifest JSON is invalid/truncated');
        restoreFiles();

        // Test 3: Staging manifest hash mismatch
        fs.writeFileSync(STAGING_MANIFEST_PATH, '[]');
        const res3 = runScript(ORIGINAL_SCRIPT_PATH);
        assertFailure('Test 3: Staging manifest hash mismatch', res3, 'Staging manifest hash mismatch');
        restoreFiles();

        // Test 4: Production payload hash mismatch
        // Use bypassed staging JSON so it doesn't fail on truncated staging manifest, but keep dummy production payload hash mismatch
        tempContent = getScriptWithBypassedJSONAndHashes()
            .replace(/const EXPECTED_PAYLOAD_SHA256 = ".*";/, `const EXPECTED_PAYLOAD_SHA256 = "some-invalid-payload-hash-value";`);
        fs.writeFileSync(TEMP_SCRIPT_PATH, tempContent);
        const res4 = runScript(TEMP_SCRIPT_PATH);
        assertFailure('Test 4: Production payload hash mismatch', res4, 'Production payload hash mismatch');
        restoreFiles();

        // Test 5: Production payload missing
        if (fs.existsSync(PAYLOAD_MANIFEST_PATH)) fs.unlinkSync(PAYLOAD_MANIFEST_PATH);
        tempContent = getScriptWithBypassedJSONAndHashes();
        fs.writeFileSync(TEMP_SCRIPT_PATH, tempContent);
        const res5 = runScript(TEMP_SCRIPT_PATH);
        assertFailure('Test 5: Production payload manifest missing', res5, 'Production payload manifest file not found');
        restoreFiles();

        // Test 6: Authenticated project mismatch
        tempContent = getScriptWithBypassedJSONAndHashes();
        fs.writeFileSync(TEMP_SCRIPT_PATH, tempContent);
        const res6 = runScript(TEMP_SCRIPT_PATH);
        assertFailure('Test 6: Authenticated project mismatch', res6, 'Authentication project mismatch');
        restoreFiles();

        // Test 7: Named database incorrect
        const actualSandboxProjectId = "ais-asia-east1-870a50fa75dd4c8";
        tempContent = getScriptWithBypassedJSONAndHashes()
            .replace(/EXPECTED_PROJECT_ID = "deft-verbena-smln4";/, `EXPECTED_PROJECT_ID = "${actualSandboxProjectId}";`)
            .replace(/const db = getFirestore\(app, EXPECTED_DATABASE_ID\);/, `const db = getFirestore(app, "incorrect-db-id");`);
        fs.writeFileSync(TEMP_SCRIPT_PATH, tempContent);
        const res7 = runScript(TEMP_SCRIPT_PATH);
        assertFailure('Test 7: Named database incorrect', res7, 'ERROR: Named database is incorrect');
        restoreFiles();

        // Test 8: Firestore PERMISSION_DENIED on fetch
        tempContent = getScriptWithBypassedJSONAndHashes()
            .replace(/EXPECTED_PROJECT_ID = "deft-verbena-smln4";/, `EXPECTED_PROJECT_ID = "${actualSandboxProjectId}";`);
        fs.writeFileSync(TEMP_SCRIPT_PATH, tempContent);
        const res8 = runScript(TEMP_SCRIPT_PATH);
        assertFailure('Test 8: Firestore PERMISSION_DENIED on fetch', res8, 'PERMISSION_DENIED');
        restoreFiles();

        // Test 9: Staging count cannot be verified as 5,983
        tempContent = getScriptWithBypassedJSONAndHashes()
            .replace(/EXPECTED_PROJECT_ID = "deft-verbena-smln4";/, `EXPECTED_PROJECT_ID = "${actualSandboxProjectId}";`)
            .replace(
                /const stagingSnap = await db\.collection\('orders_migration_staging'\)\.get\(\);/,
                `const stagingSnap = { size: 100 } as any;`
            );
        fs.writeFileSync(TEMP_SCRIPT_PATH, tempContent);
        const res9 = runScript(TEMP_SCRIPT_PATH);
        assertFailure('Test 9: Staging count mismatch in database', res9, 'Firestore staging collection size mismatch! Found: 100');
        restoreFiles();

        // Test 10: orders collection is NOT empty
        tempContent = getScriptWithBypassedJSONAndHashes()
            .replace(/EXPECTED_PROJECT_ID = "deft-verbena-smln4";/, `EXPECTED_PROJECT_ID = "${actualSandboxProjectId}";`)
            .replace(
                /const stagingSnap = await db\.collection\('orders_migration_staging'\)\.get\(\);/,
                `const stagingSnap = { size: ${EXPECTED_STAGING_COUNT} } as any;`
            )
            .replace(
                /const ordersSnap = await db\.collection\('orders'\)\.limit\(1\)\.get\(\);/,
                `const ordersSnap = { empty: false } as any;`
            );
        fs.writeFileSync(TEMP_SCRIPT_PATH, tempContent);
        const res10 = runScript(TEMP_SCRIPT_PATH);
        assertFailure('Test 10: Production orders collection is NOT empty', res10, 'Production collection "orders" is NOT empty!');
        restoreFiles();

        // Test 11: orders_archive collection is NOT empty
        tempContent = getScriptWithBypassedJSONAndHashes()
            .replace(/EXPECTED_PROJECT_ID = "deft-verbena-smln4";/, `EXPECTED_PROJECT_ID = "${actualSandboxProjectId}";`)
            .replace(
                /const stagingSnap = await db\.collection\('orders_migration_staging'\)\.get\(\);/,
                `const stagingSnap = { size: ${EXPECTED_STAGING_COUNT} } as any;`
            )
            .replace(
                /const ordersSnap = await db\.collection\('orders'\)\.limit\(1\)\.get\(\);/,
                `const ordersSnap = { empty: true } as any;`
            )
            .replace(
                /const archiveSnap = await db\.collection\('orders_archive'\)\.limit\(1\)\.get\(\);/,
                `const archiveSnap = { empty: false } as any;`
            );
        fs.writeFileSync(TEMP_SCRIPT_PATH, tempContent);
        const res11 = runScript(TEMP_SCRIPT_PATH);
        assertFailure('Test 11: Production orders_archive collection is NOT empty', res11, 'Production collection "orders_archive" is NOT empty!');
        restoreFiles();

    } finally {
        restoreFiles();
    }

    console.log('\n=== SECURITY GUARD TESTS SUMMARY ===');
    console.log(`Passed: ${passedTests} / ${passedTests + failedTests}`);
    console.log(`Failed: ${failedTests}`);

    if (failedTests > 0) {
        process.exit(1);
    }
}

runTests().catch(e => {
    console.error('Test suite execution failed:', e);
    process.exit(1);
});
