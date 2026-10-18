import { z } from "zod";

export function shoppingAssistantOutputSchema(allowedProductIds: Set<string>) {
  return z.object({
    reply: z.string().trim().min(1).max(1200),
    productIds: z.array(z.string().trim().min(1).max(128)).max(80),
    needsClarification: z.boolean(),
  }).strict().superRefine((value, context) => {
    if (!value.needsClarification && value.productIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["productIds"],
        message: "A recommendation or clarification is required.",
      });
    }
    const seen = new Set<string>();
    value.productIds.forEach((id, index) => {
      if (!allowedProductIds.has(id) || seen.has(id)) {
        context.addIssue({
          code: "custom",
          path: ["productIds", index],
          message: "Product IDs must be unique and present in the supplied catalog.",
        });
      }
      seen.add(id);
    });
  });
}

export function inventoryAssistantOutputSchema(allowedProductIds: Set<string>) {
  return z.object({
    reply: z.string().trim().min(1).max(1200),
    action: z.enum(["create", "update", "delete", "clarify"]),
    preview: z.object({
      productId: z.string().trim().min(1).max(128).optional(),
      name: z.string().trim().max(100).optional(),
      category: z.string().trim().max(40).optional(),
      unit: z.string().trim().max(30).optional(),
      price: z.number().int().min(0).optional(),
      stock: z.number().int().min(0).optional(),
    }).strict(),
  }).strict().superRefine((value, context) => {
    const { action, preview } = value;
    if (
      (action === "update" || action === "delete") &&
      (!preview.productId || !allowedProductIds.has(preview.productId))
    ) {
      context.addIssue({
        code: "custom",
        path: ["preview", "productId"],
        message: "Update and delete actions must use a product from the supplied inventory.",
      });
    }
    if (
      (action === "create" || action === "update") &&
      (!preview.name || !preview.unit || preview.price === undefined ||
        preview.price < 1 || preview.stock === undefined)
    ) {
      context.addIssue({
        code: "custom",
        path: ["preview"],
        message: "Create and update actions require a complete product preview.",
      });
    }
  });
}
