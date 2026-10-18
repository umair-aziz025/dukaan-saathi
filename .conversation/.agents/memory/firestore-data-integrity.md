---
name: Firestore data integrity
description: Constraints for preserving reliable order and inventory behavior in Firestore.
---

Use the API's Firebase Admin repository as the sole application data path. Keep email/CNIC uniqueness, merchant ownership, order idempotency, stock decrement/restock, state changes, and their audit records transactional. Do not add direct mobile Firestore writes.

**Why:** the user requested Firestore as the app's database, and the existing order flow depends on atomic stock and idempotency behavior.

**How to apply:** implement new persistence through repository helpers in the shared database package and cover multi-document invariants with Firestore transactions.

Use separate, deterministic notification records per recipient: customers receive order status updates, while the owning merchant receives a notification when a new order is created. Do not notify on cancellation. Only authenticated customers and merchants may list or mark their own notifications as read; mark-all must stay scoped to the caller.

**Why:** merchants need timely incoming-order alerts, while customer notifications and read states must remain independent; cancellation notifications remain intentionally excluded.

**How to apply:** create order notifications transactionally, derive recipients from the verified customer or shop owner, and batch read-state updates only for that recipient.
