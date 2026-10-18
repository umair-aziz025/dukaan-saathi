export type AppUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  cnicDigest: string;
  cnicLast4: string;
  role: string;
  createdAt: Date;
  isDemo?: boolean;
};

export type ProfileChangeField = "name" | "phone";

export type ProfileChangeStatus = "pending" | "approved" | "rejected";

export type ProfileChangeRequest = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: "customer" | "merchant";
  field: ProfileChangeField;
  currentValue: string;
  requestedValue: string;
  status: ProfileChangeStatus;
  createdAt: Date;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  reviewerName: string | null;
  rejectionReason: string | null;
};

export type Shop = {
  id: string;
  ownerId: string | null;
  name: string;
  address: string;
  contact: string;
  latitude: number;
  longitude: number;
  status: string;
  isDemo: boolean;
  createdAt: Date;
};

export type Product = {
  id: string;
  shopId: string;
  name: string;
  category: string;
  unit: string;
  price: number;
  stock: number;
  active: boolean;
  updatedAt: Date;
  isDemo?: boolean;
};

export type OrderLine = {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  price: number;
  lineTotal: number;
};

export type Order = {
  id: string;
  customerId: string;
  shopId: string;
  items: OrderLine[];
  total: number;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  idempotencyKey: string;
  pickupCodeDigest: string;
  pickupCodeCiphertext?: string;
  createdAt: Date;
  updatedAt: Date;
  isDemo?: boolean;
};

export type OrderStatusNotification = {
  id: string;
  customerId?: string;
  merchantId?: string;
  orderId: string;
  shopId: string;
  shopName: string;
  status: "pending" | "accepted" | "ready" | "completed";
  previousStatus: string | null;
  isRead: boolean;
  createdAt: Date;
};

export type AuditLog = {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, string | number | boolean>;
  createdAt: Date;
};
