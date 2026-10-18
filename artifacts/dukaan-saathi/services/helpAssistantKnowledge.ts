export type HelpRole = 'guest' | 'customer' | 'merchant' | 'admin';

export type HelpMessage = {
  id: string;
  sender: 'assistant' | 'user';
  text: string;
};

const assistantGreeting = 'Hi! I can explain Dukaan Saathi and suggest a next step.';

export function getHelpGreeting(): HelpMessage {
  return { id: 'greeting', sender: 'assistant', text: assistantGreeting };
}

export function getHelpSuggestions(role: HelpRole): string[] {
  switch (role) {
    case 'customer':
      return ['How does pickup work?', 'What can the assistant do?', 'What should I do next?'];
    case 'merchant':
      return ['How do I list my shop?', 'How does inventory work?', 'What should I do next?'];
    case 'admin':
      return ['What can I review?', 'How do I check orders?', 'What should I do next?'];
    default:
      return ['How does Dukaan Saathi work?', 'What can the assistants do?', 'How do I sign up?'];
  }
}

function containsAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function roleName(role: HelpRole) {
  if (role === 'customer') return 'customer';
  if (role === 'merchant') return 'shop owner';
  if (role === 'admin') return 'authorized admin';
  return 'guest';
}

function nextStepAnswer(role: HelpRole) {
  switch (role) {
    case 'customer':
      return 'Open Shop, browse approved nearby listings, and add items from one shop to your basket. Review the basket and confirm cash at pickup. Check Orders for status and the pickup code.';
    case 'merchant':
      return 'Open Shop Workspace. If your shop is not listed yet, submit its details and location for review. After approval, add products and keep prices and stock current; use Orders to handle incoming orders.';
    case 'admin':
      return 'Open Admin Overview. Review pending shop applications, then use the admin sections to check users, orders, and profile change requests. Make changes only through the matching admin controls; this chat cannot perform them.';
    default:
      return 'Choose Sign up and create a customer or shop-owner account. Customers can browse approved local shops; shop owners submit a shop for review before listing products. Admin access is limited to authorized accounts.';
  }
}

function assistantAnswer(role: HelpRole) {
  switch (role) {
    case 'customer':
      return 'The shopping assistant can take a typed or spoken shopping request and suggest products from nearby listings. You review the suggestions and choose what to add; it does not place an order for you. Help Saathi only explains the app.';
    case 'merchant':
      return 'The inventory assistant can draft product or stock changes from an instruction in English, Urdu, or Roman Urdu. It shows a preview, and your confirmation is required to save. Help Saathi is separate and cannot edit inventory.';
    case 'admin':
      return 'Help Saathi can explain the admin sections, but it cannot view private records, approve shops, change users, or perform any other admin action.';
    default:
      return 'Help Saathi explains the app but cannot access account data. After sign-in, customers can use the shopping assistant for product suggestions; shop owners can use the inventory assistant to prepare changes for review.';
  }
}

function overviewAnswer(role: HelpRole) {
  switch (role) {
    case 'customer':
      return 'Browse approved nearby shops and their listed stock, add items from one shop to your basket, then confirm a cash-at-pickup order. Use Orders to follow the status and pickup code.';
    case 'merchant':
      return 'Shop owners apply to list a dukaan. After admin approval, they manage product details, prices, stock, and incoming orders from Shop Workspace.';
    case 'admin':
      return 'The admin area provides shop-application review, overview information, and sections for users, orders, and profile change requests. Help Saathi only explains these tools; it cannot access records or perform actions.';
    default:
      return 'Customers browse approved nearby shops, compare listed products, and place cash-at-pickup orders. Shop owners apply to list their shop and manage products and orders after approval.';
  }
}

function pickupAnswer(role: HelpRole) {
  switch (role) {
    case 'customer':
      return 'Add products from a single shop to your basket, review the items, then confirm the order. Payment is cash at pickup. Use Orders to check its status and pickup code.';
    case 'merchant':
      return 'Open Orders to review incoming orders and update their status using the available order controls. Customers receive the pickup code in their order details.';
    case 'admin':
      return 'Use the admin orders section to monitor order status. Help Saathi cannot change orders or reveal any customer or merchant details.';
    default:
      return 'Customers choose products from one shop, review the basket, and confirm cash at pickup. They can follow status and pickup details after signing in.';
  }
}

function shopAnswer(role: HelpRole) {
  switch (role) {
    case 'customer':
      return 'Open Shop to browse approved nearby dukaan owners and the products they have listed. Search by product or size, then add an item to your basket.';
    case 'merchant':
      return 'Open Shop Workspace and submit your shop details and location for review. Once approved, add products and maintain their prices and stock. The inventory assistant can prepare a change preview for you to confirm.';
    case 'admin':
      return 'Review pending shop applications from the admin area. Only authorized admin accounts can approve or reject a shop; this chat cannot take that action.';
    default:
      return 'Customers can browse approved shops. Shop owners can apply during sign-up or submit their shop details after creating an account; products are listed after approval.';
  }
}

function ordersAnswer(role: HelpRole) {
  switch (role) {
    case 'customer':
      return 'Open Orders to see current order status and pickup details. The pickup code appears with the order when it is available.';
    case 'merchant':
      return 'Open Orders to view incoming orders and use the available status controls. Keep the order status current so the customer can follow pickup progress.';
    case 'admin':
      return 'Use the admin orders section to filter and monitor orders. To act on a record, use the authorized admin controls—not this chat.';
    default:
      return 'After signing in, customers can follow orders and pickup details; shop owners can manage incoming orders after their shop is approved.';
  }
}

export function answerHelpQuestion(role: HelpRole, question: string): string {
  const text = question
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[!?.,:;()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) {
    return `Ask about ${role === 'customer' ? 'shops, baskets, or pickup' : role === 'merchant' ? 'shop approval, stock, or orders' : role === 'admin' ? 'shop review, users, or orders' : 'how the app works or how to sign up'}.`;
  }

  if (/^(hi|hello|hey|salam|assalam)(\s|$)/.test(text)) {
    return `Hello! I can help with ${role === 'customer' ? 'nearby shops, baskets, and pickup orders' : role === 'merchant' ? 'shop approval, inventory, and orders' : role === 'admin' ? 'shop review, users, and orders' : 'the app and account types'}. What would you like to know?`;
  }

  if (containsAny(text, ['assistant', 'saathi', ' ai ', 'voice', 'spoken', 'inventory helper'])) {
    return assistantAnswer(role);
  }

  if (containsAny(text, ['what next', 'next step', 'what should i do', 'what do i do', 'where do i start', 'first thing', 'agla kya'])) {
    return nextStepAnswer(role);
  }

  if (containsAny(text, ['admin', 'administrator', 'approve shop', 'review shop', 'profile change request'])) {
    if (role === 'admin') return overviewAnswer(role);
    if (role === 'guest') {
      return 'Admin tools are only available to authorized admin accounts. This chat cannot grant access or carry out admin actions. You can sign up as a customer or shop owner.';
    }
    return `Admin tools are restricted to authorized admin accounts. As a ${roleName(role)}, use your own app sections; this chat cannot view admin records or perform admin actions.`;
  }

  if (role === 'admin' && containsAny(text, ['review', 'overview', 'users', 'profile change', 'activity'])) {
    return overviewAnswer(role);
  }

  if (containsAny(text, ['pickup', 'pick up', 'cash', 'basket', 'cart', 'payment', 'pay ', 'order'])) {
    return containsAny(text, ['order']) && !containsAny(text, ['pickup', 'pick up', 'cash', 'basket', 'cart', 'payment', 'pay '])
      ? ordersAnswer(role)
      : pickupAnswer(role);
  }

  if (containsAny(text, ['stock', 'inventory', 'product', 'price', 'quantity'])) {
    if (role === 'customer') return 'You can browse the products and stock listed by approved nearby shops. Add items from one shop to your basket and confirm only after reviewing the details.';
    if (role === 'admin') return 'Help Saathi cannot change product or stock records. Use the authorized admin or shop controls for actions available to your account.';
    if (role === 'merchant') return shopAnswer(role);
    return 'Shop owners manage product details, prices, and stock after their shop is approved. Customers can browse the products that shops have listed.';
  }

  if (containsAny(text, ['shop', 'dukaan', 'merchant', 'seller', 'owner', 'apply', 'approval', 'approved', 'list my', 'search', 'browse', 'nearby', 'location'])) {
    return shopAnswer(role);
  }

  if (containsAny(text, ['how does', 'how do', 'what is', 'what does', 'work', 'use this app', 'dukaan saathi'])) {
    return overviewAnswer(role);
  }

  if (containsAny(text, ['sign up', 'signup', 'register', 'account', 'login', 'log in', 'sign in'])) {
    return role === 'guest'
      ? 'Use Sign up to create a customer or shop-owner account. Shop owners submit their shop for review before products can be listed. Admin access is granted only to authorized accounts.'
      : `You are using Dukaan Saathi as a ${roleName(role)}. For sign-in or account changes, use the app’s account screens; Help Saathi cannot access or change account details.`;
  }

  return `I can help with ${role === 'customer' ? 'nearby shops, baskets, and pickup orders' : role === 'merchant' ? 'shop approval, inventory, and orders' : role === 'admin' ? 'shop review, users, and orders' : 'how the app works and account types'}. Try asking “What should I do next?” This helper cannot access account data or make changes.`;
}
