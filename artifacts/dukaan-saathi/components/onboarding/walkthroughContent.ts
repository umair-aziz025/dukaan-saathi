import type { WalkthroughStep } from './WalkthroughScreen';

export const sharedIntroSteps: WalkthroughStep[] = [
  {
    icon: 'map-pin',
    eyebrow: 'LOCAL SHOPS',
    title: 'Discover your neighbourhood',
    body: 'Explore approved nearby dukaan owners and the products they have in stock.',
  },
  {
    icon: 'search',
    eyebrow: 'CLEAR CHOICES',
    title: 'Compare before you choose',
    body: 'Check product sizes, shop details, available stock, and prices in PKR.',
  },
  {
    icon: 'shopping-bag',
    eyebrow: 'MADE FOR PICKUP',
    title: 'Shop local, your way',
    body: 'Customers place pickup orders. Shop owners can apply to list a shop and manage inventory after approval.',
  },
];

export const roleWalkthroughSteps: Record<'customer' | 'merchant' | 'admin', WalkthroughStep[]> = {
  customer: [
    {
      icon: 'map-pin',
      eyebrow: 'STEP 1 · FIND',
      title: 'Browse nearby stock',
      body: 'Set your area to see approved shops and their available products, prices, and sizes.',
    },
    {
      icon: 'shopping-bag',
      eyebrow: 'STEP 2 · REVIEW',
      title: 'Build a basket from one shop',
      body: 'Add available items and review quantities and the estimated total before you confirm.',
    },
    {
      icon: 'check-circle',
      eyebrow: 'STEP 3 · PICK UP',
      title: 'Follow your order',
      body: 'Pay cash at pickup, track shop updates, and show the pickup code when the order is ready.',
    },
  ],
  merchant: [
    {
      icon: 'home',
      eyebrow: 'STEP 1 · APPLY',
      title: 'Register your shop',
      body: 'Add your shop name, public address, contact number, and map location for admin review.',
    },
    {
      icon: 'package',
      eyebrow: 'STEP 2 · STOCK',
      title: 'Manage your inventory',
      body: 'After approval, add products with pack sizes, PKR prices, and stock quantities.',
    },
    {
      icon: 'clipboard',
      eyebrow: 'STEP 3 · FULFIL',
      title: 'Keep pickup orders moving',
      body: 'Review incoming orders, update their status, and confirm collection with the customer’s pickup code.',
    },
  ],
  admin: [
    {
      icon: 'shield',
      eyebrow: 'STEP 1 · REVIEW',
      title: 'Verify shop listings',
      body: 'Review new shop applications and approve or reject listings before they appear to customers.',
    },
    {
      icon: 'activity',
      eyebrow: 'STEP 2 · OVERSEE',
      title: 'Monitor marketplace activity',
      body: 'See customer and merchant totals, pending shops, and order activity in the admin workspace.',
    },
    {
      icon: 'users',
      eyebrow: 'STEP 3 · SUPPORT',
      title: 'Manage accounts and requests',
      body: 'Search customer and merchant accounts, review profile-change requests, and inspect orders.',
    },
  ],
};
