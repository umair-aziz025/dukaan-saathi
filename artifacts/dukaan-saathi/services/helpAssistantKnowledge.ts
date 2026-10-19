export type HelpRole = 'guest' | 'customer' | 'merchant' | 'admin';

export type HelpMessage = {
  id: string;
  sender: 'assistant' | 'user';
  text: string;
};

/**
 * Help Saathi is intentionally an on-device, deterministic help guide.
 * It does not access accounts, orders, Firebase, or any external AI provider.
 * Match specific intents before generic questions such as "how do I...".
 */
export function getHelpGreeting(role: HelpRole = 'guest'): HelpMessage {
  const introduction: Record<HelpRole, string> = {
    guest: 'Hi! I can guide you through signing up, logging in, and how Dukaan Saathi works. Ask me a question!',
    customer: 'Hi! Need help finding products, placing a pickup order, or checking your pickup code? Ask me!',
    merchant: 'Hi! I can explain shop registration, inventory changes, and managing pickup orders.',
    admin: 'Hi! I can guide you through shop reviews, user management, orders, and profile-change requests.',
  };
  return { id: 'greeting', sender: 'assistant', text: introduction[role] };
}

export function getHelpSuggestions(role: HelpRole): string[] {
  switch (role) {
    case 'customer':
      return ['How do I place an order?', 'Where is my pickup code?', 'Can I pay online?', 'How do I reset my password?'];
    case 'merchant':
      return ['How do I register my shop?', 'How do I use inventory AI?', 'How do I complete a pickup?', 'How do I change my shop details?'];
    case 'admin':
      return ['How do I approve a shop?', 'How do I filter orders?', 'How do profile change requests work?', 'Can you access user data?'];
    default:
      return ['How do I sign up?', 'How does Dukaan Saathi work?', 'What can the assistants do?', 'How do I verify my email?'];
  }
}

function normalize(question: string): string {
  return question.normalize('NFKC').toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[!?؟،.,:;()[\]{}"“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function match(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

function restrictedAdminAnswer(role: HelpRole): string {
  return role === 'guest'
    ? 'Admin tools are only for authorized admin accounts; there is no public admin sign-up. You can register as a customer or shop owner instead.'
    : 'Admin actions are restricted to authorized accounts. Help Saathi cannot grant admin access or reveal or change private records.';
}

function signupAnswer(): string {
  return 'On the welcome screen, tap Sign up. Enter your full name, supported email address (Gmail, Yahoo, Outlook, iCloud, or Proton), Pakistani mobile number, CNIC, and a password of at least 8 characters. Choose Customer or Shop owner, then tap Create account. Open the verification email, return to the app, and tap "I verified my email". Shop owners can then submit their shop for review.';
}

function signinAnswer(): string {
  return 'On the welcome screen, tap Log in and enter your registered email and password. If your email is not verified, open the new verification link sent to your inbox, then return and tap "I verified my email". Admin accounts are authorized separately; you cannot select Admin during public sign-up.';
}

function verificationAnswer(): string {
  return 'After creating an account, check your email inbox and spam folder for the Firebase verification link. Open it, return to Dukaan Saathi, and tap "I verified my email". If it has not arrived, use "Resend verification link" on the verification screen. You must verify your email before entering the app.';
}

function passwordAnswer(): string {
  return 'Open Log in, enter your registered email, and tap "Forgot password?". Follow the reset link sent by Firebase, choose a new password, and return to Log in. Help Saathi cannot read or reset your password.';
}

function accountAnswer(role: HelpRole): string {
  if (role === 'guest') return signupAnswer();
  if (role === 'admin') return 'Admin access is restricted to authorized accounts. Help Saathi cannot change your credentials or admin role. If you forgot your password, use Forgot password? on the Log in screen.';
  return 'Tap the profile icon at the top of the app. You can request a change to your name or phone number, which requires admin approval. Your email and identity details are read-only there. For a forgotten password, use Forgot password? on the Log in screen. Help Saathi cannot change your profile directly.';
}

function overviewAnswer(role: HelpRole): string {
  switch (role) {
    case 'customer':
      return 'In Shop, share or refresh your location to see nearby approved shops. Browse or ask the shopping AI for products, add items from one shop to your basket, review the total, and confirm a pay-on-pickup order. Check Orders and Order history for updates.';
    case 'merchant':
      return 'The My shop workspace lets shop owners apply for approval, maintain products and stock, and use the inventory AI to prepare changes. After approval, use Orders to accept, ready and complete customer pickups.';
    case 'admin':
      return 'The Admin dashboard includes Overview, User management, Profile changes and Recent activity. Review shop applications, search users, filter orders, and use the appropriate controls for approvals. Help Saathi does not load private admin data.';
    default:
      return 'Dukaan Saathi connects local customers with approved shops. Customers browse nearby stock or use a shopping AI and place pay-on-pickup orders. Shop owners register a shop, await approval, then manage products and orders. Tap Sign up to choose Customer or Shop owner.';
  }
}

function nextStepAnswer(role: HelpRole): string {
  switch (role) {
    case 'customer':
      return 'Tap Shop, use your location to find nearby approved shops, browse products, and add items from a single shop to your basket. Review everything before confirming your pickup order.';
    case 'merchant':
      return 'Open My shop. If your shop is not approved yet, submit its name, public address, contact and current location. Once approved, add inventory or use Prepare change in the inventory assistant, then handle orders under Orders.';
    case 'admin':
      return 'Open Admin → Overview, review pending shop applications and their location details, then check Order filters, User management, Profile changes or Recent activity as needed.';
    default:
      return 'Tap Sign up, choose Customer if you want to shop or Shop owner if you want to list a dukaan, complete your details, and verify your email to continue.';
  }
}

function assistantAnswer(role: HelpRole): string {
  switch (role) {
    case 'customer':
      return 'The shopping AI accepts English, Urdu and Roman Urdu shopping requests by text or voice. It suggests matching products from approved nearby listings. You choose what to add, and only you confirm an order. This Help Saathi guide is separate; it cannot access your basket or place orders.';
    case 'merchant':
      return 'The inventory AI accepts typed or spoken English, Urdu or Roman Urdu instructions to add, update or remove products. Tap Prepare change, review the proposal, then Confirm or Cancel. Nothing is saved from an AI suggestion without confirmation. Help Saathi itself cannot change stock.';
    case 'admin':
      return 'Help Saathi is an on-device guide to admin sections, not an AI with live data access. It cannot see user records, approve shops, change orders, or review private applications for you. Use the actual Admin controls to do those tasks.';
    default:
      return 'There are two AI assistants after sign-in: customers can ask the shopping AI for nearby product suggestions; approved merchants can prepare inventory changes with the inventory AI. Both support English, Urdu and Roman Urdu voice/text requests. This Help Saathi popup is an offline guide—not the shopping AI—and cannot access accounts or make changes.';
  }
}

function voiceAnswer(role: HelpRole): string {
  if (role === 'customer') return 'In Shop → Ask your Saathi, tap Voice note, speak your shopping list, then tap Stop & transcribe. Review and edit the transcript before tapping Send. Microphone permission and a working internet connection are needed for AI transcription.';
  if (role === 'merchant') return 'In My shop → Ask the inventory assistant, tap Voice note, speak the product, pack size, price and stock instructions, and tap Stop & transcribe. Correct the transcript before Prepare change, then confirm the preview to save. The shop must be approved.';
  if (role === 'admin') return 'The Admin help guide accepts typed questions; it has no voice or live AI access. Customers and approved merchants have voice notes in their shopping and inventory assistants.';
  return 'After sign-in, customers can use Voice note in Shop and approved merchants can use Voice note in the inventory assistant. Tap the microphone, speak, stop and transcribe, then review the text before sending.';
}

function shopAnswer(role: HelpRole): string {
  switch (role) {
    case 'merchant':
      return 'Open My shop and enter your shop name, public address, contact number and map location. Submit the application for admin review. Inventory and selling features become available only after approval. You can see the shop status in your workspace.';
    case 'admin':
      return 'In Admin → Overview → Shop applications, review the submitted shop name, owner, address, contact and map location. Use Approve or Reject. Help Saathi cannot approve a shop.';
    case 'customer':
      return 'Open Shop and allow or refresh your location. The app shows available products from approved shops nearby (within its search radius). You can browse, search by product or pack size, and use Directions for a pickup order.';
    default:
      return 'Customers browse approved neighborhood shops. To list your own shop, choose Shop owner during Sign up, verify your email, then register your shop and location in My shop. An admin must approve it before your products appear to customers.';
  }
}

function shopSettingsAnswer(role: HelpRole): string {
  if (role === 'merchant') return 'Tap the profile icon at the top of the app, then find Shop details. Edit your shop name or public address, or tap Share location again to update the map pin. Tap Save shop details to apply the changes. This does not automatically change your shop approval status.';
  if (role === 'admin') return 'Shop owners update their own shop name, public address and location through Profile → Shop details. Admin shop approval is handled separately in Admin → Overview.';
  return 'Only the registered shop owner can update their own shop details from Profile after signing in. Help Saathi cannot change a shop listing.';
}

function inventoryAnswer(role: HelpRole): string {
  switch (role) {
    case 'merchant':
      return 'After your shop is approved, open My shop. Add a product manually with name, category, pack size/unit, price in PKR, and available stock. To use AI, describe a change, tap Prepare change, check the proposed fields and choose Confirm or Cancel. You can edit or remove existing products too.';
    case 'customer':
      return 'Shops manage their own products and stock. As a customer, use Shop to browse/search nearby listings and check pack size, price and remaining stock. You cannot edit a merchant’s inventory.';
    case 'admin':
      return 'Shop inventory is managed by approved shop owners. The Admin area supports shop reviews and marketplace oversight, but Help Saathi cannot edit inventory or access live product records.';
    default:
      return 'Approved merchants can add and update products, PKR prices and stock in My shop, manually or using the AI preview-and-confirm assistant. Customers can browse listed products in Shop.';
  }
}

function orderPlacementAnswer(role: HelpRole): string {
  if (role === 'customer') return 'Open Shop and share your location, browse or ask the shopping assistant for items, then tap Add on the products you want. Your basket can contain items from one shop at a time. Tap Review basket, check quantities and total price, and choose Confirm pickup order. Payment is made at the shop; track the order under Orders.';
  if (role === 'merchant') return 'Customers place pickup orders from one approved shop. As a merchant, open Orders to accept incoming orders, mark items ready, and complete pickup with the customer’s six-digit code.';
  if (role === 'admin') return 'Customers create pickup orders from Shop. Admins can inspect order activity in Admin → Overview and Orders. This help guide cannot place an order.';
  return 'Sign up or log in as a Customer, open Shop, add items from one nearby approved shop to a basket, review the total, and confirm a pay-on-pickup order. You pay at the shop.';
}

function orderAnswer(role: HelpRole): string {
  switch (role) {
    case 'customer':
      return 'Tap Orders to see active pickups and their current status, or Order history for completed/cancelled orders. A typical order moves from Pending to Accepted to Ready for pickup to Completed. This guide cannot check your specific order status.';
    case 'merchant':
      return 'Open Orders to see incoming pickup orders. Tap Accept order, then Mark ready. At collection, enter the customer’s six-digit pickup code and tap Complete. Completed and cancelled orders appear in Order history.';
    case 'admin':
      return 'Open Admin → Overview and use Order filters to narrow orders by date, shop, product, status or amount. An Admin also has an Orders tab for order records. Help Saathi cannot retrieve individual orders.';
    default:
      return 'Signed-in customers place pickup orders and follow their status in Orders; shop owners manage incoming orders once approved. This helper cannot check an individual order.';
  }
}

function paymentAnswer(): string {
  return 'The current checkout supports pay on pickup only (cash at the shop). Card payments, Visa, JazzCash, Easypaisa and bank payments are not connected yet. Do not enter card or wallet details into the help chat.';
}

function pickupAnswer(role: HelpRole): string {
  if (role === 'merchant') return 'For a pickup order, open Orders, accept it and mark it Ready when prepared. The customer shows a six-digit pickup code. Enter it in the order’s Pickup code field and tap Complete to verify collection.';
  if (role === 'customer') return 'After you confirm a pickup order, open Orders and tap Show code to reveal its six-digit pickup code. When the shop marks the order ready, go to the shop, pay there and show the code to the merchant. Do not share it before collection.';
  if (role === 'admin') return 'The six-digit pickup code is part of the customer–merchant collection workflow. Admin can oversee orders, but Help Saathi cannot reveal anyone’s code.';
  return 'Dukaan Saathi uses shop pickup rather than delivery. Customers confirm an order, follow its status, and show a six-digit pickup code at collection. Payment is made at the shop.';
}

function cancelAnswer(role: HelpRole): string {
  if (role === 'customer') return 'In Orders, the Cancel button is available for a Pending order. After the shop accepts it, customer cancellation is not offered in the current app. Help Saathi cannot cancel orders for you.';
  if (role === 'merchant') return 'In Orders, use Cancel on an incoming Pending or Accepted order, where the button is available. The backend handles the order cancellation and stock restoration; this help chat cannot cancel it.';
  if (role === 'admin') return 'Use the authorized admin/order controls to inspect order records. Help Saathi cannot cancel an order or make status changes.';
  return 'Signed-in customers can cancel a Pending order from Orders. Merchants have cancellation controls for eligible pending/accepted orders. Order actions require signing in.';
}

function notificationAnswer(role: HelpRole): string {
  if (role === 'customer' || role === 'merchant') return 'Tap the bell icon in the app header to open Notifications. The screen shows relevant in-app order updates. You can choose Enable phone alerts, allow Android notification permission, and register for push if the installed APK and Expo/FCM setup support it. If alerts fail, check app permission, network and the push-enabled build.';
  if (role === 'admin') return 'Notifications for customers and merchants are separate from the Admin dashboard. For admin activity, use Admin → Recent activity; this help chat cannot access real notifications.';
  return 'Signed-in customers and merchants can check the bell icon for order updates and optionally enable phone alerts. Phone push requires a supported installed build, notification permission and working Expo/FCM credentials.';
}

function locationAnswer(role: HelpRole): string {
  if (role === 'customer') return 'In Shop, tap Use my current location or Refresh my location, allow location permission, then browse approved nearby listings. For a placed order, use Directions to open map navigation to the shop.';
  if (role === 'merchant') return 'When registering a shop, share your actual shop location so its map pin is correct. Later, open Profile → Shop details, tap Share location again, and Save shop details to update the pin. Maps/directions open externally.';
  if (role === 'admin') return 'In Admin → Overview → Shop applications, review the address and coordinates and use the map icon to inspect a location before approving or rejecting.';
  return 'Location lets customers find nearby shops and lets merchants submit their shop’s map pin. Android location permission is needed for automatic location capture.';
}

function profileAnswer(role: HelpRole): string {
  if (role === 'guest') return 'Create or sign in to an account first. Then customers and merchants can open the profile icon to view details and submit requests to change their name or phone number.';
  if (role === 'admin') return 'Open Admin → Profile changes to review pending customer/merchant requests. Accept or reject changes using the administrator controls. Help Saathi cannot access requests or approve them.';
  return 'Tap the profile icon at the top of the app. Under Request a profile change, select Full name or Phone number, enter the new value and submit. An admin must approve it. Email and identity details are read-only; merchants can also edit shop name, address and map pin in Shop details.';
}

function adminAnswer(role: HelpRole, topic: 'shops' | 'users' | 'orders' | 'profile' | 'activity' | 'overview'): string {
  if (role !== 'admin') return restrictedAdminAnswer(role);
  switch (topic) {
    case 'shops':
      return 'Open Admin → Overview → Shop applications. Check each pending shop’s information and location, then use Approve or Reject. Only those actions change approval status.';
    case 'users':
      return 'Open Admin → User management to search and browse customer or merchant accounts. Help Saathi cannot see private accounts or change them.';
    case 'orders':
      return 'Open Admin → Overview → Order filters. Filter by date range, shop, product, status, and minimum/maximum amount, then apply. Use the Orders tab to inspect order records.';
    case 'profile':
      return 'Open Admin → Profile changes. Review the requested full-name or phone-number change and approve or reject it using the controls. The request remains pending until an admin acts.';
    case 'activity':
      return 'Open Admin → Recent activity to view the recorded administrative/audit events available in your overview. Help Saathi cannot access live activity logs.';
    default:
      return 'Admin provides Overview, User management, Profile changes and Recent activity. The Overview includes pending shop applications, marketplace metrics, and order filters. This helper only explains features; it cannot view or edit records.';
  }
}

function unknownAnswer(role: HelpRole): string {
  const options: Record<HelpRole, string> = {
    guest: 'I can explain registration, login, email verification, passwords, account roles and app features. For example, ask "How do I sign up?"',
    customer: 'I can explain nearby shopping, basket checkout, orders, pickup codes, payments, notifications, and profile updates. For example, ask "Where is my pickup code?"',
    merchant: 'I can explain shop approval, inventory AI, products, orders, pickup verification and shop settings. For example, ask "How do I use inventory AI?"',
    admin: 'I can explain shop approvals, user management, order filters, profile requests and activity. For example, ask "How do I approve a shop?"',
  };
  return 'I am an offline app guide, so I might not understand that question. ' + options[role] + ' I cannot access live account data or perform actions.';
}

export function answerHelpQuestion(role: HelpRole, question: string): string {
  const text = normalize(question);
  if (!text) return unknownAnswer(role);
  if (/^(hi|hello|hey|salam|assalam|assalamualaikum|اسلام علیکم|السلام علیکم|سلام)$/.test(text)) {
    return getHelpGreeting(role).text;
  }

  // Account-related questions take priority over generic "how do I" and "work" wording.
  if (match(text, /\b(?:forgot|reset|recover|lost|change)\b.*\bpassword\b|\bpassword\b.*\b(?:forgot|reset|recover|lost|change)\b|forgot password|password bhool/i)) {
    return passwordAnswer();
  }
  if (match(text, /\b(?:verify|verification|confirm)\b.*\bemail\b|\bemail\b.*\b(?:verify|verification)\b|verification link|verify my account|email verify|تصدیق/i)) {
    return verificationAnswer();
  }
  // Registering a store is separate from creating a user account.
  if (match(text, /\b(?:register|list|apply for|create|set up)\b.*\b(?:my |a |the )?(?:shop|store|dukaan)\b|shop registration/i)) {
    return shopAnswer(role);
  }
  if (match(text, /\b(?:sign\s?up|signup|register|registration|create\s+(?:a\s+|an\s+|my\s+|new\s+)?account|join the app)\b|account ban|naya account|رجسٹر|سائن اپ|اکاؤنٹ بن/i)) {
    return signupAnswer();
  }
  if (match(text, /\b(?:log\s?in|login|sign\s?in|signin)\b|kaise login/i)) {
    return signinAnswer();
  }
  if (match(text, /\b(?:delete|remove|close)\b.*\b(?:my\s+)?account\b/i)) {
    return 'The current app does not offer account deletion in Help Saathi. This guide cannot delete accounts. Please contact the app operator through an established support channel for a deletion request; do not post personal details here.';
  }

  // Answer requests for personal status conservatively: this local guide has no account access.
  if (match(text, /\b(?:where is my order|track my order|my order status|when will my order|where is my shop application|why (?:is|was|has|hasn t) my shop|my shop approved|check my balance)\b/i)) {
    if (role === 'merchant') return 'I cannot check your live shop application or order status. Check My shop for your approval state, or Orders for incoming pickups.';
    if (role === 'admin') return 'I cannot access live marketplace records. Open Admin → Overview or Orders to check the available status and details.';
    return 'I cannot see your order or application status. Customers can check Orders; shop owners can check My shop for approval status. This is an on-device help guide, not a live account assistant.';
  }

  // Concrete operations, ordered from specific to general to avoid collisions.
  if (match(text, /\b(?:admin|administrator)\b/i) && role !== 'admin') return restrictedAdminAnswer(role);

  if (match(text, /\b(?:change|edit|update)\b.*\b(?:shop|store|dukaan)\b.*\b(?:details|name|address|location|pin)\b|\b(?:shop|store) (?:details|name|address|location)\b/i)) {
    return shopSettingsAnswer(role);
  }
  if (match(text, /\b(?:profile changes?|change (?:my |the )?(?:name|phone|mobile|details|email)|edit (?:my )?profile|update (?:my )?(?:name|phone|profile)|personal details)\b/i)) {
    return profileAnswer(role);
  }
  if (role === 'admin' && match(text, /\b(?:approve|reject|review)\b.*\b(?:shop|application)\b|\bshop (?:approval|applications|review)\b/i)) {
    return adminAnswer(role, 'shops');
  }
  if (role === 'admin' && match(text, /\b(?:profile request|profile change|change request|approve (?:a )?(?:name|phone))\b/i)) {
    return adminAnswer(role, 'profile');
  }
  if (role === 'admin' && match(text, /\b(?:user management|search users?|find users?|accounts list|manage users?)\b/i)) {
    return adminAnswer(role, 'users');
  }
  if (role === 'admin' && match(text, /\b(?:order filters?|filter (?:the )?orders?|check orders?|order report|order statistics)\b/i)) {
    return adminAnswer(role, 'orders');
  }
  if (role === 'admin' && match(text, /\b(?:recent activity|audit log|activity log|activity)\b/i)) {
    return adminAnswer(role, 'activity');
  }

  if (match(text, /\b(?:pickup code|pick up code|six digit code|6 digit code|collection code|verify (?:a |the )?pickup|complete (?:a |the )?pickup)\b/i)) {
    return pickupAnswer(role);
  }
  if (match(text, /\b(?:cancel (?:my |an? |the )?order|order cancellation|refund)\b/i)) {
    return cancelAnswer(role);
  }
  if (match(text, /\b(?:pay(?:ment|ments)?|cash|online payment|jazzcash|easypaisa|visa|mastercard|card|wallet|bank transfer)\b/i)) {
    return paymentAnswer();
  }
  if (match(text, /\b(?:notifications?|alerts?|push|bell icon|phone alerts?|reminders?)\b/i)) {
    return notificationAnswer(role);
  }
  if (match(text, /\b(?:directions?|navigate|navigation|maps?|location|gps|distance|near me|nearby location)\b/i)) {
    return locationAnswer(role);
  }
  if (match(text, /\b(?:voice|microphone|mic|speak|speech|transcri(?:be|ption)|audio|voice note)\b/i)) {
    return voiceAnswer(role);
  }
  if (match(text, /\b(?:what (?:can|does) (?:the |your )?assistants? do|what can (?:the |your )?ai do|what can (?:this |the )?chatbot do|assistants?|chatbot|shopping ai|inventory ai|saathi ai|help saathi)\b/i)) {
    return assistantAnswer(role);
  }
  if (match(text, /\b(?:inventory|stock|change (?:a |my |the )?price|product (?:management|listings?)|add (?:a |new )?product|edit (?:a )?product|remove (?:a )?product|manage products?|update stock|prepare change)\b/i)) {
    return inventoryAnswer(role);
  }
  if (match(text, /\b(?:place|make|create|submit|buy)\b.*\b(?:order|groceries|grocery|items)\b|\b(?:how do i order|order groceries|checkout|review basket|shopping basket|cart)\b/i)) {
    return orderPlacementAnswer(role);
  }
  if (match(text, /\b(?:order status|orders?|order history|check orders?|incoming orders?)\b/i)) {
    return orderAnswer(role);
  }
  if (match(text, /\b(?:pickup|pick up|collect|collection|basket|cart|checkout)\b/i)) {
    return pickupAnswer(role);
  }
  if (match(text, /\b(?:what next|next step|what should i do|what do i do|where do i start|getting started|how to start|agla kya)\b/i)) {
    return nextStepAnswer(role);
  }
  // General app overviews must come before keyword matches for "dukaan"/"shop".
  if (match(text, /\b(?:about this app|what is dukaan saathi|how does dukaan saathi work|what does dukaan saathi do|how (?:does|do) (?:the |this )?app work|what (?:does|can) (?:the |this )?app do|how to use (?:the |this )?app|how does it work)\b/i)) {
    return overviewAnswer(role);
  }
  if (match(text, /\b(?:shop|shops|dukaan|merchant|seller|owner|store|apply|approval|approved|search|browse|catalog|catalogue|find products?|list my shop|shop registration)\b/i)) {
    return shopAnswer(role);
  }
  if (match(text, /\b(?:account|my profile|account details)\b/i)) return accountAnswer(role);
  if (role === 'admin' && match(text, /\b(?:overview|dashboard|review)\b/i)) return adminAnswer(role, 'overview');

  return unknownAnswer(role);
}
