---
name: API client code generation
description: Keep generated API schemas and their package barrel compatible with TypeScript.
---

Run OpenAPI generation with `pnpm --filter @workspace/api-spec run codegen`, not by invoking Orval directly. The package script normalizes the generated Zod exports before checking library types.

**Why:** Orval's generated Zod barrel can reintroduce a wildcard export that duplicates request schema exports and breaks `typecheck:libs`.

**How to apply:** preserve the normalization step whenever the codegen script or Zod package barrel is changed.
