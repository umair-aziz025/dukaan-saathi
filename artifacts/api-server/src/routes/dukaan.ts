import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  inventoryAssistantOutputSchema,
  shoppingAssistantOutputSchema,
} from "../lib/assistant-schemas";
import {
  generateStructuredResponse,
  transcribeShoppingAudio,
  type AiProviderFailure,
} from "../lib/ai-providers";
import {
  createOrderWithStock,
  createProfileChangeRequest,
  createProduct,
  createProfile,
  createShop,
  deactivateProduct,
  DuplicateProfileDetailsError,
  DuplicateShopError,
  findOrderByIdempotency,
  getAdminOrderResults,
  verifyFirebaseIdToken,
  getAdminOverview,
  getOrder,
  initializePickupCodeIfMissing,
  getProfile,
  getShopsByIds,
  listOrderStatusNotifications,
  markAllOrderStatusNotificationsRead,
  registerExpoPushToken,
  listAdminUsers,
  listAdminProfileChangeRequests,
  listProfileChangeRequests,
  listApprovedShops,
  listInventory,
  listOrdersForProfile,
  listProductsForShop,
  listProductsForShops,
  markOrderStatusNotificationRead,
  removeExpoPushToken,
  OrderChangedError,
  promoteProfileToAdmin,
  recordAudit,
  reviewProfileChangeRequest,
  reviewShop,
  seedDemoCatalog as seedDemoCatalogIfMissing,
  shopForOwner,
  updateOrderStatusTransaction,
  updateProduct,
  updateShopDetailsForOwner,
} from "@workspace/db";
import { sendExpoPush } from "../lib/push-notifications";
import {
  type AppUser,
  type Order,
  type OrderStatusNotification,
  type ProfileChangeField,
  type ProfileChangeRequest,
  type ProfileChangeStatus,
  type Product,
  type Shop,
} from "@workspace/db/schema";

type AuthRequest = Request & {
  userId?: string;
  email?: string;
  emailVerified?: boolean;
};
type PublicShop = {
  id: string;
  name: string;
  address: string;
  contact: string;
  latitude: number;
  longitude: number;
  status: string;
  isDemo: boolean;
};
type PublicProduct = {
  id: string;
  shopId: string;
  name: string;
  category: string;
  unit: string;
  price: number;
  stock: number;
  active: boolean;
};

const router = Router();
const dateOnlySchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Use a valid calendar date.");
const adminOrderFiltersSchema = z.object({
  startDate: dateOnlySchema.optional(),
  endDate: dateOnlySchema.optional(),
  shopId: z.string().trim().max(200).optional(),
  productName: z.string().trim().max(100).optional(),
  status: z.enum(["pending", "accepted", "ready", "completed", "cancelled"]).optional(),
  minAmount: z.coerce.number().finite().min(0).max(1_000_000_000).optional(),
  maxAmount: z.coerce.number().finite().min(0).max(1_000_000_000).optional(),
}).strict().superRefine((filters, context) => {
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "End date must be on or after start date." });
  }
  if (
    filters.minAmount !== undefined &&
    filters.maxAmount !== undefined &&
    filters.minAmount > filters.maxAmount
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["maxAmount"], message: "Maximum amount must be at least the minimum amount." });
  }
});
const adminUserSearchSchema = z.object({
  search: z.string().trim().max(100).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).optional(),
}).strict();
const aiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many assistant requests. Please wait a minute and try again." },
});

const emailDomains = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
]);

const profileInput = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(10).max(20),
  cnic: z.string().trim().regex(/^[0-9]{5}-?[0-9]{7}-?[0-9]$/),
  role: z.enum(["customer", "merchant"]),
}).strict();

const profileChangeRequestInput = z.discriminatedUnion("field", [
  z.object({
    field: z.literal("name"),
    requestedValue: z.string().trim().min(2).max(80),
  }).strict(),
  z.object({
    field: z.literal("phone"),
    requestedValue: z.string().trim().min(10).max(20),
  }).strict(),
]);

const adminProfileChangeRequestFilterSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
}).strict();

const reviewProfileChangeRequestInput = z.object({
  status: z.enum(["approved", "rejected"]),
  rejectionReason: z.string().trim().max(300).optional(),
}).strict().superRefine((value, context) => {
  if (value.status === "approved" && value.rejectionReason) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rejectionReason"],
      message: "A rejection reason can only be supplied when rejecting a request.",
    });
  }
});

const shopInput = z.object({
  name: z.string().trim().min(2).max(100),
  address: z.string().trim().min(5).max(240),
  contact: z.string().trim().min(10).max(20),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
}).strict();

const shopDetailsUpdateInput = z.object({
  name: z.string().trim().min(2).max(100),
  address: z.string().trim().min(5).max(240),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
}).strict();

const productInput = z.object({
  name: z.string().trim().min(2).max(100),
  category: z.string().trim().min(2).max(40),
  unit: z.string().trim().min(1).max(30),
  price: z.number().int().min(1).max(1_000_000),
  stock: z.number().int().min(0).max(100_000),
}).strict();

const orderInput = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(1).max(99),
  }).strict()).min(1).max(20),
  idempotencyKey: z.string().min(8).max(100),
  paymentMethod: z.literal("pay_on_pickup"),
}).strict();

const statusInput = z.object({
  status: z.enum(["accepted", "ready", "completed", "cancelled"]),
  pickupCode: z.string().regex(/^[0-9]{6}$/).optional(),
}).strict();

const pushTokenInput = z.object({
  token: z.string().min(20).max(255)
    .refine((value) => (value.startsWith("ExpoPushToken[") || value.startsWith("ExponentPushToken[")) && value.endsWith("]")),
  platform: z.enum(["ios", "android"]),
}).strict();

const pushTokenIdInput = z.string().regex(/^[a-f0-9]{64}$/);

const chatInput = z.object({
  message: z.string().trim().min(1).max(1200),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(1200),
  }).strict()).max(6).optional(),
}).strict();

const merchantChatInput = z.object({
  instruction: z.string().trim().min(1).max(1000),
}).strict();

const transcriptionInput = z.object({
  audioBase64: z.string().min(100).max(5_600_000),
  mimeType: z.enum(["audio/mp4", "audio/m4a", "audio/webm", "audio/wav"]),
}).strict();

function logAiProviderFailure(
  req: Request,
  failure: AiProviderFailure,
) {
  req.log.warn({
    provider: failure.provider,
    reason: failure.reason,
    ...(failure.statusCode === undefined ? {} : { statusCode: failure.statusCode }),
  }, "Saathi AI provider attempt failed");
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  try {
    const decoded = await verifyFirebaseIdToken(token);
    if (!decoded.uid || decoded.email_verified !== true) {
      res.status(403).json({ error: "Verify your email address before continuing." });
      return;
    }
    const authRequest = req as AuthRequest;
    authRequest.userId = decoded.uid;
    authRequest.email = typeof decoded.email === "string" ? decoded.email.toLowerCase() : undefined;
    authRequest.emailVerified = decoded.email_verified === true;
    next();
  } catch {
    res.status(401).json({ error: "Your sign-in has expired. Please sign in again." });
  }
}

function userIdOf(req: Request) {
  return (req as AuthRequest).userId!;
}

function publicOrderStatusNotification(notification: OrderStatusNotification) {
  return {
    id: notification.id,
    orderId: notification.orderId,
    shopId: notification.shopId,
    shopName: notification.shopName,
    status: notification.status,
    previousStatus: notification.previousStatus,
    isRead: notification.isRead,
    createdAt: notification.createdAt.toISOString(),
  };
}

function pathParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function invalid(res: Response, error: z.ZodError) {
  res.status(400).json({
    error: error.issues[0]?.message ?? "Check the submitted details.",
  });
}

function normalizePakistaniPhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("03")) return `+92${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("923")) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith("3")) return `+92${digits}`;
  return null;
}

function cnicDigest(value: string) {
  const key = process.env.SESSION_SECRET;
  if (!key) throw new Error("Secure identity hashing is not configured.");
  return createHmac("sha256", key).update(value.replace(/\D/g, "")).digest("hex");
}

function digestPickupCode(value: string) {
  const key = process.env.SESSION_SECRET;
  if (!key) throw new Error("Pickup-code protection is not configured.");
  return createHmac("sha256", key).update(value).digest("hex");
}

function pickupCodeEncryptionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Pickup-code protection is not configured.");
  return createHash("sha256")
    .update("dukaan-saathi:pickup-code-encryption:v1\0")
    .update(secret)
    .digest();
}

function encryptPickupCode(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", pickupCodeEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function decryptPickupCode(value: string) {
  const [ivText, tagText, encryptedText, extra] = value.split(".");
  if (!ivText || !tagText || !encryptedText || extra !== undefined) {
    throw new Error("Stored pickup code is invalid.");
  }
  const iv = Buffer.from(ivText, "base64url");
  const tag = Buffer.from(tagText, "base64url");
  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error("Stored pickup code is invalid.");
  }
  const decipher = createDecipheriv("aes-256-gcm", pickupCodeEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  if (!/^\d{6}$/.test(decrypted)) throw new Error("Stored pickup code is invalid.");
  return decrypted;
}

function isMatchingDigest(value: string, expectedHex: string) {
  const actual = Buffer.from(digestPickupCode(value), "hex");
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function profileRequired(req: Request, res: Response) {
  const profile = await getProfile(userIdOf(req));
  if (!profile) {
    res.status(403).json({ error: "Finish setting up your profile first." });
    return null;
  }
  return profile;
}

async function approvedMerchantShop(profile: AppUser, res: Response) {
  if (profile.role !== "merchant") {
    res.status(403).json({ error: "Merchant access is required." });
    return null;
  }
  const shop = await shopForOwner(profile.id);
  if (!shop) {
    res.status(404).json({ error: "Register your shop to continue." });
    return null;
  }
  if (shop.status !== "approved") {
    res.status(403).json({ error: "Your shop is awaiting admin review." });
    return null;
  }
  return shop;
}

async function requireAdmin(req: Request, res: Response) {
  const profile = await profileRequired(req, res);
  if (!profile) return null;
  if (profile.role !== "admin") {
    res.status(403).json({ error: "Administrator access is required." });
    return null;
  }
  return profile;
}

function publicShop(shop: Shop): PublicShop {
  return {
    id: shop.id,
    name: shop.name,
    address: shop.address,
    contact: shop.contact,
    latitude: shop.latitude,
    longitude: shop.longitude,
    status: shop.status,
    isDemo: shop.isDemo,
  };
}

function publicProduct(product: Product): PublicProduct {
  return {
    id: product.id,
    shopId: product.shopId,
    name: product.name,
    category: product.category,
    unit: product.unit,
    price: product.price,
    stock: product.stock,
    active: product.active,
  };
}

function distanceKm(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number,
) {
  const radians = Math.PI / 180;
  const dLat = (latitude2 - latitude1) * radians;
  const dLon = (longitude2 - longitude1) * radians;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(latitude1 * radians) *
      Math.cos(latitude2 * radians) *
      Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

async function seedDemoCatalog() {
  if (process.env.NODE_ENV === "development") await seedDemoCatalogIfMissing();
}

async function getNearbyCatalog(latitude: number, longitude: number, radiusKm = 8) {
  await seedDemoCatalog();
  const approvedShops = await listApprovedShops();
  const nearby = approvedShops
    .map((shop) => ({
      shop,
      distance: distanceKm(latitude, longitude, shop.latitude, shop.longitude),
    }))
    .filter((item) => item.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 30);
  if (nearby.length === 0) return { shops: [], products: [] };

  const productRows = await listProductsForShops(
    nearby.map((item) => item.shop.id),
    true,
  );

  return {
    shops: nearby.map(({ shop }) => publicShop(shop)),
    products: productRows.map(publicProduct),
  };
}

function safeAiText(value: string) {
  return value
    .replace(/[<>]/g, " ")
    .replace(/\b[0-9]{5}-?[0-9]{7}-?[0-9]\b/g, "[private ID]")
    .replace(/\b(?:\+?92|0)3\d{9}\b/g, "[private phone]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[private email]")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .trim()
    .slice(0, 1200);
}

function profileDto(profile: AppUser, shopStatus: string | null) {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    role: profile.role,
    shopStatus,
    createdAt: profile.createdAt.toISOString(),
  };
}

function profileChangeRequestDto(request: ProfileChangeRequest) {
  return {
    ...request,
    createdAt: request.createdAt.toISOString(),
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
  };
}

async function shopStatusFor(profile: AppUser) {
  if (profile.role !== "merchant") return null;
  const shop = await shopForOwner(profile.id);
  return shop?.status ?? null;
}

function emailDomain(address: string) {
  return address.toLowerCase().split("@")[1] ?? "";
}

function allowlistedAdminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function syncAllowlistedAdmin(profile: AppUser) {
  if (profile.role === "admin" || !allowlistedAdminEmails().has(profile.email.toLowerCase())) {
    return profile;
  }
  const promoted = await promoteProfileToAdmin(profile.id);
  return promoted ?? profile;
}

function verifiedFirebaseEmail(req: Request) {
  const authRequest = req as AuthRequest;
  if (!authRequest.email || authRequest.emailVerified !== true) {
    throw Object.assign(new Error("Verify your email address before continuing."), { status: 403 });
  }
  return authRequest.email;
}

router.get("/dukaan/me", requireAuth, async (req, res) => {
  const current = await getProfile(userIdOf(req));
  const profile = current ? await syncAllowlistedAdmin(current) : null;
  if (!profile) {
    res.status(404).json({ error: "Profile not found." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ profile: profileDto(profile, await shopStatusFor(profile)) });
});

router.post("/dukaan/onboard", requireAuth, async (req, res) => {
  const parsed = profileInput.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  const body = parsed.data;
  const userId = userIdOf(req);
  const email = verifiedFirebaseEmail(req);
  if (email !== body.email.toLowerCase() || !emailDomains.has(emailDomain(email))) {
    res.status(400).json({ error: "Use your verified Gmail, Yahoo, Outlook, iCloud, or Proton address." });
    return;
  }
  const phone = normalizePakistaniPhone(body.phone);
  if (!phone) {
    res.status(400).json({ error: "Enter a valid Pakistani mobile number, such as 03XXXXXXXXX." });
    return;
  }

  const existing = await getProfile(userId);
  if (existing) {
    res.status(200).json({ profile: profileDto(existing, await shopStatusFor(existing)) });
    return;
  }

  const normalizedCnic = body.cnic.replace(/\D/g, "");
  const identityDigest = cnicDigest(normalizedCnic);
  const role = allowlistedAdminEmails().has(email) ? "admin" : body.role;
  let profile: AppUser;
  try {
    profile = await createProfile({
      id: userId,
      name: body.name.replace(/\s+/g, " "),
      email,
      phone,
      cnicDigest: identityDigest,
      cnicLast4: normalizedCnic.slice(-4),
      role,
    });
  } catch (error) {
    if (error instanceof DuplicateProfileDetailsError) {
      res.status(409).json({ error: "An account already uses these details." });
      return;
    }
    throw error;
  }
  await recordAudit(userId, "profile.created", "profile", userId, { role });
  res.status(201).json({ profile: profileDto(profile, null) });
});

router.get("/dukaan/profile-change-requests", requireAuth, async (req, res) => {
  const profile = await profileRequired(req, res);
  if (!profile) return;
  if (profile.role !== "customer" && profile.role !== "merchant") {
    res.status(403).json({ error: "Only customer and merchant accounts can view profile requests." });
    return;
  }
  const requests = await listProfileChangeRequests(profile.id);
  res.setHeader("Cache-Control", "no-store");
  res.json({ requests: requests.map(profileChangeRequestDto) });
});

router.post("/dukaan/profile-change-requests", requireAuth, async (req, res) => {
  const parsed = profileChangeRequestInput.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  const profile = await profileRequired(req, res);
  if (!profile) return;
  if (profile.role !== "customer" && profile.role !== "merchant") {
    res.status(403).json({ error: "Only customer and merchant accounts can request profile changes." });
    return;
  }

  let requestedValue = parsed.data.requestedValue;
  if (parsed.data.field === "name") {
    requestedValue = requestedValue.replace(/\s+/g, " ");
  } else {
    const normalizedPhone = normalizePakistaniPhone(requestedValue);
    if (!normalizedPhone) {
      res.status(400).json({ error: "Enter a valid Pakistani mobile number, such as 03XXXXXXXXX." });
      return;
    }
    requestedValue = normalizedPhone;
  }

  const request = await createProfileChangeRequest({
    userId: profile.id,
    field: parsed.data.field as ProfileChangeField,
    requestedValue,
  });
  res.status(201).json({ request: profileChangeRequestDto(request) });
});

router.get("/dukaan/shops/mine", requireAuth, async (req, res) => {
  const profile = await profileRequired(req, res);
  if (!profile) return;
  if (profile.role !== "merchant") {
    res.status(403).json({ error: "Merchant access is required." });
    return;
  }
  const shop = await shopForOwner(profile.id);
  if (!shop || shop.ownerId !== profile.id) {
    res.status(404).json({ error: "No shop is registered for this merchant." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json(publicShop(shop));
});

router.patch("/dukaan/shops/mine", requireAuth, async (req, res) => {
  const parsed = shopDetailsUpdateInput.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  const profile = await profileRequired(req, res);
  if (!profile) return;
  if (profile.role !== "merchant") {
    res.status(403).json({ error: "Merchant access is required." });
    return;
  }
  const shop = await updateShopDetailsForOwner(profile.id, parsed.data);
  if (!shop) {
    res.status(404).json({ error: "No shop is registered for this merchant." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json(publicShop(shop));
});

router.post("/dukaan/shops", requireAuth, async (req, res) => {
  const parsed = shopInput.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  const profile = await profileRequired(req, res);
  if (!profile) return;
  if (profile.role !== "merchant") {
    res.status(403).json({ error: "Only merchant accounts can register a shop." });
    return;
  }
  if (await shopForOwner(profile.id)) {
    res.status(409).json({ error: "A shop is already registered for this merchant account." });
    return;
  }
  const contact = normalizePakistaniPhone(parsed.data.contact);
  if (!contact) {
    res.status(400).json({ error: "Enter a valid Pakistani shop contact number." });
    return;
  }
  let shop: Shop;
  try {
    shop = await createShop({
      id: randomUUID(),
      ownerId: profile.id,
      ...parsed.data,
      contact,
      status: "pending",
      isDemo: false,
    });
  } catch (error) {
    if (error instanceof DuplicateShopError) {
      res.status(409).json({ error: error.message });
      return;
    }
    throw error;
  }
  await recordAudit(profile.id, "shop.submitted", "shop", shop.id);
  res.status(201).json(publicShop(shop));
});

router.get("/dukaan/catalog", async (req, res) => {
  const latitude = Number(req.query.latitude);
  const longitude = Number(req.query.longitude);
  const radiusKm = req.query.radiusKm === undefined ? 8 : Number(req.query.radiusKm);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(radiusKm) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180 ||
    radiusKm < 0.1 ||
    radiusKm > 50
  ) {
    res.status(400).json({ error: "Choose a valid location and search radius." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json(await getNearbyCatalog(latitude, longitude, radiusKm));
});

router.get("/dukaan/orders", requireAuth, async (req, res) => {
  const profile = await profileRequired(req, res);
  if (!profile) return;
  const rows = await listOrdersForProfile(profile);
  const shopIds = [...new Set(rows.map((order) => order.shopId))];
  const shopRows = await getShopsByIds(shopIds);
  const shopMap = new Map(shopRows.map((shop) => [shop.id, shop]));
  res.setHeader("Cache-Control", "no-store");
  res.json({
    orders: rows.map((order) => ({
      id: order.id,
      shopId: order.shopId,
      shopName: shopMap.get(order.shopId)?.name ?? "Local shop",
      shopAddress: shopMap.get(order.shopId)?.address ?? "",
      shopLatitude: shopMap.get(order.shopId)?.latitude ?? null,
      shopLongitude: shopMap.get(order.shopId)?.longitude ?? null,
      items: order.items,
      total: order.total,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt.toISOString(),
    })),
  });
});

router.post("/dukaan/push-tokens", requireAuth, async (req, res) => {
  const parsed = pushTokenInput.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  const profile = await profileRequired(req, res);
  if (!profile) return;
  if (profile.role !== "customer" && profile.role !== "merchant") {
    res.status(403).json({ error: "Push alerts are available only for customer and merchant accounts." });
    return;
  }
  const tokenId = await registerExpoPushToken({
    recipientId: profile.id,
    role: profile.role,
    token: parsed.data.token,
    platform: parsed.data.platform,
  });
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ registered: true, tokenId });
});

router.delete("/dukaan/push-tokens/:tokenId", requireAuth, async (req, res) => {
  const tokenId = pushTokenIdInput.safeParse(pathParam(req.params.tokenId));
  if (!tokenId.success) return invalid(res, tokenId.error);
  const profile = await profileRequired(req, res);
  if (!profile) return;
  if (profile.role !== "customer" && profile.role !== "merchant") {
    res.status(403).json({ error: "Push alerts are available only for customer and merchant accounts." });
    return;
  }
  const removed = await removeExpoPushToken(profile.id, profile.role, tokenId.data);
  res.setHeader("Cache-Control", "no-store");
  res.json({ removed });
});

router.get("/dukaan/notifications", requireAuth, async (req, res) => {
  const profile = await profileRequired(req, res);
  if (!profile) return;
  if (profile.role !== "customer" && profile.role !== "merchant") {
    res.status(403).json({ error: "Only customer and merchant accounts can view order notifications." });
    return;
  }
  const notifications = await listOrderStatusNotifications(profile.id, profile.role);
  res.setHeader("Cache-Control", "no-store");
  res.json({
    notifications: notifications.map(publicOrderStatusNotification),
    unreadCount: notifications.filter((notification) => !notification.isRead).length,
  });
});

router.patch("/dukaan/notifications/read-all", requireAuth, async (req, res) => {
  const profile = await profileRequired(req, res);
  if (!profile) return;
  if (profile.role !== "customer" && profile.role !== "merchant") {
    res.status(403).json({ error: "Only customer and merchant accounts can mark notifications as read." });
    return;
  }
  const updatedCount = await markAllOrderStatusNotificationsRead(profile.id, profile.role);
  res.setHeader("Cache-Control", "no-store");
  res.json({ updatedCount });
});

router.patch("/dukaan/notifications/:notificationId/read", requireAuth, async (req, res) => {
  const profile = await profileRequired(req, res);
  if (!profile) return;
  if (profile.role !== "customer" && profile.role !== "merchant") {
    res.status(403).json({ error: "Only customer and merchant accounts can mark order notifications as read." });
    return;
  }
  const notification = await markOrderStatusNotificationRead(
    profile.id,
    profile.role,
    pathParam(req.params.notificationId),
  );
  if (!notification) {
    res.status(404).json({ error: "Notification not found." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ notification: publicOrderStatusNotification(notification) });
});

router.post("/dukaan/orders", requireAuth, async (req, res) => {
  const parsed = orderInput.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  const profile = await profileRequired(req, res);
  if (!profile) return;
  if (profile.role !== "customer") {
    res.status(403).json({ error: "Customer accounts place pickup orders." });
    return;
  }
  const { items, idempotencyKey } = parsed.data;
  if (new Set(items.map((item) => item.productId)).size !== items.length) {
    res.status(400).json({ error: "Combine duplicate product lines before ordering." });
    return;
  }
  const duplicate = await findOrderByIdempotency(profile.id, idempotencyKey);
  if (duplicate) {
    res.status(200).json({ order: {
      id: duplicate.order.id,
      shopId: duplicate.order.shopId,
      shopName: duplicate.shop?.name ?? "Local shop",
      shopAddress: duplicate.shop?.address ?? "",
      shopLatitude: duplicate.shop?.latitude ?? null,
      shopLongitude: duplicate.shop?.longitude ?? null,
      items: duplicate.order.items,
      total: duplicate.order.total,
      status: duplicate.order.status,
      paymentMethod: duplicate.order.paymentMethod,
      paymentStatus: duplicate.order.paymentStatus,
      createdAt: duplicate.order.createdAt.toISOString(),
    }, ...(duplicate.order.pickupCodeCiphertext
      ? { pickupCode: decryptPickupCode(duplicate.order.pickupCodeCiphertext) }
      : {}) });
    return;
  }

  try {
    const pickupCode = String(randomInt(100000, 1_000_000));
    const created = await createOrderWithStock({
      customerId: profile.id,
      items,
      idempotencyKey,
      pickupCodeDigest: digestPickupCode(pickupCode),
      pickupCodeCiphertext: encryptPickupCode(pickupCode),
    });
    const stablePickupCode = created.order.pickupCodeCiphertext
      ? decryptPickupCode(created.order.pickupCodeCiphertext)
      : created.duplicate
        ? undefined
        : pickupCode;
    if (!created.duplicate) {
      void sendExpoPush({
        recipientId: profile.id,
        role: "customer",
        title: "Order placed",
        body: `${created.shop.name} received your order.`,
        data: { type: "order-update", orderId: created.order.id, section: "notifications" },
      });
      if (created.shop.ownerId) {
        void sendExpoPush({
          recipientId: created.shop.ownerId,
          role: "merchant",
          title: "New customer order",
          body: `A pickup order was placed at ${created.shop.name}.`,
          data: { type: "order-update", orderId: created.order.id, section: "notifications" },
        });
      }
    }
    res.status(created.duplicate ? 200 : 201).json({
      order: {
        id: created.order.id,
        shopId: created.order.shopId,
        shopName: created.shop.name,
        shopAddress: created.shop.address,
        shopLatitude: created.shop.latitude,
        shopLongitude: created.shop.longitude,
        items: created.order.items,
        total: created.order.total,
        status: created.order.status,
        paymentMethod: created.order.paymentMethod,
        paymentStatus: created.order.paymentStatus,
        createdAt: created.order.createdAt.toISOString(),
      },
      ...(stablePickupCode ? { pickupCode: stablePickupCode } : {}),
    });
  } catch (error) {
    const failure = error as Error & { status?: number };
    res.status(failure.status ?? 500).json({
      error: failure.status ? failure.message : "Unable to confirm this order. Please try again.",
    });
  }
});

router.post("/dukaan/orders/:orderId/pickup-code", requireAuth, async (req, res) => {
  const profile = await profileRequired(req, res);
  if (!profile) return;
  if (profile.role !== "customer") {
    res.status(403).json({ error: "Only the customer who placed this order can retrieve its pickup code." });
    return;
  }
  const order = await getOrder(pathParam(req.params.orderId));
  if (
    !order ||
    order.customerId !== profile.id ||
    ["cancelled", "completed"].includes(order.status)
  ) {
    res.status(404).json({ error: "This active order is not available." });
    return;
  }
  let currentOrder = order;
  if (!currentOrder.pickupCodeCiphertext) {
    const pickupCode = String(randomInt(100000, 1_000_000));
    const initialized = await initializePickupCodeIfMissing(
      order.id,
      profile.id,
      encryptPickupCode(pickupCode),
      digestPickupCode(pickupCode),
    );
    if (!initialized) {
      res.status(404).json({ error: "This active order is not available." });
      return;
    }
    currentOrder = initialized;
  }
  if (!currentOrder.pickupCodeCiphertext) {
    res.status(404).json({ error: "This active order is not available." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ pickupCode: decryptPickupCode(currentOrder.pickupCodeCiphertext) });
});

router.patch("/dukaan/orders/:orderId/status", requireAuth, async (req, res) => {
  const parsed = statusInput.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  const profile = await profileRequired(req, res);
  if (!profile) return;
  const order = await getOrder(pathParam(req.params.orderId));
  if (!order) {
    res.status(404).json({ error: "Order not found." });
    return;
  }
  const [shop] = await getShopsByIds([order.shopId]);
  if (!shop) {
    res.status(404).json({ error: "Shop not found." });
    return;
  }
  const customerMayCancel = profile.role === "customer" && order.customerId === profile.id &&
    parsed.data.status === "cancelled" && order.status === "pending";
  const merchantOwnsOrder = profile.role === "merchant" && shop.ownerId === profile.id;
  const completedReplay = merchantOwnsOrder && order.status === "completed" && parsed.data.status === "completed";
  const allowedMerchantTransition = merchantOwnsOrder && (
    completedReplay ||
    (order.status === "pending" && ["accepted", "cancelled"].includes(parsed.data.status)) ||
    (order.status === "accepted" && ["ready", "cancelled"].includes(parsed.data.status)) ||
    (order.status === "ready" && parsed.data.status === "completed")
  );
  const respondWithOrder = (result: Order) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      id: result.id,
      shopId: shop.id,
      shopName: shop.name,
      shopAddress: shop.address,
      shopLatitude: shop.latitude,
      shopLongitude: shop.longitude,
      items: result.items,
      total: result.total,
      status: result.status,
      paymentMethod: result.paymentMethod,
      paymentStatus: result.paymentStatus,
      createdAt: result.createdAt.toISOString(),
    });
  };
  if (!customerMayCancel && !allowedMerchantTransition) {
    res.status(403).json({ error: "This account cannot make that order-status change." });
    return;
  }
  if (parsed.data.status === "completed") {
    if (!parsed.data.pickupCode || !isMatchingDigest(parsed.data.pickupCode, order.pickupCodeDigest)) {
      res.status(400).json({ error: "Ask the customer for their six-digit pickup code." });
      return;
    }
  }
  if (completedReplay) {
    respondWithOrder(order);
    return;
  }

  let updated: Order | null;
  try {
    updated = await updateOrderStatusTransaction({
      orderId: order.id,
      expectedStatus: order.status,
      nextStatus: parsed.data.status,
      actorId: profile.id,
      shopName: shop.name,
      ...(parsed.data.status === "completed" && parsed.data.pickupCode
        ? { expectedPickupCodeDigest: digestPickupCode(parsed.data.pickupCode) }
        : {}),
    });
  } catch (error) {
    if (error instanceof OrderChangedError) {
      if (parsed.data.status === "completed" && merchantOwnsOrder && parsed.data.pickupCode) {
        const latest = await getOrder(order.id);
        if (
          latest?.status === "completed" &&
          isMatchingDigest(parsed.data.pickupCode, latest.pickupCodeDigest)
        ) {
          respondWithOrder(latest);
          return;
        }
      }
      res.status(409).json({ error: error.message });
      return;
    }
    throw error;
  }
  if (!updated) {
    res.status(404).json({ error: "Order not found." });
    return;
  }
  if (updated.status === "accepted") {
    void sendExpoPush({
      recipientId: order.customerId,
      role: "customer",
      title: "Order accepted",
      body: `${shop.name} is preparing your order.`,
      data: { type: "order-update", orderId: order.id, section: "notifications" },
    });
  } else if (updated.status === "ready") {
    void sendExpoPush({
      recipientId: order.customerId,
      role: "customer",
      title: "Ready for pickup",
      body: `Your order from ${shop.name} is ready.`,
      data: { type: "order-update", orderId: order.id, section: "notifications" },
    });
  } else if (updated.status === "completed") {
    void sendExpoPush({
      recipientId: order.customerId,
      role: "customer",
      title: "Order completed",
      body: `Your pickup from ${shop.name} is complete.`,
      data: { type: "order-update", orderId: order.id, section: "notifications" },
    });
  }
  respondWithOrder(updated);
});

router.get("/dukaan/products", requireAuth, async (req, res) => {
  const profile = await profileRequired(req, res);
  if (!profile) return;
  const shop = await approvedMerchantShop(profile, res);
  if (!shop) return;
  const rows = await listProductsForShop(shop.id);
  res.setHeader("Cache-Control", "no-store");
  res.json({ products: rows.map(publicProduct) });
});

router.post("/dukaan/products", requireAuth, async (req, res) => {
  const parsed = productInput.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  const profile = await profileRequired(req, res);
  if (!profile) return;
  const shop = await approvedMerchantShop(profile, res);
  if (!shop) return;
  const product = await createProduct({
    id: randomUUID(),
    shopId: shop.id,
    ...parsed.data,
    active: true,
  });
  await recordAudit(profile.id, "product.created", "product", product.id, {
    shopId: shop.id,
    stock: product.stock,
    price: product.price,
  });
  res.status(201).json(publicProduct(product));
});

router.patch("/dukaan/products/:productId", requireAuth, async (req, res) => {
  const parsed = productInput.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  const profile = await profileRequired(req, res);
  if (!profile) return;
  const shop = await approvedMerchantShop(profile, res);
  if (!shop) return;
  const product = await updateProduct(
    pathParam(req.params.productId),
    shop.id,
    parsed.data,
  );
  if (!product) {
    res.status(404).json({ error: "Product not found in your inventory." });
    return;
  }
  await recordAudit(profile.id, "product.updated", "product", product.id, {
    shopId: shop.id,
    stock: product.stock,
    price: product.price,
  });
  res.json(publicProduct(product));
});

router.delete("/dukaan/products/:productId", requireAuth, async (req, res) => {
  const profile = await profileRequired(req, res);
  if (!profile) return;
  const shop = await approvedMerchantShop(profile, res);
  if (!shop) return;
  const deactivated = await deactivateProduct(
    pathParam(req.params.productId),
    shop.id,
  );
  if (!deactivated) {
    res.status(404).json({ error: "Product not found in your inventory." });
    return;
  }
  await recordAudit(profile.id, "product.deactivated", "product", pathParam(req.params.productId), { shopId: shop.id });
  res.json({ success: true });
});

router.post("/dukaan/assistant", requireAuth, aiLimiter, async (req, res) => {
  const parsed = chatInput.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  const profile = await profileRequired(req, res);
  if (!profile) return;
  if (profile.role !== "customer") {
    res.status(403).json({ error: "The shopping assistant is for customer accounts." });
    return;
  }
  const catalog = await getNearbyCatalog(parsed.data.latitude, parsed.data.longitude);
  if (catalog.products.length === 0) {
    res.json({
      reply: "I couldn't find an approved shop in this area yet. Try widening the search or changing your location.",
      products: [],
      needsClarification: false,
    });
    return;
  }
  const message = safeAiText(parsed.data.message);
  const productContext = catalog.products.slice(0, 80).map((product) => ({
    id: product.id,
    name: safeAiText(product.name).slice(0, 100),
    category: safeAiText(product.category).slice(0, 40),
    unit: safeAiText(product.unit).slice(0, 30),
    price: product.price,
    stock: product.stock,
    shop: safeAiText(catalog.shops.find((shop) => shop.id === product.shopId)?.name ?? "Local shop").slice(0, 100),
  }));
  const allowedProductIds = new Set(productContext.map((product) => product.id));
  const history = (parsed.data.history ?? []).slice(-4).map((entry) => ({
    role: entry.role,
    content: safeAiText(entry.content),
  }));
  try {
    const result = await generateStructuredResponse(
      "You are Dukaan Saathi, a careful grocery shopping helper for Pakistan. Understand Urdu, Roman Urdu, and English. The only product facts you may use are in the supplied JSON catalogue. Do not invent products, prices, stock, addresses, or orders. Never place or confirm an order; the customer must review options and confirm separately. Return JSON with reply (short string), productIds (array of catalogue IDs), and needsClarification (boolean). If pack size or quantity is unclear, ask one concise follow-up and set needsClarification true.",
      JSON.stringify({ catalog: productContext, history, request: message }),
      shoppingAssistantOutputSchema(allowedProductIds),
      { onProviderFailure: (failure) => logAiProviderFailure(req, failure) },
    );
    const matches = catalog.products.filter((product) =>
      result.value.productIds.includes(product.id) &&
      allowedProductIds.has(product.id)
    );
    const productsToShow = matches.length ? matches.slice(0, 12) : catalog.products.slice(0, 6);
    res.json({
      reply: safeAiText(result.value.reply).slice(0, 600),
      products: productsToShow,
      needsClarification: result.value.needsClarification,
    });
  } catch (error) {
    req.log.warn({
      errorName: error instanceof Error ? error.name : "unknown",
    }, "Saathi shopping assistant request failed");
    res.json({
      reply: "Saathi is temporarily unavailable. You can browse these nearby products and choose what you want; nothing has been added.",
      products: catalog.products.slice(0, 6),
      needsClarification: false,
    });
  }
});

router.post("/dukaan/merchant-assistant", requireAuth, aiLimiter, async (req, res) => {
  const parsed = merchantChatInput.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  const profile = await profileRequired(req, res);
  if (!profile) return;
  const shop = await approvedMerchantShop(profile, res);
  if (!shop) return;
  const inventory = await listInventory(shop.id, 200);
  const instruction = safeAiText(parsed.data.instruction);
  const context = inventory.map((product) => ({
    id: product.id,
    name: safeAiText(product.name).slice(0, 100),
    category: safeAiText(product.category).slice(0, 40),
    unit: safeAiText(product.unit).slice(0, 30),
    price: product.price,
    stock: product.stock,
    active: product.active,
  }));
  const allowedProductIds = new Set(inventory.map((product) => product.id));
  try {
    const result = await generateStructuredResponse(
      "You help a shopkeeper prepare a single inventory change. Understand Urdu, Roman Urdu, and English. Never modify data yourself. Return JSON with reply, action (create/update/delete/clarify), and preview (productId, name, category, unit, price, stock). For update/delete, use only an exact productId from the provided inventory. For delete, set action delete and include the productId. If a required field is unclear or the product match is uncertain, use action clarify and ask one question. Never invent IDs or infer prices/quantities that were not stated.",
      JSON.stringify({ inventory: context, instruction }),
      inventoryAssistantOutputSchema(allowedProductIds),
      { onProviderFailure: (failure) => logAiProviderFailure(req, failure) },
    );
    const action = result.value.action;
    const preview = result.value.preview;
    const existing = typeof preview.productId === "string"
      ? inventory.find((product) => product.id === preview.productId)
      : undefined;
    const safeAction = action === "update" || action === "delete"
      ? (existing ? action : "clarify")
      : action;
    const normalizedPreview = safeAction === "delete" && existing
      ? { productId: existing.id, name: existing.name, category: existing.category, unit: existing.unit, price: existing.price, stock: existing.stock }
      : safeAction === "update" && existing
        ? {
          productId: existing.id,
          name: typeof preview.name === "string" ? preview.name.slice(0, 100) : existing.name,
          category: typeof preview.category === "string" ? preview.category.slice(0, 40) : existing.category,
          unit: typeof preview.unit === "string" ? preview.unit.slice(0, 30) : existing.unit,
          price: Number.isInteger(preview.price) ? preview.price : existing.price,
          stock: Number.isInteger(preview.stock) ? preview.stock : existing.stock,
        }
        : {
          name: typeof preview.name === "string" ? preview.name.slice(0, 100) : "",
          category: typeof preview.category === "string" ? preview.category.slice(0, 40) : "Grocery",
          unit: typeof preview.unit === "string" ? preview.unit.slice(0, 30) : "",
          price: Number.isInteger(preview.price) ? preview.price : 0,
          stock: Number.isInteger(preview.stock) ? preview.stock : 0,
        };
    if (
      (safeAction === "create" || safeAction === "update") &&
      (!normalizedPreview.name || !normalizedPreview.unit || !Number.isInteger(normalizedPreview.price) ||
        !Number.isInteger(normalizedPreview.stock) || Number(normalizedPreview.price) < 1 ||
        Number(normalizedPreview.stock) < 0)
    ) {
      res.json({
        reply: "I couldn't safely prepare that change. Tell me the product name, pack size, price in PKR, and stock quantity.",
        action: "clarify",
        preview: {},
      });
      return;
    }
    res.json({
      reply: safeAiText(result.value.reply).slice(0, 500),
      action: safeAction,
      preview: normalizedPreview,
    });
  } catch (error) {
    req.log.warn({
      errorName: error instanceof Error ? error.name : "unknown",
    }, "Saathi merchant assistant request failed");
    res.status(503).json({ error: "The inventory assistant is busy. You can still update products using the manual form." });
  }
});

router.post("/dukaan/transcribe", requireAuth, aiLimiter, async (req, res) => {
  const parsed = transcriptionInput.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  const profile = await profileRequired(req, res);
  if (!profile) return;
  if (profile.role !== "customer") {
    res.status(403).json({ error: "Voice shopping is available to customer accounts." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const result = await transcribeShoppingAudio(
      parsed.data.audioBase64,
      parsed.data.mimeType,
      { onProviderFailure: (failure) => logAiProviderFailure(req, failure) },
    );
    res.json({ text: safeAiText(result.value).slice(0, 1200) });
  } catch (error) {
    req.log.warn({
      errorName: error instanceof Error ? error.name : "unknown",
    }, "Saathi voice transcription failed");
    res.status(503).json({ error: "Transcription is unavailable right now. You can type your request instead." });
  }
});

router.get("/dukaan/admin/overview", requireAuth, async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const overview = await getAdminOverview();
  res.setHeader("Cache-Control", "no-store");
  res.json({
    customers: overview.customers,
    merchants: overview.merchants,
    pendingShops: overview.pendingShops,
    orders: overview.orders,
    volumePkr: overview.volumePkr,
    pendingShopApplications: overview.pendingShopApplications.map((shop) => ({
      ...shop,
      createdAt: shop.createdAt.toISOString(),
    })),
    recentEvents: overview.recentEvents.map((event) => ({
      ...event,
      createdAt: event.createdAt.toISOString(),
    })),
  });
});

router.get("/dukaan/admin/orders", requireAuth, async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const parsed = adminOrderFiltersSchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  const result = await getAdminOrderResults(parsed.data);
  res.setHeader("Cache-Control", "no-store");
  res.json({
    ...result,
    orders: result.orders.map((order) => ({
      ...order,
      createdAt: order.createdAt.toISOString(),
    })),
  });
});

router.get("/dukaan/admin/users", requireAuth, async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const parsed = adminUserSearchSchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  const result = await listAdminUsers(parsed.data.search ?? "", parsed.data.offset ?? 0);
  res.setHeader("Cache-Control", "no-store");
  res.json(result);
});

router.get("/dukaan/admin/profile-change-requests", requireAuth, async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const parsed = adminProfileChangeRequestFilterSchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  const requests = await listAdminProfileChangeRequests(
    parsed.data.status as ProfileChangeStatus | undefined,
  );
  res.setHeader("Cache-Control", "no-store");
  res.json({ requests: requests.map(profileChangeRequestDto) });
});

router.patch("/dukaan/admin/profile-change-requests/:requestId", requireAuth, async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const parsed = reviewProfileChangeRequestInput.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  const request = await reviewProfileChangeRequest({
    requestId: pathParam(req.params.requestId),
    status: parsed.data.status,
    reviewerId: admin.id,
    ...(parsed.data.rejectionReason ? { rejectionReason: parsed.data.rejectionReason } : {}),
  });
  if (!request) {
    res.status(404).json({ error: "Profile change request not found." });
    return;
  }
  res.json({ request: profileChangeRequestDto(request) });
});

router.patch("/dukaan/admin/shops/:shopId", requireAuth, async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const parsed = z.object({ status: z.enum(["approved", "rejected"]) }).strict().safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  const shop = await reviewShop(
    pathParam(req.params.shopId),
    parsed.data.status,
    admin.id,
  );
  if (!shop) {
    res.status(404).json({ error: "Merchant shop application not found." });
    return;
  }
  res.json(publicShop(shop));
});

export default router;
