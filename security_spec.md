# Security Specification - Order Submission Canary

## Data Invariants
1. Orders must belong to an authenticated user (specifically the approved UID).
2. `deliveryDate` must be a valid Timestamp.
3. `price` must be a number or null.
4. `isDelivered` must be a boolean.
5. `migrationVersion` must be '1.0-canary'.

## The "Dirty Dozen" Payloads

### 1. Identity Spoofing (Wrong UID)
```json
{
  "customerName": "Attacker",
  "auth": { "uid": "WRONG_UID" }
}
```
**Expected Result**: PERMISSION_DENIED

### 2. State Shortcutting (Setting isDelivered in orders_canary)
(This is actually allowed in the app logic for migration, but let's say we want to prevent it if it were a strict state machine).
Actually, the app handles collection switching.

### 3. Resource Poisoning (Massive String)
```json
{
  "customerName": "A".repeat(2000000)
}
```
**Expected Result**: PERMISSION_DENIED (via size checks)

### 4. Invalid ID (ID Poisoning)
Targeting doc `../../secret_collection/doc`
**Expected Result**: PERMISSION_DENIED

### 5. Type Mismatch (Price as String)
```json
{
  "price": "100"
}
```
**Expected Result**: PERMISSION_DENIED

### 6. Missing Required Field (customerName)
```json
{
  "customerPhone": "123"
}
```
**Expected Result**: PERMISSION_DENIED

### 7. Unauthorized Write to Archive
```json
{
  "isDelivered": true
}
```
**Expected Result**: ALLOW (if owner, as app needs to seed/archive)

### 8. Shadow Field Injection
```json
{
  "customerName": "Test",
  "isAdmin": true
}
```
**Expected Result**: PERMISSION_DENIED (via strict schema)

### 9. Future-Dated Migration Version
```json
{
  "migrationVersion": "99.0"
}
```
**Expected Result**: PERMISSION_DENIED

### 10. Malicious Script in orderLink
```json
{
  "orderLink": "javascript:alert(1)"
}
```
**Expected Result**: PERMISSION_DENIED (via regex/size)

### 11. Negative Price
```json
{
  "price": -100
}
```
**Expected Result**: PERMISSION_DENIED

### 12. Unauthenticated Access
**Expected Result**: PERMISSION_DENIED

## Test Runner (firestore.rules.test.ts)
(Implementation of tests would go here if I were running them locally, but I will focus on the rules themselves).
