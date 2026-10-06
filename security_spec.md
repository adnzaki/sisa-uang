# Security Specification — Sisa Uang

## 1. Data Invariants

1. **Global Default-Deny**: All paths not explicitly matched in `firestore.rules` are denied (`allow read, write: if false;`).
2. **Path Variable Hardening (`isValidId`)**: Every single-document operation (`get`, `create`, `update`, `delete`) validates its document ID against `^[a-zA-Z0-9_\-]+$` with length `1..128`.
3. **PII Isolation (`users/{userId}`)**: User profiles contain `email` and `displayName`. Reading (`get`) is restricted strictly to `isOwner(userId) || isAdmin()`. Listing (`list`) all users is restricted strictly to `isAdmin()`.
4. **Privilege Escalation Prevention**: Normal users can only create their profile with `role == 'user'` and `status == 'active'`. Only bootstrapped admins (`vuedevo@gmail.com` or `adnanzaki65@admin.sd.belajar.id` with `email_verified == true` or existing `/admins/{uid}`) can create or hold `role == 'admin'`. Normal users cannot modify `role` or `status` during updates.
5. **Relational & Ownership Integrity (`wallets`, `transactions`, `budgets`)**:
   - Every wallet, transaction, and budget must have `ownerId == request.auth.uid` on creation and `ownerId` is immutable on update.
   - A `transaction` cannot be created unless the referenced `/wallets/$(incoming().walletId)` exists and belongs to `request.auth.uid` (`get(/databases/$(database)/documents/wallets/$(incoming().walletId)).data.ownerId == request.auth.uid`).
   - All `list` queries on `wallets`, `transactions`, and `budgets` enforce `resource.data.ownerId == request.auth.uid || isAdmin()`.
6. **Temporal Integrity**: All `createdAt` and `updatedAt` timestamps must match `request.time`. `createdAt` is immutable on updates.
7. **Audit & Alert Integrity (`activity_logs`, `security_alerts`)**:
   - `activity_logs` are append-only (no `update` allowed) and require `incoming().actorUid == request.auth.uid`. Only `isAdmin()` or the actor can read them; only `isAdmin()` can delete them.
   - `security_alerts` can be created by an authenticated user for their own `actorUid` or by `isAdmin()`, and can only be read, resolved (`status: 'resolved'`), or deleted by `isAdmin()`.

## 2. The "Dirty Dozen" Payloads

1. **Shadow Field Injection on User Profile (`users/{uid}`)**:
   ```json
   {
     "uid": "user_123",
     "email": "attacker@example.com",
     "displayName": "Attacker",
     "role": "user",
     "status": "active",
     "authProvider": "password",
     "currency": "IDR",
     "isSuperVerified": true,
     "createdAt": "SERVER_TIMESTAMP",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
2. **Self-Assigned Admin Role (`users/{uid}` create)**:
   ```json
   {
     "uid": "user_123",
     "email": "attacker@example.com",
     "displayName": "Attacker",
     "role": "admin",
     "status": "active",
     "authProvider": "password",
     "currency": "IDR",
     "createdAt": "SERVER_TIMESTAMP",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
3. **Self-Unblock Attempt (`users/{uid}` update by blocked user)**:
   ```json
   {
     "status": "active",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
4. **Unverified Admin Email Spoof (`admins/{uid}` read/write with `email_verified: false`)**:
   ```json
   {
     "auth": { "uid": "spoof_1", "token": { "email": "vuedevo@gmail.com", "email_verified": false } }
   }
   ```
5. **Cross-User PII Harvest (`users/{otherUid}` get by non-owner)**:
   ```json
   {
     "auth": { "uid": "user_123" },
     "path": "/users/user_999"
   }
   ```
6. **Orphaned Transaction Creation (referencing non-existent or another user's `walletId`)**:
   ```json
   {
     "ownerId": "user_123",
     "walletId": "foreign_wallet_999",
     "walletName": "BCA",
     "type": "expense",
     "category": "Makanan",
     "amount": 50000,
     "note": "Makan siang",
     "date": "2026-10-05",
     "createdAt": "SERVER_TIMESTAMP",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
7. **Identity Spoofing on Wallet Creation (`ownerId != request.auth.uid`)**:
   ```json
   {
     "ownerId": "victim_uid",
     "name": "Dompet Palsu",
     "type": "cash",
     "balance": 1000000,
     "color": "emerald",
     "createdAt": "SERVER_TIMESTAMP",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
8. **Immutable Field Mutation (`ownerId` or `createdAt` modified on `wallets/{id}` update)**:
   ```json
   {
     "ownerId": "another_user",
     "balance": 99999999,
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
9. **Denial-of-Wallet Oversized String (`note` > 200 chars in `transactions/{id}`)**:
   ```json
   {
     "note": "A_250_CHAR_LONG_PAYLOAD..."
   }
   ```
10. **ID Poisoning Attack (Invalid characters in document ID `{walletId}`)**:
    ```json
    {
      "path": "/wallets/invalid$id#with!spaces"
    }
    ```
11. **Audit Log Tampering (`activity_logs/{logId}` update attempt)**:
    ```json
    {
      "action": "benign_action",
      "severity": "info"
    }
    ```
12. **Terminal State Re-opening on Security Alert (`security_alerts/{alertId}` update after `status == 'resolved'` by non-admin)**:
    ```json
    {
      "status": "open",
      "updatedAt": "SERVER_TIMESTAMP"
    }
    ```
