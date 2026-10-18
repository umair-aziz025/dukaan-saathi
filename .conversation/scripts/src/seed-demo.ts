import { createHmac, randomBytes, randomInt } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  createOrderWithStock,
  findOrderByIdempotency,
  getFirebaseAdminApp,
  getFirebaseAdminAuth,
  provisionDemoProfile,
  seedDemoCatalog,
  seedDemoShopForOwner,
} from "@workspace/db";

const firebaseProjectId = "dukaan-saathi-18899";
const credentialsOutputPath = fileURLToPath(
  new URL("../../generated-artifacts/demo-account-passwords.json", import.meta.url),
);
const accounts = [
  { email: "umairaziz682@gmail.com", name: "Dukaan Saathi Admin", role: "admin" },
  { email: "justufor11@gmail.com", name: "Demo Shop Owner 1", role: "merchant" },
  { email: "justufor14@gmail.com", name: "Demo Shop Owner 2", role: "merchant" },
  { email: "justufor18@gmail.com", name: "Demo Shop Owner 3", role: "merchant" },
  { email: "ddmcbaba69@gmail.com", name: "Demo Customer 1", role: "customer" },
  { email: "justufor21@gmail.com", name: "Demo Customer 2", role: "customer" },
  { email: "justufor27@gmail.com", name: "Demo Customer 3", role: "customer" },
] as const;

const shops: {
  ownerEmail: string;
  id: string;
  name: string;
  address: string;
  contact: string;
  latitude: number;
  longitude: number;
  products: {
    id: string;
    name: string;
    category: string;
    unit: string;
    price: number;
    stock: number;
    active: boolean;
  }[];
}[] = [
  {
    ownerEmail: "justufor11@gmail.com",
    id: "33333333-3333-4333-8333-333333333331",
    name: "Saathi Fresh Mart",
    address: "Demo listing · Mirpur Khas",
    contact: "Demo contact",
    latitude: 25.529,
    longitude: 69.0402,
    products: [
      { id: "44444444-4444-4444-8444-444444444411", name: "Fresh milk", category: "Dairy", unit: "1 litre", price: 240, stock: 25, active: true },
      { id: "44444444-4444-4444-8444-444444444412", name: "Farm eggs", category: "Dairy", unit: "dozen", price: 360, stock: 18, active: true },
      { id: "44444444-4444-4444-8444-444444444413", name: "Whole wheat bread", category: "Bakery", unit: "loaf", price: 180, stock: 20, active: true },
    ],
  },
  {
    ownerEmail: "justufor14@gmail.com",
    id: "33333333-3333-4333-8333-333333333332",
    name: "Neighbourhood Produce",
    address: "Demo listing · Mirpur Khas",
    contact: "Demo contact",
    latitude: 25.524,
    longitude: 69.045,
    products: [
      { id: "44444444-4444-4444-8444-444444444421", name: "Red tomatoes", category: "Produce", unit: "1 kg", price: 160, stock: 30, active: true },
      { id: "44444444-4444-4444-8444-444444444422", name: "Brown onions", category: "Produce", unit: "1 kg", price: 140, stock: 28, active: true },
      { id: "44444444-4444-4444-8444-444444444423", name: "Potatoes", category: "Produce", unit: "1 kg", price: 120, stock: 35, active: true },
    ],
  },
  {
    ownerEmail: "justufor18@gmail.com",
    id: "33333333-3333-4333-8333-333333333333",
    name: "Everyday Pantry",
    address: "Demo listing · Mirpur Khas",
    contact: "Demo contact",
    latitude: 25.532,
    longitude: 69.039,
    products: [
      { id: "44444444-4444-4444-8444-444444444431", name: "Basmati rice", category: "Grains", unit: "1 kg", price: 330, stock: 22, active: true },
      { id: "44444444-4444-4444-8444-444444444432", name: "White sugar", category: "Pantry", unit: "1 kg", price: 170, stock: 26, active: true },
      { id: "44444444-4444-4444-8444-444444444433", name: "Cooking oil", category: "Pantry", unit: "1 litre", price: 570, stock: 16, active: true },
    ],
  },
];

async function getOrCreateAccount(email: string, displayName: string) {
  const auth = getFirebaseAdminAuth();
  try {
    const existing = await auth.getUserByEmail(email);
    if (existing.disabled) {
      throw new Error(`A listed Firebase account is disabled: ${email}`);
    }
    if (existing.providerData.some((provider) => provider.providerId === "password")) {
      return { user: existing, created: false, generatedPassword: null };
    }

    const generatedPassword = randomBytes(32).toString("base64url");
    const user = await auth.updateUser(existing.uid, { password: generatedPassword });
    return { user, created: false, generatedPassword };
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
    const generatedPassword = randomBytes(32).toString("base64url");
    const user = await auth.createUser({
      email,
      displayName,
      password: generatedPassword,
      emailVerified: false,
    });
    return { user, created: true, generatedPassword };
  }
}

function pickupCodeDigest(code: string, secret: string) {
  return createHmac("sha256", secret).update(code).digest("hex");
}

async function run() {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET is required to create protected demo orders.");
  }

  const configuredProjectId = getFirebaseAdminApp().options.projectId;
  if (configuredProjectId !== firebaseProjectId) {
    throw new Error("The Firebase service account does not match the Dukaan Saathi project.");
  }

  const uidByEmail = new Map<string, string>();
  const generatedCredentials: { email: string; password: string }[] = [];
  let createdAccounts = 0;
  for (const account of accounts) {
    const result = await getOrCreateAccount(account.email, account.name);
    const uid = result.user.uid;
    uidByEmail.set(account.email, uid);
    if (result.created) createdAccounts += 1;
    if (result.generatedPassword) {
      generatedCredentials.push({ email: account.email, password: result.generatedPassword });
    }
    await provisionDemoProfile({
      id: uid,
      email: account.email,
      name: account.name,
      role: account.role,
    });
  }

  await seedDemoCatalog();
  for (const shop of shops) {
    const ownerId = uidByEmail.get(shop.ownerEmail);
    if (!ownerId) throw new Error("A demo merchant account was not provisioned.");
    await seedDemoShopForOwner({
      ...shop,
      ownerId,
    });
  }

  const customers = accounts.filter((account) => account.role === "customer");
  let createdOrders = 0;
  for (const [index, customer] of customers.entries()) {
    const customerId = uidByEmail.get(customer.email);
    const shop = shops[index];
    const product = shop?.products[0];
    if (!customerId || !shop || !product) {
      throw new Error("Demo order configuration is incomplete.");
    }
    const idempotencyKey = `demo-seed-v1:${customerId}`;
    if (await findOrderByIdempotency(customerId, idempotencyKey)) continue;
    const code = String(randomInt(100000, 1000000));
    const result = await createOrderWithStock({
      customerId,
      items: [{ productId: product.id, quantity: 1 }],
      idempotencyKey,
      pickupCodeDigest: pickupCodeDigest(code, sessionSecret),
      isDemo: true,
    });
    if (!result.duplicate) createdOrders += 1;
  }

  if (generatedCredentials.length > 0) {
    const outputDirectory = new URL("../../generated-artifacts/", import.meta.url);
    await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
    await writeFile(
      credentialsOutputPath,
      `${JSON.stringify({
        firebaseProjectId,
        generatedAt: new Date().toISOString(),
        accounts: generatedCredentials,
      }, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    await chmod(credentialsOutputPath, 0o600);
  }

  console.log(JSON.stringify({
    success: true,
    firebaseProjectId,
    accountsCreated: createdAccounts,
    accountsReused: accounts.length - createdAccounts,
    profilesProvisioned: accounts.length,
    merchantShopsSeeded: shops.length,
    demoOrdersCreated: createdOrders,
    accountPasswordsSet: generatedCredentials.length,
    credentialsExport: generatedCredentials.length > 0 ? credentialsOutputPath : null,
  }));
}

run().catch((error: unknown) => {
  console.error(
    "Demo provisioning failed:",
    error instanceof Error ? error.message : "Unknown error.",
  );
  process.exitCode = 1;
});
