import { createHash, randomUUID } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  getFirestore,
  type DocumentSnapshot,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import type {
  AppUser,
  AuditLog,
  Order,
  OrderLine,
  OrderStatusNotification,
  Product,
  ProfileChangeField,
  ProfileChangeRequest,
  ProfileChangeStatus,
  Shop,
} from "./schema/types";

export * from "./schema/types";

const COLLECTIONS = {
  users: "dukaan_users",
  shops: "dukaan_shops",
  products: "dukaan_products",
  orders: "dukaan_orders",
  audits: "dukaan_audit_logs",
  uniqueKeys: "dukaan_unique_keys",
  shopOwners: "dukaan_shop_owners",
  orderKeys: "dukaan_order_keys",
  orderNotifications: "dukaan_order_notifications",
  pushTokens: "dukaan_push_tokens",
  profileChangeRequests: "dukaan_profile_change_requests",
  profileChangeRequestLocks: "dukaan_profile_change_request_locks",
} as const;

const FIREBASE_APP_NAME = "dukaan-saathi";
let firestoreInstance: Firestore | undefined;

export class DuplicateProfileDetailsError extends Error {
  constructor() {
    super("An account already uses these details.");
    this.name = "DuplicateProfileDetailsError";
  }
}

export class DuplicateShopError extends Error {
  constructor() {
    super("A shop is already registered for this merchant account.");
    this.name = "DuplicateShopError";
  }
}

export class OrderChangedError extends Error {
  readonly status = 409;

  constructor() {
    super("The order changed. Refresh before trying again.");
    this.name = "OrderChangedError";
  }
}

export class DuplicatePendingProfileChangeRequestError extends Error {
  readonly status = 409;

  constructor() {
    super("A request for this profile field is already awaiting review.");
    this.name = "DuplicatePendingProfileChangeRequestError";
  }
}

export class ProfileChangeRequestConflictError extends Error {
  readonly status = 409;

  constructor(message = "This profile request has already been reviewed.") {
    super(message);
    this.name = "ProfileChangeRequestConflictError";
  }
}

function repositoryError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

function hashKey(namespace: string, value: string) {
  return createHash("sha256").update(`${namespace}:${value}`).digest("hex");
}

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is required to connect Firestore.");
  }

  let parsed: {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON.");
  }

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("Firebase service-account JSON is missing required fields.");
  }

  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key.replace(/\\n/g, "\n"),
  };
}

export function getFirebaseAdminApp() {
  const serviceAccount = getServiceAccount();
  const existingApp = getApps().find((app) => app.name === FIREBASE_APP_NAME);
  return existingApp ?? initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.projectId,
  }, FIREBASE_APP_NAME);
}

export function getFirebaseAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}

export function verifyFirebaseIdToken(token: string) {
  return getFirebaseAdminAuth().verifyIdToken(token);
}

function getDb(): Firestore {
  if (firestoreInstance) return firestoreInstance;
  firestoreInstance = getFirestore(getFirebaseAdminApp());
  return firestoreInstance;
}

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate();
  }
  const date = new Date(value as string | number);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Firestore returned an invalid timestamp.");
  }
  return date;
}

function fromSnapshot<T extends { id: string }>(
  snapshot: DocumentSnapshot | QueryDocumentSnapshot,
): T | null {
  if (!snapshot.exists) return null;
  const data = snapshot.data();
  if (!data) return null;
  const result: Record<string, unknown> = { ...data, id: snapshot.id };
  if (result.createdAt !== undefined) result.createdAt = asDate(result.createdAt);
  if (result.updatedAt !== undefined) result.updatedAt = asDate(result.updatedAt);
  if (result.reviewedAt !== undefined && result.reviewedAt !== null) {
    result.reviewedAt = asDate(result.reviewedAt);
  }
  return result as T;
}

function rowsFromSnapshot<T extends { id: string }>(
  snapshot: FirebaseFirestore.QuerySnapshot,
) {
  return snapshot.docs.map((doc) => fromSnapshot<T>(doc)!).filter(Boolean);
}

export async function pingFirestore() {
  await getDb().collection(COLLECTIONS.users).limit(1).get();
}

export async function recordAudit(
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, string | number | boolean> = {},
) {
  await getDb().collection(COLLECTIONS.audits).add({
    actorId,
    action,
    entityType,
    entityId,
    details,
    createdAt: new Date(),
  });
}

export async function getProfile(userId: string): Promise<AppUser | null> {
  const snapshot = await getDb().collection(COLLECTIONS.users).doc(userId).get();
  return fromSnapshot<AppUser>(snapshot);
}

export async function promoteProfileToAdmin(userId: string): Promise<AppUser | null> {
  const db = getDb();
  const userRef = db.collection(COLLECTIONS.users).doc(userId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    const profile = fromSnapshot<AppUser>(snapshot);
    if (!profile) return null;
    if (profile.role === "admin") return profile;

    const updated = { ...profile, role: "admin" };
    const auditRef = db.collection(COLLECTIONS.audits).doc();
    transaction.update(userRef, { role: "admin" });
    transaction.create(auditRef, {
      actorId: userId,
      action: "profile.admin_allowlisted",
      entityType: "profile",
      entityId: userId,
      details: { role: "admin" },
      createdAt: new Date(),
    });
    return updated;
  });
}

export async function createProfile(
  input: Omit<AppUser, "createdAt">,
): Promise<AppUser> {
  const db = getDb();
  const profileRef = db.collection(COLLECTIONS.users).doc(input.id);
  const emailKeyRef = db.collection(COLLECTIONS.uniqueKeys).doc(hashKey("email", input.email.toLowerCase()));
  const cnicKeyRef = db.collection(COLLECTIONS.uniqueKeys).doc(hashKey("cnic", input.cnicDigest));

  return db.runTransaction(async (transaction) => {
    const [profileSnapshot, emailSnapshot, cnicSnapshot] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(emailKeyRef),
      transaction.get(cnicKeyRef),
    ]);
    if (profileSnapshot.exists) {
      const current = fromSnapshot<AppUser>(profileSnapshot);
      if (current) return current;
      throw new Error("The profile document is invalid.");
    }
    const emailOwner = emailSnapshot.get("userId");
    const cnicOwner = cnicSnapshot.get("userId");
    if ((emailOwner && emailOwner !== input.id) || (cnicOwner && cnicOwner !== input.id)) {
      throw new DuplicateProfileDetailsError();
    }

    const profile: AppUser = { ...input, createdAt: new Date() };
    transaction.create(profileRef, profile);
    transaction.create(emailKeyRef, { userId: input.id });
    transaction.create(cnicKeyRef, { userId: input.id });
    return profile;
  });
}

function profileChangeLockId(userId: string, field: ProfileChangeField) {
  return hashKey("profile-change-request-lock", `${userId}:${field}`);
}

export async function createProfileChangeRequest(input: {
  userId: string;
  field: ProfileChangeField;
  requestedValue: string;
}): Promise<ProfileChangeRequest> {
  const db = getDb();
  const profileRef = db.collection(COLLECTIONS.users).doc(input.userId);
  const requestRef = db.collection(COLLECTIONS.profileChangeRequests).doc(randomUUID());
  const lockRef = db.collection(COLLECTIONS.profileChangeRequestLocks)
    .doc(profileChangeLockId(input.userId, input.field));
  const auditRef = db.collection(COLLECTIONS.audits).doc();

  return db.runTransaction(async (transaction) => {
    const [profileSnapshot, lockSnapshot] = await transaction.getAll(profileRef, lockRef);
    const profile = fromSnapshot<AppUser>(profileSnapshot);
    if (!profile || (profile.role !== "customer" && profile.role !== "merchant")) {
      throw repositoryError("Only customer and merchant accounts can request profile changes.", 403);
    }
    if (lockSnapshot.exists) throw new DuplicatePendingProfileChangeRequestError();

    const currentValue = profile[input.field];
    if (currentValue === input.requestedValue) {
      throw repositoryError("The requested value is already on your profile.", 400);
    }

    const request: ProfileChangeRequest = {
      id: requestRef.id,
      userId: profile.id,
      userName: profile.name,
      userEmail: profile.email,
      userRole: profile.role,
      field: input.field,
      currentValue,
      requestedValue: input.requestedValue,
      status: "pending",
      createdAt: new Date(),
      reviewedAt: null,
      reviewedBy: null,
      reviewerName: null,
      rejectionReason: null,
    };
    transaction.create(requestRef, request);
    transaction.create(lockRef, { requestId: request.id, createdAt: request.createdAt });
    transaction.create(auditRef, {
      actorId: profile.id,
      action: "profile_change.pending",
      entityType: "profile_change_request",
      entityId: request.id,
      details: { field: request.field, status: request.status },
      createdAt: request.createdAt,
    });
    return request;
  });
}

export async function listProfileChangeRequests(userId: string): Promise<ProfileChangeRequest[]> {
  const snapshot = await getDb().collection(COLLECTIONS.profileChangeRequests)
    .where("userId", "==", userId)
    .get();
  return rowsFromSnapshot<ProfileChangeRequest>(snapshot)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 100);
}

export async function provisionDemoProfile(input: {
  id: string;
  email: string;
  name: string;
  role: "admin" | "merchant" | "customer";
}): Promise<AppUser> {
  const db = getDb();
  const email = input.email.trim().toLowerCase();
  const profileRef = db.collection(COLLECTIONS.users).doc(input.id);
  const emailKeyRef = db.collection(COLLECTIONS.uniqueKeys).doc(hashKey("email", email));
  const cnicDigest = hashKey("demo-profile", input.id);
  const cnicKeyRef = db.collection(COLLECTIONS.uniqueKeys).doc(hashKey("cnic", cnicDigest));

  return db.runTransaction(async (transaction) => {
    const [profileSnapshot, emailSnapshot, cnicSnapshot] = await transaction.getAll(
      profileRef,
      emailKeyRef,
      cnicKeyRef,
    );
    const emailOwner = emailSnapshot.exists ? emailSnapshot.get("userId") : undefined;
    const cnicOwner = cnicSnapshot.exists ? cnicSnapshot.get("userId") : undefined;
    if (
      (emailSnapshot.exists && typeof emailOwner !== "string") ||
      (cnicSnapshot.exists && typeof cnicOwner !== "string")
    ) {
      throw new Error("A demo profile uniqueness record is invalid.");
    }
    if (
      (emailOwner && emailOwner !== input.id) ||
      (cnicOwner && cnicOwner !== input.id)
    ) {
      throw new DuplicateProfileDetailsError();
    }

    const current = fromSnapshot<AppUser>(profileSnapshot);
    const now = new Date();
    const auditRef = db.collection(COLLECTIONS.audits).doc();
    if (current) {
      if (current.email.toLowerCase() !== email) {
        throw new DuplicateProfileDetailsError();
      }
      const roleChanged = current.role !== input.role;
      if (!emailSnapshot.exists) transaction.create(emailKeyRef, { userId: input.id });
      if (!cnicSnapshot.exists) transaction.create(cnicKeyRef, { userId: input.id });
      if (roleChanged) {
        transaction.update(profileRef, { role: input.role });
        transaction.create(auditRef, {
          actorId: input.id,
          action: "profile.demo_role_assigned",
          entityType: "profile",
          entityId: input.id,
          details: { role: input.role },
          createdAt: now,
        });
      }
      return { ...current, role: input.role };
    }

    const profile: AppUser = {
      id: input.id,
      name: input.name.trim(),
      email,
      phone: "",
      cnicDigest,
      cnicLast4: "",
      role: input.role,
      createdAt: now,
      isDemo: true,
    };
    transaction.create(profileRef, profile);
    if (!emailSnapshot.exists) transaction.create(emailKeyRef, { userId: input.id });
    if (!cnicSnapshot.exists) transaction.create(cnicKeyRef, { userId: input.id });
    transaction.create(auditRef, {
      actorId: input.id,
      action: "profile.demo_provisioned",
      entityType: "profile",
      entityId: input.id,
      details: { role: input.role },
      createdAt: now,
    });
    return profile;
  });
}

function ownerClaimId(ownerId: string) {
  return hashKey("shop-owner", ownerId);
}

export async function shopForOwner(ownerId: string): Promise<Shop | null> {
  const db = getDb();
  const claim = await db.collection(COLLECTIONS.shopOwners).doc(ownerClaimId(ownerId)).get();
  if (claim.exists) {
    const shopId = claim.get("shopId");
    if (typeof shopId === "string") {
      const shop = await db.collection(COLLECTIONS.shops).doc(shopId).get();
      const value = fromSnapshot<Shop>(shop);
      if (value) return value;
    }
  }
  const snapshot = await db.collection(COLLECTIONS.shops)
    .where("ownerId", "==", ownerId)
    .limit(1)
    .get();
  return rowsFromSnapshot<Shop>(snapshot)[0] ?? null;
}

export async function createShop(input: Omit<Shop, "createdAt">): Promise<Shop> {
  const db = getDb();
  const shopRef = db.collection(COLLECTIONS.shops).doc(input.id);
  const claimRef = db.collection(COLLECTIONS.shopOwners).doc(ownerClaimId(input.ownerId ?? ""));
  return db.runTransaction(async (transaction) => {
    const claim = await transaction.get(claimRef);
    if (claim.exists) throw new DuplicateShopError();
    const shop: Shop = { ...input, createdAt: new Date() };
    transaction.create(shopRef, shop);
    transaction.create(claimRef, { ownerId: input.ownerId, shopId: input.id });
    return shop;
  });
}

export async function updateShopDetailsForOwner(
  ownerId: string,
  input: Pick<Shop, "name" | "address" | "latitude" | "longitude">,
): Promise<Shop | null> {
  const existingShop = await shopForOwner(ownerId);
  if (!existingShop || existingShop.ownerId !== ownerId) return null;

  const db = getDb();
  const shopRef = db.collection(COLLECTIONS.shops).doc(existingShop.id);
  const claimRef = db.collection(COLLECTIONS.shopOwners).doc(ownerClaimId(ownerId));
  const auditRef = db.collection(COLLECTIONS.audits).doc();

  return db.runTransaction(async (transaction) => {
    const [shopSnapshot, claimSnapshot] = await transaction.getAll(shopRef, claimRef);
    const shop = fromSnapshot<Shop>(shopSnapshot);
    if (!shop || shop.ownerId !== ownerId) return null;
    if (claimSnapshot.exists && claimSnapshot.get("shopId") !== shop.id) return null;

    const updatedAt = new Date();
    const updated: Shop = { ...shop, ...input };
    transaction.update(shopRef, input);
    if (!claimSnapshot.exists) {
      transaction.create(claimRef, { ownerId, shopId: shop.id });
    }
    transaction.create(auditRef, {
      actorId: ownerId,
      action: "shop.details_updated",
      entityType: "shop",
      entityId: shop.id,
      details: { fields: "name,address,location" },
      createdAt: updatedAt,
    });
    return updated;
  });
}

export async function seedDemoShopForOwner(input: {
  id: string;
  ownerId: string;
  name: string;
  address: string;
  contact: string;
  latitude: number;
  longitude: number;
  products: Omit<Product, "shopId" | "updatedAt" | "isDemo">[];
}): Promise<Shop> {
  const db = getDb();
  const shopRef = db.collection(COLLECTIONS.shops).doc(input.id);
  const claimRef = db.collection(COLLECTIONS.shopOwners).doc(ownerClaimId(input.ownerId));
  const productRefs = input.products.map(({ id }) =>
    db.collection(COLLECTIONS.products).doc(id)
  );

  return db.runTransaction(async (transaction) => {
    const snapshots = await transaction.getAll(shopRef, claimRef, ...productRefs);
    const shopSnapshot = snapshots[0]!;
    const claimSnapshot = snapshots[1]!;
    const current = fromSnapshot<Shop>(shopSnapshot);
    if (claimSnapshot.exists && claimSnapshot.get("shopId") !== input.id) {
      throw new DuplicateShopError();
    }
    if (current && (current.ownerId !== input.ownerId || !current.isDemo)) {
      throw new Error("The demo shop ID is already used by a non-demo shop.");
    }

    const now = new Date();
    const shop: Shop = current ?? {
      id: input.id,
      ownerId: input.ownerId,
      name: input.name,
      address: input.address,
      contact: input.contact,
      latitude: input.latitude,
      longitude: input.longitude,
      status: "approved",
      isDemo: true,
      createdAt: now,
    };
    let hasWrites = false;
    if (!current) {
      transaction.create(shopRef, shop);
      hasWrites = true;
    }
    if (!claimSnapshot.exists) {
      transaction.create(claimRef, { ownerId: input.ownerId, shopId: input.id });
      hasWrites = true;
    }

    input.products.forEach((product, index) => {
      const productSnapshot = snapshots[index + 2]!;
      if (productSnapshot.exists) {
        const existingShopId = productSnapshot.get("shopId");
        if (existingShopId !== input.id || productSnapshot.get("isDemo") !== true) {
          throw new Error("A demo product ID is already used by non-demo data.");
        }
        return;
      }
      transaction.create(productRefs[index]!, {
        ...product,
        shopId: input.id,
        updatedAt: now,
        isDemo: true,
      });
      hasWrites = true;
    });

    if (hasWrites) {
      const auditRef = db.collection(COLLECTIONS.audits).doc();
      transaction.create(auditRef, {
        actorId: input.ownerId,
        action: "shop.demo_seeded",
        entityType: "shop",
        entityId: input.id,
        details: { productCount: input.products.length },
        createdAt: now,
      });
    }
    return shop;
  });
}

export async function seedDemoCatalog() {
  const db = getDb();
  const demoShopId = "11111111-1111-4111-8111-111111111111";
  const demoProducts = [
    ["22222222-2222-4222-8222-222222222221", "Fresh atta", "Flour", "5 kg bag", 780, 18],
    ["22222222-2222-4222-8222-222222222222", "White sugar", "Pantry", "1 kg bag", 170, 30],
    ["22222222-2222-4222-8222-222222222223", "Basmati rice", "Grains", "1 kg bag", 330, 14],
    ["22222222-2222-4222-8222-222222222224", "UHT milk", "Dairy", "1 litre", 250, 22],
    ["22222222-2222-4222-8222-222222222225", "Masoor daal", "Pulses", "1 kg bag", 390, 12],
    ["22222222-2222-4222-8222-222222222226", "Cooking oil", "Pantry", "1 litre", 570, 9],
  ] as const;
  const shopRef = db.collection(COLLECTIONS.shops).doc(demoShopId);
  const productRefs = demoProducts.map(([id]) => db.collection(COLLECTIONS.products).doc(id));

  await db.runTransaction(async (transaction) => {
    const snapshots = await transaction.getAll(shopRef, ...productRefs);
    if (!snapshots[0]!.exists) {
      transaction.create(shopRef, {
        id: demoShopId,
        ownerId: null,
        name: "Saathi demo store",
        address: "Demo-only listing · Mirpur Khas",
        contact: "Demo listing",
        latitude: 25.5276,
        longitude: 69.0416,
        status: "approved",
        isDemo: true,
        createdAt: new Date(),
      });
    }
    demoProducts.forEach(([id, name, category, unit, price, stock], index) => {
      if (snapshots[index + 1]!.exists) return;
      transaction.create(productRefs[index]!, {
        id,
        shopId: demoShopId,
        name,
        category,
        unit,
        price,
        stock,
        active: true,
        updatedAt: new Date(),
        isDemo: true,
      });
    });
  });
}

export async function listApprovedShops(): Promise<Shop[]> {
  const snapshot = await getDb().collection(COLLECTIONS.shops)
    .where("status", "==", "approved")
    .get();
  return rowsFromSnapshot<Shop>(snapshot);
}

export async function listProductsForShops(
  shopIds: string[],
  activeOnly = false,
): Promise<Product[]> {
  if (shopIds.length === 0) return [];
  const db = getDb();
  const chunks: string[][] = [];
  for (let index = 0; index < shopIds.length; index += 30) {
    chunks.push(shopIds.slice(index, index + 30));
  }
  const snapshots = await Promise.all(chunks.map((ids) =>
    db.collection(COLLECTIONS.products).where("shopId", "in", ids).get()
  ));
  const products = snapshots.flatMap((snapshot) => rowsFromSnapshot<Product>(snapshot));
  return activeOnly ? products.filter((product) => product.active) : products;
}

export async function listOrdersForProfile(profile: AppUser): Promise<Order[]> {
  const db = getDb();
  if (profile.role === "customer") {
    const snapshot = await db.collection(COLLECTIONS.orders)
      .where("customerId", "==", profile.id)
      .get();
    return rowsFromSnapshot<Order>(snapshot).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  if (profile.role === "merchant") {
    const shop = await shopForOwner(profile.id);
    if (!shop) return [];
    const snapshot = await db.collection(COLLECTIONS.orders)
      .where("shopId", "==", shop.id)
      .get();
    return rowsFromSnapshot<Order>(snapshot).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  const snapshot = await db.collection(COLLECTIONS.orders)
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();
  return rowsFromSnapshot<Order>(snapshot);
}

export async function getShopsByIds(shopIds: string[]): Promise<Shop[]> {
  if (shopIds.length === 0) return [];
  const db = getDb();
  const snapshots = await Promise.all(
    [...new Set(shopIds)].map((id) => db.collection(COLLECTIONS.shops).doc(id).get()),
  );
  return snapshots.map((snapshot) => fromSnapshot<Shop>(snapshot)).filter((shop): shop is Shop => !!shop);
}

function orderKeyId(customerId: string, idempotencyKey: string) {
  return hashKey("order-idempotency", `${customerId}:${idempotencyKey}`);
}

function orderStatusNotificationId(orderId: string, status: OrderStatusNotification["status"]) {
  return hashKey("order-status-notification", `${orderId}:${status}`);
}

function merchantOrderStatusNotificationId(
  orderId: string,
  status: OrderStatusNotification["status"],
  merchantId: string,
) {
  return hashKey("merchant-order-status-notification", `${orderId}:${status}:${merchantId}`);
}

export async function findOrderByIdempotency(
  customerId: string,
  idempotencyKey: string,
): Promise<{ order: Order; shop: Shop | null } | null> {
  const db = getDb();
  const key = await db.collection(COLLECTIONS.orderKeys)
    .doc(orderKeyId(customerId, idempotencyKey))
    .get();
  if (!key.exists) return null;
  const orderId = key.get("orderId");
  if (typeof orderId !== "string") throw new Error("Order idempotency record is invalid.");
  const orderSnapshot = await db.collection(COLLECTIONS.orders).doc(orderId).get();
  const order = fromSnapshot<Order>(orderSnapshot);
  if (!order) throw new Error("Order idempotency record points to a missing order.");
  const shopSnapshot = await db.collection(COLLECTIONS.shops).doc(order.shopId).get();
  return { order, shop: fromSnapshot<Shop>(shopSnapshot) };
}

export async function createOrderWithStock(input: {
  customerId: string;
  items: { productId: string; quantity: number }[];
  idempotencyKey: string;
  pickupCodeDigest: string;
  pickupCodeCiphertext?: string;
  isDemo?: boolean;
}): Promise<{ order: Order; shop: Shop; duplicate: boolean }> {
  const db = getDb();
  const keyRef = db.collection(COLLECTIONS.orderKeys)
    .doc(orderKeyId(input.customerId, input.idempotencyKey));
  const orderRef = db.collection(COLLECTIONS.orders).doc(randomUUID());
  const productRefs = input.items.map(({ productId }) =>
    db.collection(COLLECTIONS.products).doc(productId)
  );

  return db.runTransaction(async (transaction) => {
    const keySnapshot = await transaction.get(keyRef);
    if (keySnapshot.exists) {
      const existingId = keySnapshot.get("orderId");
      if (typeof existingId !== "string") throw new Error("Order idempotency record is invalid.");
      const existingSnapshot = await transaction.get(db.collection(COLLECTIONS.orders).doc(existingId));
      const existingOrder = fromSnapshot<Order>(existingSnapshot);
      if (!existingOrder) throw new Error("Order idempotency record points to a missing order.");
      const existingShopSnapshot = await transaction.get(
        db.collection(COLLECTIONS.shops).doc(existingOrder.shopId),
      );
      const existingShop = fromSnapshot<Shop>(existingShopSnapshot);
      if (!existingShop) throw new Error("The shop for this order could not be found.");
      return { order: existingOrder, shop: existingShop, duplicate: true };
    }

    const productSnapshots = await transaction.getAll(...productRefs);
    const productRows = productSnapshots
      .map((snapshot) => fromSnapshot<Product>(snapshot))
      .filter((product): product is Product => !!product);
    if (productRows.length !== input.items.length || productRows.some((product) => !product.active)) {
      throw repositoryError("One or more products are no longer available.", 409);
    }
    const shopIds = [...new Set(productRows.map((product) => product.shopId))];
    if (shopIds.length !== 1) {
      throw repositoryError("Pickup orders must come from one shop.", 400);
    }
    const shopRef = db.collection(COLLECTIONS.shops).doc(shopIds[0]!);
    const shopSnapshot = await transaction.get(shopRef);
    const shop = fromSnapshot<Shop>(shopSnapshot);
    if (!shop || shop.status !== "approved") {
      throw repositoryError("This shop is not currently accepting orders.", 409);
    }
    const pendingNotificationRef = db.collection(COLLECTIONS.orderNotifications)
      .doc(orderStatusNotificationId(orderRef.id, "pending"));
    const pendingNotificationSnapshot = await transaction.get(pendingNotificationRef);
    const merchantNotificationRef = shop.ownerId
      ? db.collection(COLLECTIONS.orderNotifications)
        .doc(merchantOrderStatusNotificationId(orderRef.id, "pending", shop.ownerId))
      : null;
    const merchantNotificationSnapshot = merchantNotificationRef
      ? await transaction.get(merchantNotificationRef)
      : null;

    const productById = new Map(productRows.map((product) => [product.id, product]));
    const lines: OrderLine[] = input.items.map((item) => {
      const product = productById.get(item.productId)!;
      if (product.stock < item.quantity) {
        throw repositoryError(
          `Only ${product.stock} ${product.unit} currently available for ${product.name}.`,
          409,
        );
      }
      return {
        productId: product.id,
        name: product.name,
        unit: product.unit,
        quantity: item.quantity,
        price: product.price,
        lineTotal: product.price * item.quantity,
      };
    });
    const now = new Date();
    const order: Order = {
      id: orderRef.id,
      customerId: input.customerId,
      shopId: shop.id,
      items: lines,
      total: lines.reduce((total, line) => total + line.lineTotal, 0),
      status: "pending",
      paymentMethod: "pay_on_pickup",
      paymentStatus: "due_at_pickup",
      idempotencyKey: input.idempotencyKey,
      pickupCodeDigest: input.pickupCodeDigest,
      ...(input.pickupCodeCiphertext
        ? { pickupCodeCiphertext: input.pickupCodeCiphertext }
        : {}),
      createdAt: now,
      updatedAt: now,
      ...(input.isDemo ? { isDemo: true } : {}),
    };
    const auditRef = db.collection(COLLECTIONS.audits).doc();
    for (const line of lines) {
      const product = productById.get(line.productId)!;
      transaction.update(db.collection(COLLECTIONS.products).doc(line.productId), {
        stock: product.stock - line.quantity,
        updatedAt: now,
      });
    }
    transaction.create(orderRef, order);
    transaction.create(keyRef, { orderId: order.id, customerId: input.customerId });
    transaction.create(auditRef, {
      actorId: input.customerId,
      action: "order.created",
      entityType: "order",
      entityId: order.id,
      details: { shopId: shop.id, itemCount: lines.length, total: order.total },
      createdAt: now,
    });
    if (!pendingNotificationSnapshot.exists) {
      const notification: OrderStatusNotification = {
        id: pendingNotificationRef.id,
        customerId: input.customerId,
        orderId: order.id,
        shopId: shop.id,
        shopName: shop.name,
        status: "pending",
        previousStatus: null,
        isRead: false,
        createdAt: now,
      };
      transaction.create(pendingNotificationRef, notification);
    }
    if (
      shop.ownerId &&
      merchantNotificationRef &&
      !merchantNotificationSnapshot?.exists
    ) {
      const notification: OrderStatusNotification = {
        id: merchantNotificationRef.id,
        merchantId: shop.ownerId,
        orderId: order.id,
        shopId: shop.id,
        shopName: shop.name,
        status: "pending",
        previousStatus: null,
        isRead: false,
        createdAt: now,
      };
      transaction.create(merchantNotificationRef, notification);
    }
    return { order, shop, duplicate: false };
  });
}

export async function getOrder(orderId: string): Promise<Order | null> {
  const snapshot = await getDb().collection(COLLECTIONS.orders).doc(orderId).get();
  return fromSnapshot<Order>(snapshot);
}

export async function initializePickupCodeIfMissing(
  orderId: string,
  customerId: string,
  pickupCodeCiphertext: string,
  pickupCodeDigest: string,
): Promise<Order | null> {
  const db = getDb();
  const orderRef = db.collection(COLLECTIONS.orders).doc(orderId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    const order = fromSnapshot<Order>(snapshot);
    if (
      !order ||
      order.customerId !== customerId ||
      ["cancelled", "completed"].includes(order.status)
    ) {
      return null;
    }
    if (order.pickupCodeCiphertext) return order;
    const auditRef = db.collection(COLLECTIONS.audits).doc();
    const now = new Date();
    const updated = { ...order, pickupCodeCiphertext, pickupCodeDigest, updatedAt: now };
    transaction.update(orderRef, { pickupCodeCiphertext, pickupCodeDigest, updatedAt: now });
    transaction.create(auditRef, {
      actorId: customerId,
      action: "order.pickup_code_initialized",
      entityType: "order",
      entityId: orderId,
      details: {},
      createdAt: now,
    });
    return updated;
  });
}

export async function updateOrderStatusTransaction(input: {
  orderId: string;
  expectedStatus: string;
  nextStatus: string;
  actorId: string;
  shopName: string;
  expectedPickupCodeDigest?: string;
}): Promise<Order | null> {
  const db = getDb();
  const orderRef = db.collection(COLLECTIONS.orders).doc(input.orderId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    const current = fromSnapshot<Order>(snapshot);
    if (!current) return null;
    if (current.status !== input.expectedStatus) throw new OrderChangedError();
    if (
      input.nextStatus === "completed" &&
      input.expectedPickupCodeDigest !== current.pickupCodeDigest
    ) {
      throw repositoryError("The pickup code changed. Ask the customer for the current code.", 400);
    }

    const notificationStatus: OrderStatusNotification["status"] | null =
      input.nextStatus === "accepted" ||
      input.nextStatus === "ready" ||
      input.nextStatus === "completed"
        ? input.nextStatus
        : null;
    const notificationRef = notificationStatus
      ? db.collection(COLLECTIONS.orderNotifications)
        .doc(orderStatusNotificationId(current.id, notificationStatus))
      : null;
    const notificationSnapshot = notificationRef
      ? await transaction.get(notificationRef)
      : null;

    const productRefs = input.nextStatus === "cancelled"
      ? current.items.map((line) => db.collection(COLLECTIONS.products).doc(line.productId))
      : [];
    const productSnapshots = productRefs.length
      ? await transaction.getAll(...productRefs)
      : [];
    const productsById = new Map(
      productSnapshots
        .map((productSnapshot) => fromSnapshot<Product>(productSnapshot))
        .filter((product): product is Product => !!product)
        .map((product) => [product.id, product]),
    );
    if (productRefs.length && productsById.size !== productRefs.length) {
      throw new Error("Cannot restore stock because an order product is missing.");
    }

    const now = new Date();
    if (input.nextStatus === "cancelled") {
      for (const line of current.items) {
        const product = productsById.get(line.productId)!;
        transaction.update(db.collection(COLLECTIONS.products).doc(line.productId), {
          stock: product.stock + line.quantity,
          updatedAt: now,
        });
      }
    }
    const updated = { ...current, status: input.nextStatus, updatedAt: now };
    const auditRef = db.collection(COLLECTIONS.audits).doc();
    transaction.update(orderRef, { status: input.nextStatus, updatedAt: now });
    transaction.create(auditRef, {
      actorId: input.actorId,
      action: `order.${input.nextStatus}`,
      entityType: "order",
      entityId: input.orderId,
      details: { previousStatus: current.status },
      createdAt: now,
    });
    if (
      notificationRef &&
      notificationStatus &&
      !notificationSnapshot?.exists
    ) {
      const notification: OrderStatusNotification = {
        id: notificationRef.id,
        customerId: current.customerId,
        orderId: current.id,
        shopId: current.shopId,
        shopName: input.shopName,
        status: notificationStatus,
        previousStatus: current.status,
        isRead: false,
        createdAt: now,
      };
      transaction.create(notificationRef, notification);
    }
    return updated;
  });
}

type NotificationRecipientRole = "customer" | "merchant";
type PushTokenPlatform = "ios" | "android";
type StoredPushToken = {
  id: string;
  recipientId: string;
  role: NotificationRecipientRole;
  token: string;
  platform: PushTokenPlatform;
  createdAt: Date;
  updatedAt: Date;
};

export async function registerExpoPushToken(input: {
  recipientId: string;
  role: NotificationRecipientRole;
  token: string;
  platform: PushTokenPlatform;
}): Promise<string> {
  const db = getDb();
  const tokenId = hashKey("dukaan-expo-push-token", input.token);
  const tokenRef = db.collection(COLLECTIONS.pushTokens).doc(tokenId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(tokenRef);
    const existing = fromSnapshot<StoredPushToken>(snapshot);
    const now = new Date();
    transaction.set(tokenRef, {
      id: tokenId,
      recipientId: input.recipientId,
      role: input.role,
      token: input.token,
      platform: input.platform,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  });
  return tokenId;
}

export async function listExpoPushTokens(
  recipientId: string,
  role: NotificationRecipientRole,
): Promise<StoredPushToken[]> {
  const snapshot = await getDb().collection(COLLECTIONS.pushTokens)
    .where("recipientId", "==", recipientId)
    .get();
  return rowsFromSnapshot<StoredPushToken>(snapshot)
    .filter((record) => record.role === role);
}

export async function removeExpoPushToken(
  recipientId: string,
  role: NotificationRecipientRole,
  tokenId: string,
): Promise<boolean> {
  const db = getDb();
  const tokenRef = db.collection(COLLECTIONS.pushTokens).doc(tokenId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(tokenRef);
    const record = fromSnapshot<StoredPushToken>(snapshot);
    if (!record || record.recipientId !== recipientId || record.role !== role) return false;
    transaction.delete(tokenRef);
    return true;
  });
}

export async function removeInvalidExpoPushToken(tokenId: string, token: string): Promise<void> {
  const db = getDb();
  const tokenRef = db.collection(COLLECTIONS.pushTokens).doc(tokenId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(tokenRef);
    const record = fromSnapshot<StoredPushToken>(snapshot);
    if (record?.token === token) transaction.delete(tokenRef);
  });
}

function notificationRecipientField(
  role: NotificationRecipientRole,
): "customerId" | "merchantId" {
  return role === "customer" ? "customerId" : "merchantId";
}

export async function listOrderStatusNotifications(
  recipientId: string,
  role: NotificationRecipientRole,
): Promise<OrderStatusNotification[]> {
  const snapshot = await getDb().collection(COLLECTIONS.orderNotifications)
    .where(notificationRecipientField(role), "==", recipientId)
    .get();
  return rowsFromSnapshot<OrderStatusNotification>(snapshot)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function markOrderStatusNotificationRead(
  recipientId: string,
  role: NotificationRecipientRole,
  notificationId: string,
): Promise<OrderStatusNotification | null> {
  const db = getDb();
  const notificationRef = db.collection(COLLECTIONS.orderNotifications).doc(notificationId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(notificationRef);
    const notification = fromSnapshot<OrderStatusNotification>(snapshot);
    if (!notification || notification[notificationRecipientField(role)] !== recipientId) return null;
    if (notification.isRead) return notification;
    transaction.update(notificationRef, { isRead: true });
    return { ...notification, isRead: true };
  });
}

export async function markAllOrderStatusNotificationsRead(
  recipientId: string,
  role: NotificationRecipientRole,
): Promise<number> {
  const db = getDb();
  const snapshot = await db.collection(COLLECTIONS.orderNotifications)
    .where(notificationRecipientField(role), "==", recipientId)
    .get();
  const unreadDocuments = snapshot.docs.filter((document) => document.get("isRead") !== true);

  for (let start = 0; start < unreadDocuments.length; start += 450) {
    const batch = db.batch();
    for (const document of unreadDocuments.slice(start, start + 450)) {
      batch.update(document.ref, { isRead: true });
    }
    await batch.commit();
  }

  return unreadDocuments.length;
}

export async function listProductsForShop(shopId: string): Promise<Product[]> {
  const snapshot = await getDb().collection(COLLECTIONS.products)
    .where("shopId", "==", shopId)
    .get();
  return rowsFromSnapshot<Product>(snapshot).sort((a, b) => a.name.localeCompare(b.name));
}

export async function createProduct(input: Omit<Product, "updatedAt">): Promise<Product> {
  const product: Product = { ...input, updatedAt: new Date() };
  await getDb().collection(COLLECTIONS.products).doc(product.id).create(product);
  return product;
}

export async function updateProduct(
  productId: string,
  shopId: string,
  changes: Pick<Product, "name" | "category" | "unit" | "price" | "stock">,
): Promise<Product | null> {
  const db = getDb();
  const productRef = db.collection(COLLECTIONS.products).doc(productId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(productRef);
    const current = fromSnapshot<Product>(snapshot);
    if (!current || current.shopId !== shopId) return null;
    const updated = { ...current, ...changes, updatedAt: new Date() };
    transaction.update(productRef, { ...changes, updatedAt: updated.updatedAt });
    return updated;
  });
}

export async function deactivateProduct(
  productId: string,
  shopId: string,
): Promise<boolean> {
  const db = getDb();
  const productRef = db.collection(COLLECTIONS.products).doc(productId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(productRef);
    const current = fromSnapshot<Product>(snapshot);
    if (!current || current.shopId !== shopId) return false;
    transaction.update(productRef, { active: false, updatedAt: new Date() });
    return true;
  });
}

export async function listInventory(shopId: string, limit = 200): Promise<Product[]> {
  return (await listProductsForShop(shopId)).slice(0, limit);
}

export async function getAdminOverview() {
  const db = getDb();
  const [usersSnapshot, shopsSnapshot, ordersSnapshot, pendingSnapshot, auditSnapshot] =
    await Promise.all([
      db.collection(COLLECTIONS.users).get(),
      db.collection(COLLECTIONS.shops).get(),
      db.collection(COLLECTIONS.orders).get(),
      db.collection(COLLECTIONS.shops).where("status", "==", "pending").limit(50).get(),
      db.collection(COLLECTIONS.audits).orderBy("createdAt", "desc").limit(30).get(),
    ]);
  const users = rowsFromSnapshot<AppUser>(usersSnapshot);
  const userById = new Map(users.map((user) => [user.id, user]));
  const orders = rowsFromSnapshot<Order>(ordersSnapshot);
  const pendingShopApplications = rowsFromSnapshot<Shop>(pendingSnapshot)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((shop) => ({
      id: shop.id,
      name: shop.name,
      address: shop.address,
      contact: shop.contact,
      latitude: shop.latitude,
      longitude: shop.longitude,
      ownerName: shop.ownerId ? userById.get(shop.ownerId)?.name ?? "" : "",
      ownerPhone: shop.ownerId ? userById.get(shop.ownerId)?.phone ?? "" : "",
      createdAt: shop.createdAt,
    }));
  const recentEvents = rowsFromSnapshot<AuditLog>(auditSnapshot).map((event) => ({
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    createdAt: event.createdAt,
  }));

  return {
    customers: users.filter((user) => user.role === "customer").length,
    merchants: users.filter((user) => user.role === "merchant").length,
    pendingShops: shopsSnapshot.docs.filter((doc) => doc.get("status") === "pending").length,
    orders: orders.length,
    volumePkr: orders.reduce((sum, order) => sum + order.total, 0),
    pendingShopApplications,
    recentEvents,
  };
}

export async function getAdminOrderResults(filters: {
  startDate?: string;
  endDate?: string;
  shopId?: string;
  productName?: string;
  status?: string;
  minAmount?: number;
  maxAmount?: number;
}) {
  const db = getDb();
  const [ordersSnapshot, shopsSnapshot] = await Promise.all([
    db.collection(COLLECTIONS.orders).get(),
    db.collection(COLLECTIONS.shops).get(),
  ]);
  const shops = rowsFromSnapshot<Shop>(shopsSnapshot);
  const shopById = new Map(shops.map((shop) => [shop.id, shop]));
  const productSearch = filters.productName?.trim().toLocaleLowerCase() ?? "";
  const startTime = filters.startDate
    ? new Date(`${filters.startDate}T00:00:00.000Z`).getTime()
    : Number.NEGATIVE_INFINITY;
  const endTime = filters.endDate
    ? new Date(`${filters.endDate}T23:59:59.999Z`).getTime()
    : Number.POSITIVE_INFINITY;
  const matchingOrders = rowsFromSnapshot<Order>(ordersSnapshot)
    .filter((order) => {
      const createdAt = order.createdAt.getTime();
      return createdAt >= startTime &&
        createdAt <= endTime &&
        (!filters.shopId || order.shopId === filters.shopId) &&
        (!filters.status || order.status === filters.status) &&
        (filters.minAmount === undefined || order.total >= filters.minAmount) &&
        (filters.maxAmount === undefined || order.total <= filters.maxAmount) &&
        (!productSearch || order.items.some((item) => item.name.toLocaleLowerCase().includes(productSearch)));
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return {
    shops: shops
      .map(({ id, name }) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    totalCount: matchingOrders.length,
    averageAmount: matchingOrders.length
      ? Math.round((matchingOrders.reduce((sum, order) => sum + order.total, 0) / matchingOrders.length) * 100) / 100
      : 0,
    orders: matchingOrders.slice(0, 100).map((order) => ({
      id: order.id,
      shopId: order.shopId,
      shopName: shopById.get(order.shopId)?.name ?? "Local shop",
      productNames: [...new Set(order.items.map((item) => item.name))],
      total: order.total,
      status: order.status,
      createdAt: order.createdAt,
    })),
  };
}

export async function listAdminUsers(search: string, offset = 0) {
  const db = getDb();
  const [usersSnapshot, shopsSnapshot] = await Promise.all([
    db.collection(COLLECTIONS.users).get(),
    db.collection(COLLECTIONS.shops).get(),
  ]);
  const shopByOwner = new Map<string, Shop>();
  rowsFromSnapshot<Shop>(shopsSnapshot)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .forEach((shop) => {
      if (shop.ownerId && !shopByOwner.has(shop.ownerId)) shopByOwner.set(shop.ownerId, shop);
    });
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const matchedUsers = rowsFromSnapshot<AppUser>(usersSnapshot)
    .filter((user) => user.role === "customer" || user.role === "merchant")
    .map((user) => {
      const shop = user.role === "merchant" ? shopByOwner.get(user.id) : undefined;
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as "customer" | "merchant",
        shopName: shop?.name ?? null,
        shopStatus: shop?.status ?? null,
      };
    })
    .filter((user) =>
      !normalizedSearch ||
      user.name.toLocaleLowerCase().includes(normalizedSearch) ||
      user.email.toLocaleLowerCase().includes(normalizedSearch) ||
      (user.shopName?.toLocaleLowerCase().includes(normalizedSearch) ?? false)
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    users: matchedUsers.slice(offset, offset + 100),
    totalCount: matchedUsers.length,
  };
}

export async function listAdminProfileChangeRequests(
  status?: ProfileChangeStatus,
): Promise<ProfileChangeRequest[]> {
  let query: FirebaseFirestore.Query = getDb().collection(COLLECTIONS.profileChangeRequests);
  if (status) query = query.where("status", "==", status);
  const snapshot = await query.limit(200).get();
  return rowsFromSnapshot<ProfileChangeRequest>(snapshot)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function reviewProfileChangeRequest(input: {
  requestId: string;
  status: Exclude<ProfileChangeStatus, "pending">;
  reviewerId: string;
  rejectionReason?: string;
}): Promise<ProfileChangeRequest | null> {
  const db = getDb();
  const requestRef = db.collection(COLLECTIONS.profileChangeRequests).doc(input.requestId);
  const auditRef = db.collection(COLLECTIONS.audits).doc();

  return db.runTransaction(async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);
    const request = fromSnapshot<ProfileChangeRequest>(requestSnapshot);
    if (!request) return null;
    if (request.status !== "pending") throw new ProfileChangeRequestConflictError();

    const profileRef = db.collection(COLLECTIONS.users).doc(request.userId);
    const reviewerRef = db.collection(COLLECTIONS.users).doc(input.reviewerId);
    const lockRef = db.collection(COLLECTIONS.profileChangeRequestLocks)
      .doc(profileChangeLockId(request.userId, request.field));
    const [profileSnapshot, reviewerSnapshot, lockSnapshot] = await transaction.getAll(
      profileRef,
      reviewerRef,
      lockRef,
    );
    const profile = fromSnapshot<AppUser>(profileSnapshot);
    const reviewer = fromSnapshot<AppUser>(reviewerSnapshot);
    if (!reviewer || reviewer.role !== "admin") {
      throw repositoryError("Administrator access is required.", 403);
    }
    if (!profile) return null;
    if (profile[request.field] !== request.currentValue) {
      throw new ProfileChangeRequestConflictError(
        "The profile changed after this request was submitted. Refresh before reviewing it.",
      );
    }

    const reviewedAt = new Date();
    const rejectionReason = input.status === "rejected"
      ? input.rejectionReason?.trim() || null
      : null;
    const updated: ProfileChangeRequest = {
      ...request,
      status: input.status,
      reviewedAt,
      reviewedBy: reviewer.id,
      reviewerName: reviewer.name,
      rejectionReason,
    };

    if (input.status === "approved") {
      if (request.field === "name") {
        transaction.update(profileRef, { name: request.requestedValue });
      } else {
        transaction.update(profileRef, { phone: request.requestedValue });
      }
    }
    transaction.update(requestRef, {
      status: updated.status,
      reviewedAt,
      reviewedBy: reviewer.id,
      reviewerName: reviewer.name,
      rejectionReason,
    });
    if (lockSnapshot.exists && lockSnapshot.get("requestId") === request.id) {
      transaction.delete(lockRef);
    }
    transaction.create(auditRef, {
      actorId: reviewer.id,
      action: `profile_change.${input.status}`,
      entityType: "profile_change_request",
      entityId: request.id,
      details: { field: request.field, status: input.status },
      createdAt: reviewedAt,
    });
    return updated;
  });
}

export async function reviewShop(
  shopId: string,
  status: "approved" | "rejected",
  actorId: string,
): Promise<Shop | null> {
  const db = getDb();
  const shopRef = db.collection(COLLECTIONS.shops).doc(shopId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(shopRef);
    const shop = fromSnapshot<Shop>(snapshot);
    if (!shop || shop.isDemo) return null;
    const updated = { ...shop, status };
    const auditRef = db.collection(COLLECTIONS.audits).doc();
    transaction.update(shopRef, { status });
    transaction.create(auditRef, {
      actorId,
      action: `shop.${status}`,
      entityType: "shop",
      entityId: shop.id,
      details: { status },
      createdAt: new Date(),
    });
    return updated;
  });
}
