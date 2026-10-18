---
name: Shopper chat reset
description: User-required behavior for the customer grocery assistant's conversation lifecycle.
---

For the customer shopping assistant, clear messages, the unsent draft, and voice-review state after 60 seconds without chat activity, or immediately after the order API confirms success. Do not clear on product add alone or on a failed order; keep cart/order state separate. Pause expiry while assistant or transcription work is pending, and enforce the expiry when the app returns to the foreground. Ignore late assistant responses from a reset conversation.

**Why:** the user requested automatic chat clearing after a minute or immediately after a successful order. Pending work and failed checkout should not lose the shopper's conversation.

**How to apply:** preserve this lifecycle when changing chat, voice, order, or app foreground/background behavior; only reset after the create-order request succeeds.
