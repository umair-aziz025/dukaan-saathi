import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import type * as NotificationTypes from 'expo-notifications';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import {
  useAskDukaanAssistant,
  useAskMerchantAssistant,
  useCreateDukaanOrder,
  useCreateDukaanProfile,
  useCreateDukaanShop,
  useCreateMerchantProduct,
  useDeleteMerchantProduct,
  useGetDukaanAdminOverview,
  useGetDukaanAdminOrders,
  useGetDukaanAdminUsers,
  useGetDukaanCatalog,
  useGetDukaanMerchantShop,
  useGetDukaanOrderNotifications,
  useGetDukaanOrders,
  useGetDukaanPickupCode,
  useGetDukaanProfile,
  useGetMerchantProducts,
  useMarkAllDukaanOrderNotificationsRead,
  useMarkDukaanOrderNotificationRead,
  useRegisterDukaanPushToken,
  useReviewDukaanShop,
  useUpdateDukaanMerchantShop,
  useTranscribeDukaanAudio,
  useUpdateDukaanOrderStatus,
  useUnregisterDukaanPushToken,
  useUpdateMerchantProduct,
  getGetDukaanAdminOverviewQueryKey,
  getGetDukaanAdminOrdersQueryKey,
  getGetDukaanAdminUsersQueryKey,
  getGetDukaanCatalogQueryKey,
  getGetDukaanMerchantShopQueryKey,
  getGetDukaanOrderNotificationsQueryKey,
  getGetDukaanOrdersQueryKey,
  getGetDukaanProfileQueryKey,
  getGetMerchantProductsQueryKey,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { AppButton, Eyebrow, Field, Notice, Panel, SearchableSelect, SectionHeading, Tag, ThemedDialog } from '@/components/saathi-ui';
import { AdminProfileChangeRequestsView, ProfileChangeRequestsView } from '@/components/ProfileChangeRequests';
import { HelpAssistant } from '@/components/help/HelpAssistant';
import { signOutFirebase, useFirebaseSession } from '@/services/firebaseAuth';
import { WalkthroughScreen } from '@/components/onboarding/WalkthroughScreen';
import { roleWalkthroughSteps } from '@/components/onboarding/walkthroughContent';
import { isWalkthroughComplete, markWalkthroughComplete, roleWalkthroughStorageKey } from '@/services/onboardingProgress';
import {
  clearPushTokenId,
  getExpoPushToken,
  readPushAlertsPreference,
  readPushTokenId,
  savePushAlertsPreference,
  savePushTokenId,
  supportsPhonePush,
} from '@/services/pushNotifications';

type Role = 'customer' | 'merchant' | 'admin';
type Profile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  shopStatus: string | null;
};
type RoleWalkthroughGate = { key: string; ready: boolean; open: boolean };
type Coordinates = { latitude: number; longitude: number };
type OrderStatus = 'pending' | 'accepted' | 'ready' | 'completed';
type OrderStatusNotification = {
  id: string;
  orderId: string;
  shopId: string;
  shopName: string;
  status: OrderStatus;
  previousStatus: OrderStatus | null;
  isRead: boolean;
  createdAt: string;
};
type AdminOrderStatus = 'pending' | 'accepted' | 'ready' | 'completed' | 'cancelled';
type AdminOrderFilters = {
  startDate?: string;
  endDate?: string;
  shopId?: string;
  productName?: string;
  status?: AdminOrderStatus;
  minAmount?: number;
  maxAmount?: number;
};
type AdminOrderFilterDraft = {
  startDate: string;
  endDate: string;
  shopId: string;
  productName: string;
  status: AdminOrderStatus | '';
  minAmount: string;
  maxAmount: string;
};
type AdminOrderRow = {
  id: string;
  shopId: string;
  shopName: string;
  productNames: string[];
  total: number;
  status: AdminOrderStatus;
  createdAt: string;
};
type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: 'customer' | 'merchant';
  shopName: string | null;
  shopStatus: string | null;
};
type AdminUsersPage = { users: AdminUserRow[]; totalCount: number };
type ProductItem = {
  id: string;
  shopId: string;
  name: string;
  category: string;
  unit: string;
  price: number;
  stock: number;
  active: boolean;
};
type ChatMessage = { role: 'user' | 'assistant'; text: string; products?: ProductItem[] };
const SHOPPING_CHAT_IDLE_TIMEOUT_MS = 60_000;
type CartLine = { product: ProductItem; quantity: number };

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    if (/firebase|auth\/[a-z-]+/i.test(error.message)) return fallback;
    return error.message.replace(/^HTTP \d+[^:]*:\s*/, '').slice(0, 220);
  }
  return fallback;
}

function BrandMark({ small = false }: { small?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.brandMark, small && styles.brandMarkSmall, { backgroundColor: colors.primary }]}>
      <Feather name="shopping-bag" size={small ? 16 : 20} color={colors.primaryForeground} />
    </View>
  );
}

function ProfileSetup({ email, onDone }: { email: string; onDone: () => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const onboarding = useCreateDukaanProfile();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cnic, setCnic] = useState('');
  const [role, setRole] = useState<'customer' | 'merchant'>('customer');
  const [error, setError] = useState('');
  const submit = async () => {
    setError('');
    try {
      await onboarding.mutateAsync({ data: { name: name.trim(), email, phone: phone.trim(), cnic: cnic.trim(), role } });
      await queryClient.invalidateQueries();
      onDone();
    } catch (reason) {
      setError(errorMessage(reason, 'Could not save your profile.'));
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.authPage} keyboardShouldPersistTaps="handled">
        <BrandMark />
        <View style={{ gap: 8 }}>
          <Eyebrow>ONE-TIME SETUP</Eyebrow>
          <Text style={[styles.heroTitle, { color: colors.foreground, fontSize: 34 }]}>A safer local shop network.</Text>
          <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
            Your CNIC is used for a duplicate check. The full number is not saved; only a keyed digest and last four digits are retained.
          </Text>
        </View>
        <Panel>
          <SectionHeading title="Finish your customer profile" detail={email} />
          <Field label="Full name" value={name} onChangeText={setName} placeholder="Your full name" autoCapitalize="words" />
          <Field label="Pakistani mobile number" value={phone} onChangeText={setPhone} placeholder="03XXXXXXXXX" keyboardType="phone-pad" />
          <Field label="CNIC" value={cnic} onChangeText={setCnic} placeholder="12345-1234567-1" keyboardType="number-pad" maxLength={15} />
          <Text style={[styles.smallText, { color: colors.foreground, fontWeight: '600' }]}>Choose your account type</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {([
              ['customer', 'Customer'],
              ['merchant', 'Shop owner'],
            ] as const).map(([value, label]) => (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ checked: role === value }}
                onPress={() => setRole(value)}
                style={{
                  flex: 1,
                  padding: 12,
                  borderWidth: 1,
                  borderRadius: 14,
                  borderColor: role === value ? colors.primary : colors.border,
                  backgroundColor: role === value ? colors.secondary : colors.card,
                }}
              >
                <Text style={{ color: colors.foreground, textAlign: 'center', fontWeight: '600' }}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.smallText, { color: colors.mutedForeground }]}>
            Mobile number format is checked; SMS ownership verification is not connected yet.
          </Text>
          {error ? <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text> : null}
          <AppButton label="Save profile" onPress={submit} loading={onboarding.isPending} disabled={!name || !phone || cnic.replace(/\D/g, '').length !== 13} />
        </Panel>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function IndexScreen() {
  const colors = useColors();
  const { isLoaded, user } = useFirebaseSession();
  const isSignedIn = Boolean(user?.emailVerified);
  const queryClient = useQueryClient();
  const router = useRouter();
  const redirectStarted = useRef(false);
  const wasSignedIn = useRef(false);
  const profile = useGetDukaanProfile({
    query: {
      queryKey: getGetDukaanProfileQueryKey(),
      enabled: Boolean(isSignedIn),
      retry: (failureCount, error) => {
        const status = (error as { status?: number } | null)?.status;
        return failureCount < 2 && (status == null || status === 401 || status >= 500);
      },
      retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 1_500),
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
      staleTime: 20_000,
    },
  });
  const confirmedProfile = profile.data?.profile as Profile | undefined;
  const currentWalkthroughKey =
    user?.uid && confirmedProfile
      ? roleWalkthroughStorageKey(user.uid, confirmedProfile.role)
      : null;
  const [roleWalkthroughGate, setRoleWalkthroughGate] = useState<RoleWalkthroughGate | null>(null);

  useEffect(() => {
    if (!currentWalkthroughKey) {
      setRoleWalkthroughGate(null);
      return;
    }
    let active = true;
    setRoleWalkthroughGate({ key: currentWalkthroughKey, ready: false, open: false });
    void isWalkthroughComplete(currentWalkthroughKey)
      .then((complete) => {
        if (active) {
          setRoleWalkthroughGate({ key: currentWalkthroughKey, ready: true, open: !complete });
        }
      })
      .catch(() => {
        if (active) {
          setRoleWalkthroughGate({ key: currentWalkthroughKey, ready: true, open: true });
        }
      });
    return () => {
      active = false;
    };
  }, [currentWalkthroughKey]);

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      wasSignedIn.current = true;
      redirectStarted.current = false;
      return;
    }
    if (wasSignedIn.current) {
      queryClient.clear();
      wasSignedIn.current = false;
    }
    if (redirectStarted.current) return;
    redirectStarted.current = true;
    router.replace('/login');
  }, [isLoaded, isSignedIn, queryClient, router]);

  if (!isLoaded || (isSignedIn && profile.isLoading)) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <BrandMark />
        <Text style={[styles.bodyText, { color: colors.mutedForeground, marginTop: 14 }]}>Opening your Saathi…</Text>
      </SafeAreaView>
    );
  }
  if (!isSignedIn) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>Returning to sign in…</Text>
      </SafeAreaView>
    );
  }
  if (profile.data?.profile) {
    const signedInProfile = profile.data.profile as Profile;
    const walkthroughKey = user?.uid
      ? roleWalkthroughStorageKey(user.uid, signedInProfile.role)
      : null;
    const walkthroughGate =
      walkthroughKey && roleWalkthroughGate?.key === walkthroughKey ? roleWalkthroughGate : null;
    if (walkthroughKey && !walkthroughGate?.ready) {
      return (
        <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
          <BrandMark />
          <Text style={[styles.bodyText, { color: colors.mutedForeground, marginTop: 14 }]}>Preparing your Saathi…</Text>
        </SafeAreaView>
      );
    }
    const finishRoleWalkthrough = async () => {
      if (!walkthroughKey) return;
      await markWalkthroughComplete(walkthroughKey);
      setRoleWalkthroughGate((current) =>
        current?.key === walkthroughKey ? { ...current, open: false } : current,
      );
    };
    return (
      <Dashboard
        profile={signedInProfile}
        onSignOutStart={() => { redirectStarted.current = true; }}
        onSignedOut={() => router.replace('/login')}
        onSignOutFailed={() => { redirectStarted.current = false; }}
        roleWalkthroughOpen={Boolean(walkthroughGate?.open)}
        onFinishWalkthrough={finishRoleWalkthrough}
      />
    );
  }
  const status = (profile.error as { status?: number } | null)?.status;
  if (status === 404) {
    return (
      <ProfileSetup
        email={user?.email ?? ''}
        onDone={() => { void queryClient.invalidateQueries(); }}
      />
    );
  }
  return (
    <SafeAreaView style={[styles.centered, { backgroundColor: colors.background, padding: 26 }]}>
      <Feather name="wifi-off" size={28} color={colors.primary} />
      <Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: 'center' }]}>We couldn't reach your account</Text>
      <Text style={[styles.bodyText, { color: colors.mutedForeground, textAlign: 'center' }]}>
        {errorMessage(profile.error, 'Please check your connection and try again.')}
      </Text>
      <AppButton label="Try again" onPress={() => void profile.refetch()} loading={profile.isFetching} />
    </SafeAreaView>
  );
}

function Dashboard({
  profile,
  onSignOutStart,
  onSignedOut,
  onSignOutFailed,
  roleWalkthroughOpen,
  onFinishWalkthrough,
}: {
  profile: Profile;
  onSignOutStart: () => void;
  onSignedOut: () => void;
  onSignOutFailed: () => void;
  roleWalkthroughOpen: boolean;
  onFinishWalkthrough: () => Promise<void>;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [section, setSection] = useState<'home' | 'orders' | 'history' | 'notifications' | 'merchant' | 'admin' | 'profile'>(() =>
    profile.role === 'merchant' ? 'merchant' : profile.role === 'admin' ? 'admin' : 'home',
  );
  const profileReturnSection = useRef<'home' | 'orders' | 'history' | 'notifications' | 'merchant' | 'admin'>(
    profile.role === 'merchant' ? 'merchant' : 'home',
  );
  const [location, setLocation] = useState<Coordinates>({ latitude: 25.5276, longitude: 69.0416 });
  const [usingDemoLocation, setUsingDemoLocation] = useState(true);
  const [locationMessage, setLocationMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [voiceReview, setVoiceReview] = useState(false);
  const chatSessionVersion = useRef(0);
  const resetShoppingChat = useCallback(() => {
    chatSessionVersion.current += 1;
    setMessages([]);
    setDraft('');
    setVoiceReview(false);
  }, []);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState<{ id: string } | null>(null);
  const [shownCode, setShownCode] = useState('');
  const [codeForOrder, setCodeForOrder] = useState('');
  const [codeLoadingForOrder, setCodeLoadingForOrder] = useState('');
  const pickupCodeRequest = useRef(0);
  const [shopForm, setShopForm] = useState({ name: '', address: '', contact: '' });
  const [productForm, setProductForm] = useState({ name: '', category: '', unit: '', price: '', stock: '' });
  const [editingProductId, setEditingProductId] = useState('');
  const [merchantInstruction, setMerchantInstruction] = useState('');
  const [merchantPreview, setMerchantPreview] = useState<any>(null);
  const [merchantReply, setMerchantReply] = useState('');
  const [merchantAssistantError, setMerchantAssistantError] = useState('');
  const [merchantVoiceReview, setMerchantVoiceReview] = useState(false);
  const [merchantConfirmBusy, setMerchantConfirmBusy] = useState(false);
  const merchantRequestVersion = useRef(0);
  const [adminMessage, setAdminMessage] = useState('');
  const [dialog, setDialog] = useState<{ title: string; message: string } | null>(null);
  const [busyOrderActions, setBusyOrderActions] = useState<Record<string, boolean>>({});
  const [markingNotificationId, setMarkingNotificationId] = useState('');
  const [markingAllNotifications, setMarkingAllNotifications] = useState(false);
  const [pushAlertsEnabled, setPushAlertsEnabled] = useState(false);
  const [pushAlertsBusy, setPushAlertsBusy] = useState(false);
  const [pushAlertsError, setPushAlertsError] = useState('');
  const orderStatusLocks = useRef(new Set<string>());

  useEffect(() => {
    if (!supportsPhonePush()) return;
    let active = true;
    let removeSubscription: (() => void) | undefined;
    void import('expo-notifications')
      .then((Notifications) => {
        if (!active) return;
        const openNotifications = (response: NotificationTypes.NotificationResponse | null) => {
          if (response?.notification.request.content.data?.section === 'notifications') {
            setSection('notifications');
          }
        };
        void Notifications.getLastNotificationResponseAsync().then(openNotifications).catch(() => {});
        const subscription = Notifications.addNotificationResponseReceivedListener(openNotifications);
        removeSubscription = () => subscription.remove();
      })
      .catch(() => {});
    return () => {
      active = false;
      removeSubscription?.();
    };
  }, []);

  const catalog = useGetDukaanCatalog(
    { latitude: location.latitude, longitude: location.longitude, radiusKm: 12 },
    { query: { queryKey: getGetDukaanCatalogQueryKey({ latitude: location.latitude, longitude: location.longitude, radiusKm: 12 }), enabled: true, staleTime: 20_000 } },
  );
  const ordersQuery = useGetDukaanOrders({
    query: {
      queryKey: getGetDukaanOrdersQueryKey(),
      enabled: true,
      staleTime: 3_000,
      refetchInterval: section === 'orders' || section === 'history' ? 5_000 : false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  });
  const notificationsQuery = useGetDukaanOrderNotifications({
    query: {
      queryKey: getGetDukaanOrderNotificationsQueryKey(),
      enabled: profile.role === 'customer' || profile.role === 'merchant',
      staleTime: 0,
      refetchInterval: profile.role === 'customer' || profile.role === 'merchant' ? 5_000 : false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  });
  const merchantProducts = useGetMerchantProducts({
    query: {
      queryKey: getGetMerchantProductsQueryKey(),
      enabled: profile.role === 'merchant' && profile.shopStatus === 'approved',
      refetchInterval: section === 'merchant' ? 5_000 : false,
      refetchOnWindowFocus: true,
    },
  });
  const adminOverview = useGetDukaanAdminOverview({ query: { queryKey: getGetDukaanAdminOverviewQueryKey(), enabled: profile.role === 'admin' } });
  const assistant = useAskDukaanAssistant();
  const merchantAssistant = useAskMerchantAssistant();
  const createOrder = useCreateDukaanOrder();
  const getPickupCode = useGetDukaanPickupCode();
  const updateOrder = useUpdateDukaanOrderStatus();
  const markAllOrderNotificationsRead = useMarkAllDukaanOrderNotificationsRead();
  const markOrderNotificationRead = useMarkDukaanOrderNotificationRead();
  const registerPushToken = useRegisterDukaanPushToken();
  const unregisterPushToken = useUnregisterDukaanPushToken();

  useEffect(() => {
    let active = true;
    setPushAlertsEnabled(false);
    setPushAlertsError('');
    void (async () => {
      const optedIn = await readPushAlertsPreference(profile.id);
      if (!active || !optedIn) return;
      if (!supportsPhonePush()) {
        setPushAlertsError(
          Platform.OS === 'web'
            ? 'Phone alerts are only available in a mobile app.'
            : 'Push alerts are unavailable in Expo Go; they require an installed development build.',
        );
        return;
      }
      const token = await getExpoPushToken(false);
      if (!token) {
        setPushAlertsError('Notification permission is off. Allow notifications in your phone settings to receive alerts.');
        return;
      }
      const platform = Platform.OS === 'ios' ? 'ios' : 'android';
      const result = await registerPushToken.mutateAsync({ data: { token, platform } });
      await savePushTokenId(profile.id, result.tokenId);
      if (active) setPushAlertsEnabled(true);
    })().catch((reason) => {
      if (active) setPushAlertsError(errorMessage(reason, 'Could not restore phone alerts on this device.'));
    });
    return () => {
      active = false;
    };
  }, [profile.id, profile.role]);
  const createShop = useCreateDukaanShop();
  const createProduct = useCreateMerchantProduct();
  const updateProduct = useUpdateMerchantProduct();
  const deleteProduct = useDeleteMerchantProduct();
  const reviewShop = useReviewDukaanShop();
  const transcribe = useTranscribeDukaanAudio();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const recordingTarget = useRef<'customer' | 'merchant' | null>(null);

  useEffect(() => {
    if (profile.role !== 'customer') return;
    if (messages.length === 0 && !draft.trim() && !voiceReview) return;
    if (assistant.isPending || transcribe.isPending || recording || voiceBusy) return;
    let expired = false;
    const expireChat = () => {
      if (expired) return;
      expired = true;
      resetShoppingChat();
    };
    const idleSince = Date.now();
    const timeoutId = setTimeout(expireChat, SHOPPING_CHAT_IDLE_TIMEOUT_MS);
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (
        nextState === 'active' &&
        Date.now() - idleSince >= SHOPPING_CHAT_IDLE_TIMEOUT_MS
      ) {
        expireChat();
      }
    });
    return () => {
      clearTimeout(timeoutId);
      appStateSubscription.remove();
    };
  }, [
    assistant.isPending,
    draft,
    messages,
    profile.role,
    recording,
    resetShoppingChat,
    transcribe.isPending,
    voiceBusy,
    voiceReview,
  ]);

  const shops = catalog.data?.shops ?? [];
  const shopName = (shopId: string) => shops.find((shop) => shop.id === shopId)?.name ?? 'Local shop';
  const shopInfo = (shopId: string) => shops.find((shop) => shop.id === shopId);
  const cartLines = Object.values(cart);
  const cartTotal = cartLines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  const orderRows = ordersQuery.data?.orders ?? [];
  const notifications = (notificationsQuery.data?.notifications ?? []) as OrderStatusNotification[];
  const notificationUnreadCount = notificationsQuery.data?.unreadCount ?? 0;
  const isMerchant = profile.role === 'merchant';
  const isAdmin = profile.role === 'admin';
  const showStickyCart = section === 'home' && profile.role === 'customer' && cartLines.length > 0;
  const completedOrCancelled = (order: any) => ['completed', 'cancelled'].includes(order.status);
  const ordersForSection = isAdmin
    ? orderRows
    : section === 'history'
      ? orderRows.filter(completedOrCancelled)
      : orderRows.filter((order) => !completedOrCancelled(order));
  const tabs = isAdmin
    ? [{ id: 'admin' as const, label: 'Admin', icon: 'shield' as const }, { id: 'orders' as const, label: 'Orders', icon: 'clipboard' as const }]
    : isMerchant
      ? [
          { id: 'merchant' as const, label: 'My shop', icon: 'home' as const },
          { id: 'orders' as const, label: 'Orders', icon: 'clipboard' as const },
          { id: 'history' as const, label: 'Order history', icon: 'archive' as const },
        ]
      : [
          { id: 'home' as const, label: 'Shop', icon: 'shopping-bag' as const },
          { id: 'orders' as const, label: 'Orders', icon: 'clipboard' as const },
          { id: 'history' as const, label: 'Order history', icon: 'archive' as const },
        ];

  const invalidateApp = () => queryClient.invalidateQueries();
  const refreshInventory = async () => {
    const catalogKey = getGetDukaanCatalogQueryKey({
      latitude: location.latitude,
      longitude: location.longitude,
      radiusKm: 12,
    });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetMerchantProductsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: catalogKey }),
    ]);
  };
  const showDialog = (title: string, message: string) => setDialog({ title, message });
  const markNotificationRead = async (notificationId: string) => {
    if (markingNotificationId || markingAllNotifications) return;
    setMarkingNotificationId(notificationId);
    try {
      await markOrderNotificationRead.mutateAsync({ notificationId });
      await queryClient.invalidateQueries({ queryKey: getGetDukaanOrderNotificationsQueryKey() });
    } catch (reason) {
      showDialog('Could not update notification', errorMessage(reason, 'Try again in a moment.'));
    } finally {
      setMarkingNotificationId('');
    }
  };
  const markAllNotificationsRead = async () => {
    if (markingAllNotifications || markingNotificationId || notificationUnreadCount === 0) return;
    setMarkingAllNotifications(true);
    try {
      await markAllOrderNotificationsRead.mutateAsync();
      await queryClient.invalidateQueries({ queryKey: getGetDukaanOrderNotificationsQueryKey() });
    } catch (reason) {
      showDialog('Could not update notifications', errorMessage(reason, 'Try again in a moment.'));
    } finally {
      setMarkingAllNotifications(false);
    }
  };
  const togglePushAlerts = async () => {
    if (pushAlertsBusy) return;
    setPushAlertsBusy(true);
    setPushAlertsError('');
    try {
      if (pushAlertsEnabled) {
        const tokenId = await readPushTokenId(profile.id);
        if (tokenId) await unregisterPushToken.mutateAsync({ tokenId });
        await clearPushTokenId(profile.id);
        await savePushAlertsPreference(profile.id, false);
        setPushAlertsEnabled(false);
        return;
      }

      const token = await getExpoPushToken(true);
      if (!token) {
        setPushAlertsError('Notification permission was not granted. You can allow it later in your phone settings.');
        return;
      }
      const platform = Platform.OS === 'ios' ? 'ios' : 'android';
      const result = await registerPushToken.mutateAsync({ data: { token, platform } });
      await savePushTokenId(profile.id, result.tokenId);
      await savePushAlertsPreference(profile.id, true);
      setPushAlertsEnabled(true);
    } catch (reason) {
      setPushAlertsError(errorMessage(reason, 'Could not update phone alerts. Please try again.'));
    } finally {
      setPushAlertsBusy(false);
    }
  };
  const handleSignOut = async () => {
    if (signingOut) return;
    onSignOutStart();
    setSigningOut(true);
    setSignOutError('');
    try {
      const tokenId = await readPushTokenId(profile.id);
      if (tokenId) {
        await unregisterPushToken.mutateAsync({ tokenId });
        await clearPushTokenId(profile.id);
      }
      await signOutFirebase();
      queryClient.clear();
      onSignedOut();
    } catch (reason) {
      onSignOutFailed();
      setSigningOut(false);
      setSignOutError(errorMessage(reason, 'Could not sign out. Please try again.'));
    }
  };
  const toggleProfileSettings = () => {
    if (section === 'profile') {
      setSection(profileReturnSection.current);
      return;
    }
    profileReturnSection.current = section;
    setSection('profile');
  };
  const updateLocation = async (): Promise<Coordinates | null> => {
    setLocationMessage('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationMessage(profile.role === 'merchant'
          ? 'Location access was declined. Your saved shop coordinates were not changed.'
          : 'Location access was declined. The demo location stays selected.');
        return null;
      }
      const coords = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const currentLocation = { latitude: coords.coords.latitude, longitude: coords.coords.longitude };
      setLocation(currentLocation);
      setUsingDemoLocation(false);
      setLocationMessage(profile.role === 'merchant' && profile.shopStatus
        ? 'Location captured. Save it in shop settings to update your shop pin.'
        : 'Using your current location.');
      return currentLocation;
    } catch {
      setLocationMessage(profile.role === 'merchant'
        ? 'We could not read your location. Your saved shop coordinates were not changed.'
        : 'We could not read your location. Try again or keep the demo area.');
      return null;
    }
  };
  const openDirections = async (latitude: number | null, longitude: number | null) => {
    if (latitude == null || longitude == null) {
      showDialog('Directions unavailable', 'This shop does not have a saved map location.');
      return;
    }
    const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=walking`;
    try {
      await Linking.openURL(url);
    } catch {
      showDialog('Could not open maps', 'Install Google Maps or choose another maps app.');
    }
  };
  const addProduct = (product: ProductItem) => {
    const otherShop = cartLines.find((line) => line.product.shopId !== product.shopId);
    if (otherShop) {
      showDialog('One pickup shop at a time', 'Clear your current basket before adding items from a different shop.');
      return;
    }
    setCart((prev) => {
      const current = prev[product.id];
      return { ...prev, [product.id]: { product, quantity: Math.min(product.stock, (current?.quantity ?? 0) + 1) } };
    });
  };
  const sendShoppingRequest = async () => {
    const message = draft.trim();
    if (!message) return;
    const requestSessionVersion = chatSessionVersion.current;
    setDraft('');
    setVoiceReview(false);
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', text: message }];
    setMessages(nextMessages);
    try {
      const result = await assistant.mutateAsync({
        data: {
          message,
          latitude: location.latitude,
          longitude: location.longitude,
          history: messages.slice(-4).map(({ role, text }) => ({ role, content: text })),
        },
      });
      if (requestSessionVersion !== chatSessionVersion.current) return;
      setMessages((current) => [...current, {
        role: 'assistant',
        text: result.reply,
        products: result.products as ProductItem[],
      }]);
    } catch (reason) {
      if (requestSessionVersion !== chatSessionVersion.current) return;
      setMessages((current) => [...current, {
        role: 'assistant',
        text: errorMessage(reason, 'Saathi is busy. Browse the nearby products below.'),
      }]);
    }
  };
  const startRecording = async (target: 'customer' | 'merchant') => {
    if (recording || voiceBusy) return;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        showDialog('Microphone permission needed', 'Allow microphone access to record a voice instruction.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recordingTarget.current = target;
      recorder.record({ forDuration: 45 });
      setRecording(true);
    } catch {
      recordingTarget.current = null;
      showDialog('Could not start recording', 'Try typing your instruction instead.');
    }
  };
  const stopAndTranscribe = async () => {
    if (!recording || voiceBusy) return;
    const target = recordingTarget.current;
    setVoiceBusy(true);
    setRecording(false);
    let recordingUri: string | null = null;
    try {
      await recorder.stop();
      recordingUri = recorder.getStatus().url;
      if (!recordingUri) throw new Error('Recording file is unavailable.');
      let audioBase64: string;
      if (Platform.OS === 'web') {
        const audioResponse = await fetch(recordingUri);
        if (!audioResponse.ok) throw new Error('Recording file could not be read.');
        const bytes = new Uint8Array(await audioResponse.arrayBuffer());
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 0x2000) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x2000));
        }
        audioBase64 = globalThis.btoa(binary);
      } else {
        audioBase64 = await FileSystem.readAsStringAsync(recordingUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
      const mimeType = Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4';
      const result = await transcribe.mutateAsync({ data: { audioBase64, mimeType } });
      if (target === 'merchant') {
        merchantRequestVersion.current += 1;
        setMerchantInstruction(result.text);
        setMerchantVoiceReview(true);
        setMerchantPreview(null);
        setMerchantReply('');
        setMerchantAssistantError('');
      } else {
        setDraft(result.text);
        setVoiceReview(true);
      }
    } catch (reason) {
      showDialog('Transcription unavailable', errorMessage(reason, 'Please type your request instead.'));
    } finally {
      if (recordingUri) await FileSystem.deleteAsync(recordingUri, { idempotent: true }).catch(() => {});
      recordingTarget.current = null;
      setVoiceBusy(false);
    }
  };
  const confirmBasket = async () => {
    if (cartLines.length === 0) return;
    try {
      const result = await createOrder.mutateAsync({
        data: {
          items: cartLines.map(({ product, quantity }) => ({ productId: product.id, quantity })),
          idempotencyKey: Crypto.randomUUID(),
          paymentMethod: 'pay_on_pickup',
        },
      });
      setLastOrder({ id: result.order.id });
      resetShoppingChat();
      setCart({});
      setCheckoutOpen(false);
      setSection('orders');
      await invalidateApp();
    } catch (reason) {
      showDialog('Order not confirmed', errorMessage(reason, 'Stock may have changed. Review your basket and try again.'));
    }
  };
  const showPickupCode = async (orderId: string) => {
    if (codeForOrder === orderId && shownCode) {
      pickupCodeRequest.current += 1;
      setShownCode('');
      setCodeForOrder('');
      setCodeLoadingForOrder('');
      return;
    }
    if (codeLoadingForOrder === orderId) return;
    const requestId = ++pickupCodeRequest.current;
    setShownCode('');
    setCodeForOrder(orderId);
    setCodeLoadingForOrder(orderId);
    try {
      const result = await getPickupCode.mutateAsync({ orderId });
      if (pickupCodeRequest.current !== requestId) return;
      setShownCode(result.pickupCode);
    } catch (reason) {
      if (pickupCodeRequest.current === requestId) {
        setShownCode('');
        setCodeForOrder('');
        showDialog('Code unavailable', errorMessage(reason, 'Try again in a moment.'));
      }
    } finally {
      if (pickupCodeRequest.current === requestId) setCodeLoadingForOrder('');
    }
  };
  const setOrderStatus = async (orderId: string, status: 'accepted' | 'ready' | 'completed' | 'cancelled', pickupCode?: string) => {
    if (status === 'completed' && !/^\d{6}$/.test(pickupCode ?? '')) {
      showDialog('Check the pickup code', 'Enter the customer’s six-digit code to complete this order.');
      return;
    }
    const actionKey = `${orderId}:${status}`;
    if (orderStatusLocks.current.has(actionKey)) return;
    orderStatusLocks.current.add(actionKey);
    setBusyOrderActions((current) => ({ ...current, [actionKey]: true }));
    try {
      await updateOrder.mutateAsync({ orderId, data: { status, pickupCode } });
      await invalidateApp();
    } catch (reason) {
      showDialog('Order not updated', errorMessage(reason, 'Check the status and try again.'));
    } finally {
      orderStatusLocks.current.delete(actionKey);
      setBusyOrderActions((current) => {
        const next = { ...current };
        delete next[actionKey];
        return next;
      });
    }
  };
  const registerShop = async () => {
    if (!shopForm.name.trim() || !shopForm.address.trim() || !shopForm.contact.trim()) {
      showDialog('Complete shop details', 'Add the shop name, address, and a mobile contact.');
      return;
    }
    if (usingDemoLocation) {
      showDialog('Use your shop location', 'Tap “Get location” and allow location access before submitting the shop application.');
      return;
    }
    try {
      await createShop.mutateAsync({
        data: {
          name: shopForm.name.trim(),
          address: shopForm.address.trim(),
          contact: shopForm.contact.trim(),
          latitude: location.latitude,
          longitude: location.longitude,
        },
      });
      showDialog('Application sent', 'Your shop is pending admin review. Inventory tools open after approval.');
      await invalidateApp();
    } catch (reason) {
      showDialog('Could not submit shop', errorMessage(reason, 'Review the details and try again.'));
    }
  };
  const clearProductForm = () => {
    setEditingProductId('');
    setProductForm({ name: '', category: '', unit: '', price: '', stock: '' });
  };
  const saveProduct = async () => {
    const price = Number(productForm.price);
    const stock = Number(productForm.stock);
    if (!productForm.name.trim() || !productForm.category.trim() || !productForm.unit.trim() ||
      !Number.isInteger(price) || price < 1 || !Number.isInteger(stock) || stock < 0) {
      showDialog('Check product details', 'Enter a name, category, pack size, whole-rupee price, and stock count.');
      return;
    }
    const data = {
      name: productForm.name.trim(),
      category: productForm.category.trim(),
      unit: productForm.unit.trim(),
      price,
      stock,
    };
    try {
      if (editingProductId) await updateProduct.mutateAsync({ productId: editingProductId, data });
      else await createProduct.mutateAsync({ data });
      clearProductForm();
      await refreshInventory();
    } catch (reason) {
      showDialog('Product not saved', errorMessage(reason, 'Check your shop status and try again.'));
    }
  };
  const onMerchantInstructionChange = (value: string) => {
    merchantRequestVersion.current += 1;
    setMerchantInstruction(value);
    setMerchantVoiceReview(false);
    // Editing an instruction invalidates any proposal based on its previous text.
    setMerchantPreview(null);
    setMerchantReply('');
    setMerchantAssistantError('');
  };
  const askMerchantAssistant = async () => {
    if (!merchantInstruction.trim() || merchantAssistant.isPending || merchantConfirmBusy ||
      voiceBusy || recording) return;
    setMerchantAssistantError('');
    setMerchantReply('');
    setMerchantPreview(null);
    const requestVersion = merchantRequestVersion.current;
    try {
      const result = await merchantAssistant.mutateAsync({ data: { instruction: merchantInstruction.trim() } });
      if (requestVersion !== merchantRequestVersion.current) return;
      setMerchantReply(result.reply);
      setMerchantPreview({ action: result.action, ...result.preview });
      setMerchantVoiceReview(false);
      // Keep the original instruction so the merchant can refine it after clarification.
    } catch (reason) {
      if (requestVersion === merchantRequestVersion.current) {
        setMerchantAssistantError(errorMessage(reason, 'The inventory assistant is busy. Use the product form below.'));
      }
    }
  };
  const cancelMerchantPreview = () => {
    if (merchantConfirmBusy) return;
    merchantRequestVersion.current += 1;
    setMerchantPreview(null);
    setMerchantReply('');
    setMerchantAssistantError('');
    // The instruction stays available for editing; no product data is changed.
  };
  const confirmMerchantPreview = async () => {
    const preview = merchantPreview;
    if (!preview || preview.action === 'clarify' || merchantConfirmBusy) return;
    setMerchantConfirmBusy(true);
    setMerchantAssistantError('');
    try {
      if (preview.action === 'delete') {
        await deleteProduct.mutateAsync({ productId: preview.productId });
      } else {
        const data = {
          name: preview.name,
          category: preview.category,
          unit: preview.unit,
          price: Number(preview.price),
          stock: Number(preview.stock),
        };
        if (preview.action === 'update') {
          await updateProduct.mutateAsync({ productId: preview.productId, data });
        } else {
          await createProduct.mutateAsync({ data });
        }
      }
      // Clear a confirmed proposal immediately to prevent double submissions.
      setMerchantPreview(null);
      setMerchantInstruction('');
      setMerchantVoiceReview(false);
      setMerchantReply('Done. Your inventory has been updated.');
      try {
        await refreshInventory();
      } catch {
        setMerchantAssistantError('Change saved, but the inventory list could not refresh. Reopen this screen to see the latest stock.');
      }
    } catch (reason) {
      setMerchantAssistantError(errorMessage(reason, 'That change was not saved. Review the product details and try again.'));
    } finally {
      setMerchantConfirmBusy(false);
    }
  };
  const editProduct = (product: ProductItem) => {
    setEditingProductId(product.id);
    setProductForm({
      name: product.name,
      category: product.category,
      unit: product.unit,
      price: String(product.price),
      stock: String(product.stock),
    });
  };
  const approveShop = async (shopId: string, status: 'approved' | 'rejected') => {
    try {
      await reviewShop.mutateAsync({ shopId, data: { status } });
      setAdminMessage(status === 'approved' ? 'Shop approved and listed.' : 'Shop application rejected.');
      await invalidateApp();
    } catch (reason) {
      setAdminMessage(errorMessage(reason, 'Could not update this application.'));
    }
  };

  const screenTitle = section === 'history'
    ? 'Order history'
    : section === 'orders'
      ? 'Your orders'
      : section === 'notifications'
        ? 'Notifications'
      : section === 'merchant'
        ? 'Shop workspace'
        : section === 'profile'
          ? 'Profile settings'
        : section === 'admin'
          ? 'Admin overview'
          : 'Your neighbourhood.';
  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : 0 }]}
      edges={['top', 'left', 'right']}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.appHeader}>
          <View style={styles.brandRow}>
            <BrandMark small />
            <View>
              <Text style={[styles.brandName, { color: colors.foreground, fontSize: 16 }]}>dukaan saathi</Text>
              <Text style={[styles.brandSub, { color: colors.mutedForeground }]}>{profile.name.split(' ')[0]} · {profile.role}</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            {profile.role === 'customer' || profile.role === 'merchant' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={notificationUnreadCount > 0 ? `Notifications, ${notificationUnreadCount} unread` : 'Notifications'}
                testID="notifications-button"
                onPress={() => setSection('notifications')}
                style={[styles.iconButton, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Feather name="bell" size={17} color={colors.foreground} />
                {notificationUnreadCount > 0 ? (
                  <View style={[styles.notificationBadge, { backgroundColor: colors.destructive }]}>
                    <Text style={[styles.notificationBadgeText, { color: colors.destructiveForeground }]}>
                      {notificationUnreadCount > 99 ? '99+' : notificationUnreadCount}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            ) : null}
            {profile.role === 'customer' || profile.role === 'merchant' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={section === 'profile' ? 'Close profile settings' : 'Profile settings'}
                accessibilityState={{ selected: section === 'profile' }}
                testID="profile-settings-button"
                onPress={toggleProfileSettings}
                style={[
                  styles.iconButton,
                  {
                    backgroundColor: section === 'profile' ? colors.primary : colors.card,
                    borderColor: section === 'profile' ? colors.primary : colors.border,
                  },
                ]}
              >
                <Feather name="user" size={17} color={section === 'profile' ? colors.primaryForeground : colors.foreground} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityLabel={signingOut ? 'Signing out' : 'Sign out'}
              accessibilityState={{ disabled: signingOut, busy: signingOut }}
              disabled={signingOut}
              onPress={handleSignOut}
              style={[styles.iconButton, { backgroundColor: colors.card, borderColor: colors.border, opacity: signingOut ? 0.55 : 1 }]}
            >
              <Feather name="log-out" size={17} color={colors.foreground} />
            </Pressable>
          </View>
        </View>
        {signOutError ? <View style={{ paddingHorizontal: 18, paddingTop: 8 }}><Notice tone="warning">{signOutError}</Notice></View> : null}
        <View style={styles.navRow}>
          {tabs.map((tab) => (
            <Pressable
              key={tab.id}
              onPress={() => setSection(tab.id)}
              style={[
                styles.navItem,
                {
                  backgroundColor: section === tab.id ? colors.primary : colors.card,
                  borderColor: section === tab.id ? colors.primary : colors.border,
                },
              ]}
            >
              <Feather name={tab.icon} size={15} color={section === tab.id ? colors.primaryForeground : colors.mutedForeground} />
              <Text style={[styles.navText, { color: section === tab.id ? colors.primaryForeground : colors.foreground }]}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView
          contentContainerStyle={[
            styles.page,
            {
              paddingBottom: showStickyCart
                ? Math.max(148, insets.bottom + 128)
                : Platform.OS === 'web' ? 84 : 50,
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.pageTitle}>
            <View style={{ flex: 1, gap: 5 }}>
              <Eyebrow>{isAdmin ? 'KEEPING LOCAL COMMERCE SAFE' : isMerchant ? 'YOUR LOCAL SHOP' : 'A LITTLE CLOSER TO HOME'}</Eyebrow>
              <Text style={[styles.pageHeading, { color: colors.foreground }]}>{screenTitle}</Text>
            </View>
            {!isMerchant && !isAdmin ? (
              <Pressable onPress={updateLocation} style={[styles.locationPill, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Feather name="map-pin" size={14} color={colors.primary} />
                <Text style={[styles.locationText, { color: colors.foreground }]}>{usingDemoLocation ? 'Demo area' : 'Near me'}</Text>
              </Pressable>
            ) : null}
          </View>
          {locationMessage ? <Notice tone="info">{locationMessage}</Notice> : null}

          {section === 'home' && !isMerchant && !isAdmin ? (
            <CustomerHome
              location={location}
              usingDemoLocation={usingDemoLocation}
              catalog={catalog}
              messages={messages}
              draft={draft}
              setDraft={setDraft}
              voiceReview={voiceReview}
              recording={recording}
              voiceBusy={voiceBusy || transcribe.isPending}
              onLocation={updateLocation}
              onSend={sendShoppingRequest}
              onStartVoice={() => { void startRecording('customer'); }}
              onStopVoice={stopAndTranscribe}
              addProduct={addProduct}
              assistantBusy={assistant.isPending}
              shopName={shopName}
              shopInfo={shopInfo}
            />
          ) : section === 'notifications' && (profile.role === 'customer' || profile.role === 'merchant') ? (
            <NotificationsView
              notifications={notifications}
              unreadCount={notificationUnreadCount}
              role={profile.role}
              loading={notificationsQuery.isLoading}
              error={notificationsQuery.isError ? errorMessage(notificationsQuery.error, 'Notifications could not be loaded.') : ''}
              markingNotificationId={markingNotificationId}
              markingAllNotifications={markingAllNotifications}
              pushAlertsEnabled={pushAlertsEnabled}
              pushAlertsBusy={pushAlertsBusy}
              pushAlertsError={pushAlertsError}
              pushSupported={supportsPhonePush()}
              onRetry={() => { void notificationsQuery.refetch(); }}
              onMarkRead={markNotificationRead}
              onMarkAllRead={markAllNotificationsRead}
              onTogglePushAlerts={togglePushAlerts}
            />
          ) : section === 'orders' || section === 'history' ? (
            <OrdersView
              orders={ordersForSection as any[]}
              loading={ordersQuery.isLoading}
              role={profile.role}
              history={section === 'history'}
              busyOrderActions={busyOrderActions}
              lastOrder={section === 'orders' ? lastOrder : null}
              shownCode={shownCode}
              codeForOrder={codeForOrder}
              codeLoadingForOrder={codeLoadingForOrder}
              onShowCode={showPickupCode}
              onDirections={openDirections}
              onStatus={setOrderStatus}
            />
          ) : section === 'merchant' && isMerchant ? (
            <MerchantView
              profile={profile}
              location={location}
              usingDemoLocation={usingDemoLocation}
              shopForm={shopForm}
              setShopForm={setShopForm}
              onLocation={updateLocation}
              onRegister={registerShop}
              creatingShop={createShop.isPending}
              products={merchantProducts.data?.products as ProductItem[] | undefined}
              productsLoading={merchantProducts.isLoading}
              form={productForm}
              setForm={setProductForm}
              editingId={editingProductId}
              onSaveProduct={saveProduct}
              onEditProduct={editProduct}
              onDeleteProduct={async (id) => {
                try {
                  await deleteProduct.mutateAsync({ productId: id });
                  await refreshInventory();
                } catch (reason) {
                  showDialog('Could not remove product', errorMessage(reason, 'Try again.'));
                }
              }}
              onClearForm={clearProductForm}
              savingProduct={createProduct.isPending || updateProduct.isPending}
              instruction={merchantInstruction}
              setInstruction={onMerchantInstructionChange}
              onAskAssistant={askMerchantAssistant}
              assistantBusy={merchantAssistant.isPending}
              assistantReply={merchantReply}
              assistantError={merchantAssistantError}
              recording={recording && recordingTarget.current === 'merchant'}
              voiceBusy={voiceBusy && recordingTarget.current === 'merchant'}
              voiceReview={merchantVoiceReview}
              onStartVoice={() => { void startRecording('merchant'); }}
              onStopVoice={stopAndTranscribe}
              preview={merchantPreview}
              confirmBusy={merchantConfirmBusy}
              onConfirmPreview={confirmMerchantPreview}
              onCancelPreview={cancelMerchantPreview}
            />
          ) : section === 'profile' && (profile.role === 'customer' || profile.role === 'merchant') ? (
            <ProfileChangeRequestsView profile={profile}>
              {profile.role === 'merchant' && profile.shopStatus ? (
                <MerchantShopSettings onLocation={updateLocation} />
              ) : null}
            </ProfileChangeRequestsView>
          ) : section === 'admin' && isAdmin ? (
            <AdminView
              overview={adminOverview.data as any}
              loading={adminOverview.isLoading}
              message={adminMessage}
              onReview={approveShop}
              reviewBusy={reviewShop.isPending}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {showStickyCart ? (
        <View
          style={[
            styles.stickyCart,
            {
              backgroundColor: colors.primary,
              bottom: Math.max(insets.bottom, Platform.OS === 'web' ? 18 : 12) + 6,
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.primaryForeground, fontWeight: '700', fontSize: 14 }}>
              {cartLines.reduce((sum, line) => sum + line.quantity, 0)} items · PKR {cartTotal.toLocaleString()}
            </Text>
            <Text style={{ color: colors.primaryForeground, opacity: 0.78, fontSize: 11 }}>
              Pickup from {shopName(cartLines[0].product.shopId)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Review basket"
            onPress={() => setCheckoutOpen(true)}
            style={[styles.cartAction, { backgroundColor: colors.primaryForeground }]}
          >
            <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>Review basket</Text>
          </Pressable>
        </View>
      ) : null}

      <HelpAssistant role={profile.role} visible={!showStickyCart} />

      <Modal visible={checkoutOpen} animationType="slide" transparent onRequestClose={() => setCheckoutOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <View style={styles.rowBetween}>
              <SectionHeading title="Review your basket" detail="The server checks final prices and stock when you confirm." />
              <Pressable onPress={() => setCheckoutOpen(false)}><Feather name="x" size={22} color={colors.foreground} /></Pressable>
            </View>
            {cartLines.map(({ product, quantity }) => (
              <View key={product.id} style={styles.rowBetween}>
                <Text style={[styles.bodyText, { color: colors.foreground, flex: 1 }]}>{quantity} × {product.name} · {product.unit}</Text>
                <Text style={[styles.bodyText, { color: colors.foreground, fontWeight: '700' }]}>PKR {product.price * quantity}</Text>
              </View>
            ))}
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.rowBetween}>
              <Text style={[styles.label, { color: colors.foreground }]}>Estimated total</Text>
              <Text style={[styles.sectionTitle, { color: colors.primary }]}>PKR {cartTotal.toLocaleString()}</Text>
            </View>
            <Notice>Pay cash at pickup. Card, JazzCash, Easypaisa, and bank payment are shown as unavailable until a verified provider is connected.</Notice>
            <View style={styles.row}>
              <Tag selected>Cash at pickup</Tag>
              <Tag>Card · later</Tag>
              <Tag>JazzCash · later</Tag>
              <Tag>Easypaisa · later</Tag>
              <Tag>Bank transfer · later</Tag>
            </View>
            <Text style={[styles.smallText, { color: colors.mutedForeground }]}>By confirming, you reserve the listed items at this one shop.</Text>
            <AppButton label="Confirm pickup order" onPress={confirmBasket} loading={createOrder.isPending} />
            <AppButton label="Keep shopping" variant="outline" onPress={() => setCheckoutOpen(false)} />
          </View>
        </View>
      </Modal>
      <Modal
        visible={roleWalkthroughOpen}
        animationType="fade"
        statusBarTranslucent={Platform.OS === 'android'}
        navigationBarTranslucent={Platform.OS === 'android'}
        onRequestClose={() => {}}
      >
        <WalkthroughScreen
          steps={roleWalkthroughSteps[profile.role]}
          finishLabel="Finish walkthrough"
          testIdPrefix={`${profile.role}-walkthrough`}
          systemBarsTranslucent={Platform.OS === 'android'}
          onFinish={onFinishWalkthrough}
        />
      </Modal>
      <ThemedDialog
        visible={dialog !== null}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        onClose={() => setDialog(null)}
      />
    </SafeAreaView>
  );
}

function CustomerHome(props: {
  location: Coordinates;
  usingDemoLocation: boolean;
  catalog: any;
  messages: ChatMessage[];
  draft: string;
  setDraft: (value: string) => void;
  voiceReview: boolean;
  recording: boolean;
  voiceBusy: boolean;
  onLocation: () => void;
  onSend: () => void;
  onStartVoice: () => void;
  onStopVoice: () => void;
  addProduct: (product: ProductItem) => void;
  assistantBusy: boolean;
  shopName: (shopId: string) => string;
  shopInfo: (shopId: string) => any;
}) {
  const colors = useColors();
  const products = (props.catalog.data?.products ?? []) as ProductItem[];
  const [showAll, setShowAll] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const normalizedSearch = productSearch.trim().toLocaleLowerCase();
  const filteredProducts = normalizedSearch
    ? products.filter((product) => {
        const shop = props.shopInfo(product.shopId);
        const searchableText = [
          product.name,
          product.category,
          product.unit,
          props.shopName(product.shopId),
          shop?.address,
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase();
        return searchableText.includes(normalizedSearch);
      })
    : products;
  const visibleProducts = normalizedSearch || showAll ? filteredProducts : filteredProducts.slice(0, 6);
  const audioCopy = 'Voice notes use Gemini first and Groq as a fallback for transcription; audio is not saved by Saathi.';
  return (
    <>
      <Panel style={styles.heroPanel}>
        <View style={styles.heroIntroRow}>
          <View style={[styles.heroCircle, { backgroundColor: colors.secondary }]}>
            <Feather name="shopping-bag" size={34} color={colors.primary} />
          </View>
          <Eyebrow>NEARBY, IN YOUR WORDS</Eyebrow>
        </View>
        <Text style={[styles.heroTitle, { color: colors.foreground }]}>Your neighbourhood.{'\n'}Your groceries.{'\n'}Your Saathi.</Text>
        <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
          Tell Saathi what you need in Urdu, Roman Urdu, or English. Review nearby options and confirm your pickup basket.
        </Text>
        {props.usingDemoLocation ? (
          <Notice tone="warning">Share your location to discover approved shops near you.</Notice>
        ) : null}
        <AppButton label={props.usingDemoLocation ? 'Use my current location' : 'Refresh my location'} icon="navigation" onPress={props.onLocation} />
      </Panel>

      <Panel>
        <View style={styles.assistantHeadingRow}>
          <View style={styles.assistantHeadingText}>
            <SectionHeading title="Ask your Saathi" detail="Describe items and pack sizes; Saathi suggests nearby options. Chat and draft reset after 1 minute idle or a successful order." />
          </View>
          <View style={styles.assistantHeadingIcon}>
            <Feather name="zap" size={17} color={colors.primary} />
          </View>
        </View>
        {props.messages.length === 0 ? (
          <View style={[styles.assistantWelcome, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.bodyText, { color: colors.foreground }]}>“5kg atta aur 1kg cheeni chahiye”</Text>
            <Text style={[styles.smallText, { color: colors.mutedForeground }]}>Start with one item or a whole list.</Text>
          </View>
        ) : null}
        {props.messages.map((message, index) => (
          <View key={`${index}-${message.role}`} style={[message.role === 'user' ? styles.userMessage : styles.assistantMessage, message.products?.length ? styles.assistantProductsMessage : null]}>
            <View style={[
              styles.messageBubble,
              message.products?.length ? styles.assistantProductsBubble : null,
              {
                backgroundColor: message.role === 'user' ? colors.secondary : colors.card,
                borderColor: colors.border,
                alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
              },
            ]}>
              <Text style={[styles.bodyText, { color: colors.foreground }]}>{message.text}</Text>
              {message.products?.map((product) => (
                <View key={product.id} style={[styles.assistantProductCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.productName, styles.assistantProductText, { color: colors.foreground }]}>{product.name}</Text>
                  <Text style={[styles.smallText, styles.assistantProductText, { color: colors.mutedForeground }]}>
                    {product.unit} · {props.shopName(product.shopId)} · {product.stock} left
                  </Text>
                  {props.shopInfo(product.shopId)?.address ? (
                    <Text style={[styles.smallText, styles.assistantProductText, { color: colors.mutedForeground }]}>
                      {props.shopInfo(product.shopId)?.address}
                    </Text>
                  ) : null}
                  {!props.shopInfo(product.shopId)?.isDemo && props.shopInfo(product.shopId)?.contact ? (
                    <Pressable
                      accessibilityRole="link"
                      onPress={() => { void Linking.openURL(`tel:${props.shopInfo(product.shopId)?.contact}`); }}
                      style={styles.assistantProductContact}
                    >
                      <Feather name="phone" size={12} color={colors.primary} />
                      <Text style={[styles.smallText, styles.assistantProductText, { color: colors.primary, fontWeight: '700' }]}>
                        {props.shopInfo(product.shopId)?.contact}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={[styles.smallText, styles.assistantProductText, { color: colors.mutedForeground }]}>
                      Demo listing · not a real shop
                    </Text>
                  )}
                  <View style={styles.assistantProductPurchase}>
                    <Text style={[styles.priceText, styles.assistantProductPrice, { color: colors.primary }]}>
                      PKR {product.price.toLocaleString()}
                    </Text>
                    <AppButton label="Add" icon="plus" compact onPress={() => props.addProduct(product)} disabled={product.stock < 1} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}
        {props.voiceReview ? <Notice tone="success">Review this transcript, edit if needed, then tap send. {audioCopy}</Notice> : null}
        <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Field
            label="Your request"
            value={props.draft}
            onChangeText={props.setDraft}
            placeholder="Tell me what you need…"
            multiline
            style={styles.composerInput}
          />
          <View style={styles.composerActions}>
            <AppButton
              label={props.recording ? 'Stop & transcribe' : props.voiceBusy ? 'Transcribing…' : 'Voice note'}
              icon={props.recording ? 'square' : 'mic'}
              variant="quiet"
              compact
              loading={props.voiceBusy && !props.recording}
              onPress={props.recording ? props.onStopVoice : props.onStartVoice}
              disabled={props.voiceBusy}
            />
            <AppButton
              label="Send"
              icon="arrow-up-right"
              compact
              loading={props.assistantBusy}
              disabled={!props.draft.trim()}
              onPress={props.onSend}
            />
          </View>
        </View>
        <Text style={[styles.smallText, { color: colors.mutedForeground }]}>{audioCopy}</Text>
      </Panel>

      <Panel>
        <View style={styles.rowBetween}>
          <SectionHeading
            title="In your area"
            detail={
              props.catalog.isLoading
                ? 'Finding nearby stock…'
                : normalizedSearch
                  ? `${filteredProducts.length} matching product${filteredProducts.length === 1 ? '' : 's'}`
                  : `${products.length} available product${products.length === 1 ? '' : 's'} · 12 km search`
            }
          />
          {props.catalog.isFetching ? <Feather name="refresh-cw" size={15} color={colors.mutedForeground} /> : null}
        </View>
        <Field
          label="Search nearby products"
          value={productSearch}
          onChangeText={setProductSearch}
          placeholder="Search by product, size, or shop"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {props.catalog.error ? <Notice tone="warning">{errorMessage(props.catalog.error, 'Could not load shops right now.')}</Notice> : null}
        {visibleProducts.map((product) => (
          <View key={product.id} style={[styles.productCard, { borderColor: colors.border }]}>
            <View style={[styles.productIcon, { backgroundColor: colors.secondary }]}>
              <Feather name="package" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[styles.productName, { color: colors.foreground }]}>{product.name}</Text>
              <Text style={[styles.smallText, { color: colors.mutedForeground }]}>{product.unit} · {props.shopName(product.shopId)}</Text>
              <Text style={[styles.smallText, { color: colors.mutedForeground }]}>{props.shopInfo(product.shopId)?.address}</Text>
              {!props.shopInfo(product.shopId)?.isDemo ? (
                <Pressable onPress={() => Linking.openURL(`tel:${props.shopInfo(product.shopId)?.contact}`)}>
                  <Text style={[styles.smallText, { color: colors.primary, fontWeight: '700' }]}>Call {props.shopInfo(product.shopId)?.contact}</Text>
                </Pressable>
              ) : <Text style={[styles.smallText, { color: colors.mutedForeground }]}>Demo listing · not a real shop</Text>}
              <Text style={[styles.priceText, { color: colors.primary }]}>PKR {product.price.toLocaleString()} · {product.stock} in stock</Text>
            </View>
            <AppButton label="Add" icon="plus" compact onPress={() => props.addProduct(product)} disabled={product.stock < 1} />
          </View>
        ))}
        {!props.catalog.isLoading && filteredProducts.length === 0 ? (
          <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
            {normalizedSearch
              ? 'No nearby products match that search. Try another product, size, or shop.'
              : 'No approved shops are listed nearby yet. Try another location later.'}
          </Text>
        ) : null}
        {!normalizedSearch && filteredProducts.length > 6 ? (
          <AppButton label={showAll ? 'Show fewer' : 'See all products'} variant="outline" compact onPress={() => setShowAll(!showAll)} />
        ) : null}
      </Panel>

    </>
  );
}

function OrdersView({
  orders,
  loading,
  role,
  history,
  busyOrderActions,
  lastOrder,
  shownCode,
  codeForOrder,
  codeLoadingForOrder,
  onShowCode,
  onDirections,
  onStatus,
}: {
  orders: any[];
  loading: boolean;
  role: Role;
  history: boolean;
  busyOrderActions: Record<string, boolean>;
  lastOrder: { id: string } | null;
  shownCode: string;
  codeForOrder: string;
  codeLoadingForOrder: string;
  onShowCode: (id: string) => void;
  onDirections: (lat: number | null, lng: number | null) => void;
  onStatus: (id: string, status: 'accepted' | 'ready' | 'completed' | 'cancelled', code?: string) => void;
}) {
  const colors = useColors();
  const [pickupCodes, setPickupCodes] = useState<Record<string, string>>({});
  const visibleLastOrder = !history && lastOrder && orders.some((order) => order.id === lastOrder.id)
    ? lastOrder
    : null;
  if (loading) return <Panel><Text style={[styles.bodyText, { color: colors.mutedForeground }]}>Loading orders…</Text></Panel>;
  if (orders.length === 0) return (
    <Panel>
      <SectionHeading
        title={history ? 'No order history yet' : 'Nothing here yet'}
        detail={
          history
            ? 'Completed and cancelled pickups will appear here.'
            : role === 'merchant'
              ? 'Incoming customer pickups will appear here.'
              : 'Your active pickup orders will stay here.'
        }
      />
      <Feather name={history ? 'archive' : 'clipboard'} size={25} color={colors.primary} />
    </Panel>
  );
  return (
    <>
      {visibleLastOrder ? (
        <Panel style={{ borderColor: colors.primary }}>
          <Eyebrow>ORDER CONFIRMED</Eyebrow>
          <SectionHeading title="Your pickup is reserved" detail="Tap Show code on this order when you’re ready to collect it." />
          <Text style={[styles.smallText, { color: colors.mutedForeground }]}>Pay at pickup. Payment status is not processed in-app.</Text>
        </Panel>
      ) : null}
      {orders.map((order) => {
        const next = order.status === 'pending' ? 'accepted' : order.status === 'accepted' ? 'ready' : order.status === 'ready' ? 'completed' : null;
        const nextActionBusy = next ? busyOrderActions[`${order.id}:${next}`] === true : false;
        const cancelActionBusy = busyOrderActions[`${order.id}:cancelled`] === true;
        const codeVisible = !history && codeForOrder === order.id && Boolean(shownCode);
        const codeLoading = codeLoadingForOrder === order.id;
        const showCustomerActions = role === 'customer' && !history && !['completed', 'cancelled'].includes(order.status);
        return (
          <Panel key={order.id}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Eyebrow>{String(order.status).replace('_', ' ')}</Eyebrow>
                <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: 18 }]}>{order.shopName}</Text>
              </View>
              <Text style={[styles.priceText, { color: colors.primary }]}>PKR {Number(order.total).toLocaleString()}</Text>
            </View>
            <Text style={[styles.smallText, { color: colors.mutedForeground }]}>{order.items?.map((item: any) => `${item.quantity} × ${item.name}`).join('  ·  ')}</Text>
            {order.shopAddress ? <Text style={[styles.smallText, { color: colors.mutedForeground }]}>{order.shopAddress}</Text> : null}
            {showCustomerActions || (role === 'merchant' && Boolean(next)) ? (
            <View style={styles.row}>
              {showCustomerActions ? (
                <>
                <AppButton label="Directions" icon="navigation" compact variant="outline" onPress={() => onDirections(order.shopLatitude, order.shopLongitude)} />
                <AppButton
                  label={codeVisible ? 'Hide code' : codeLoading ? 'Loading…' : 'Show code'}
                  icon={codeVisible ? 'eye-off' : 'key'}
                  compact
                  variant="quiet"
                  onPress={() => onShowCode(order.id)}
                  loading={codeLoading}
                />
                {order.status === 'pending' ? (
                <AppButton
                  label="Cancel"
                  icon="x"
                  compact
                  variant="outline"
                  onPress={() => onStatus(order.id, 'cancelled')}
                  loading={cancelActionBusy}
                />
              ) : null}
                </>
              ) : null}
              {role === 'merchant' && next ? (
                next === 'completed' ? (
                  <View style={styles.orderActionRow}>
                    <Field
                      label="Pickup code"
                      value={pickupCodes[order.id] ?? ''}
                      onChangeText={(value) => setPickupCodes((prev) => ({ ...prev, [order.id]: value.replace(/\D/g, '').slice(0, 6) }))}
                      keyboardType="number-pad"
                      maxLength={6}
                      placeholder="6 digits"
                      containerStyle={styles.orderActionCell}
                    />
                    <View style={styles.orderActionCell}>
                      <AppButton
                        label={nextActionBusy ? 'Completing…' : 'Complete'}
                        compact
                        onPress={() => onStatus(order.id, 'completed', pickupCodes[order.id])}
                        loading={nextActionBusy}
                        disabled={(pickupCodes[order.id] ?? '').length !== 6}
                      />
                    </View>
                  </View>
                ) : (
                  <View style={styles.orderActionRow}>
                    <View style={styles.orderActionCell}>
                      <AppButton
                        label={nextActionBusy ? (next === 'accepted' ? 'Accepting…' : 'Marking ready…') : (next === 'accepted' ? 'Accept order' : 'Mark ready')}
                        icon="check"
                        compact
                        onPress={() => onStatus(order.id, next)}
                        loading={nextActionBusy}
                      />
                    </View>
                    {['pending', 'accepted'].includes(order.status) ? (
                      <View style={styles.orderActionCell}>
                        <AppButton
                          label={cancelActionBusy ? 'Cancelling…' : 'Cancel'}
                          compact
                          variant="outline"
                          onPress={() => onStatus(order.id, 'cancelled')}
                          loading={cancelActionBusy}
                        />
                      </View>
                    ) : null}
                  </View>
                )
              ) : null}
            </View>
            ) : null}
            {role === 'customer' && codeVisible ? (
              <View style={[styles.orderPickupCode, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <View style={styles.orderPickupCodeInfo}>
                  <Eyebrow>PICKUP CODE</Eyebrow>
                  <Text style={[styles.smallText, { color: colors.mutedForeground }]}>For this order only</Text>
                </View>
                <Text style={[styles.pickupCode, styles.orderPickupCodeValue, { color: colors.primary }]}>{shownCode}</Text>
              </View>
            ) : null}
          </Panel>
        );
      })}
    </>
  );
}

const orderStatusLabels: Record<OrderStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  ready: 'Ready for pickup',
  completed: 'Completed',
};

function NotificationsView({
  notifications,
  unreadCount,
  role,
  loading,
  error,
  markingNotificationId,
  markingAllNotifications,
  pushAlertsEnabled,
  pushAlertsBusy,
  pushAlertsError,
  pushSupported,
  onRetry,
  onMarkRead,
  onMarkAllRead,
  onTogglePushAlerts,
}: {
  notifications: OrderStatusNotification[];
  unreadCount: number;
  role: Role;
  loading: boolean;
  error: string;
  markingNotificationId: string;
  markingAllNotifications: boolean;
  pushAlertsEnabled: boolean;
  pushAlertsBusy: boolean;
  pushAlertsError: string;
  pushSupported: boolean;
  onRetry: () => void;
  onMarkRead: (notificationId: string) => void;
  onMarkAllRead: () => void;
  onTogglePushAlerts: () => void;
}) {
  const colors = useColors();
  const phoneAlertsCard = (
    <Panel>
      <SectionHeading
        title="Phone alerts"
        detail={pushAlertsEnabled
          ? 'This device is registered for order updates.'
          : pushSupported
            ? 'Get order updates when Dukaan Saathi is closed.'
            : Platform.OS === 'web'
              ? 'Open Dukaan Saathi in a mobile app to enable alerts.'
              : 'Push alerts require a development build and are unavailable in Expo Go.'}
      />
      {pushAlertsError ? <Notice tone="warning">{pushAlertsError}</Notice> : null}
      {!pushAlertsEnabled && pushSupported ? (
        <Text style={[styles.smallText, { color: colors.mutedForeground }]}>
          Remote alerts need an Expo project ID and a push-enabled development build. Expo Go on Android cannot receive them.
        </Text>
      ) : null}
      <AppButton
        label={pushAlertsEnabled ? 'Turn off phone alerts' : 'Enable phone alerts'}
        icon={pushAlertsEnabled ? 'bell-off' : 'bell'}
        testID={pushAlertsEnabled ? 'disable-phone-alerts' : 'enable-phone-alerts'}
        onPress={onTogglePushAlerts}
        loading={pushAlertsBusy}
        disabled={!pushSupported && !pushAlertsEnabled}
      />
    </Panel>
  );

  if (loading) {
    return (
      <>
        {phoneAlertsCard}
        <Panel>
          <View style={styles.row}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>Loading notifications…</Text>
          </View>
        </Panel>
      </>
    );
  }

  if (error && notifications.length === 0) {
    return (
      <>
        {phoneAlertsCard}
        <Panel>
          <Notice tone="warning">{error}</Notice>
          <AppButton label="Try again" icon="refresh-cw" compact onPress={onRetry} />
        </Panel>
      </>
    );
  }

  if (notifications.length === 0) {
    return (
      <>
        {phoneAlertsCard}
        <Panel>
          <View style={styles.row}>
            <Feather name="bell" size={20} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: 18 }]}>You’re all caught up</Text>
          </View>
          <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
            {role === 'merchant'
              ? 'New customer orders for your shop will appear here.'
              : 'Order updates from your local shops will appear here.'}
          </Text>
        </Panel>
      </>
    );
  }

  return (
    <>
      {phoneAlertsCard}
      {error ? <Notice tone="warning">{error}</Notice> : null}
      <Panel style={{ paddingHorizontal: 12, paddingVertical: 10, gap: 0 }}>
        <View
          style={{
            width: '100%',
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <View style={{ flex: 1, minWidth: 120, gap: 2 }}>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: 18, lineHeight: 22 }]}>
              {role === 'merchant' ? 'Shop notifications' : 'Order updates'}
            </Text>
            <Text style={[styles.smallText, { color: colors.mutedForeground, fontSize: 10, lineHeight: 14 }]}>
              {unreadCount === 0 ? 'All notifications are read.' : `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}.`}
            </Text>
          </View>
          {unreadCount > 0 ? (
            <View style={{ marginLeft: 'auto' }}>
              <AppButton
                label="Mark all as read"
                icon="check"
                compact
                variant="quiet"
                testID="mark-all-notifications-read"
                onPress={onMarkAllRead}
                loading={markingAllNotifications}
                disabled={Boolean(markingNotificationId)}
              />
            </View>
          ) : null}
        </View>
      </Panel>
      {notifications.map((notification) => {
        const transition = role === 'merchant' &&
          notification.status === 'pending' &&
          notification.previousStatus === null
          ? 'New customer order received.'
          : notification.previousStatus
            ? `${orderStatusLabels[notification.previousStatus]} → ${orderStatusLabels[notification.status]}`
            : `Order placed · ${orderStatusLabels[notification.status]}`;
        const time = new Date(notification.createdAt).toLocaleString();
        const isMarking = markingNotificationId === notification.id;
        return (
          <Panel
            key={notification.id}
            style={!notification.isRead ? { borderColor: colors.primary } : undefined}
          >
            <View style={styles.rowBetween}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[styles.productName, { color: colors.foreground }]}>{notification.shopName}</Text>
                <Text style={[styles.smallText, { color: colors.mutedForeground }]}>
                  Order #{notification.orderId.slice(0, 8)}
                </Text>
              </View>
              <View style={[styles.notificationStatus, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.notificationStatusText, { color: colors.primary }]}>
                  {orderStatusLabels[notification.status]}
                </Text>
              </View>
            </View>
            <Text style={[styles.bodyText, { color: colors.foreground }]}>{transition}</Text>
            <View style={styles.rowBetween}>
              <Text style={[styles.smallText, { color: colors.mutedForeground }]}>{time}</Text>
              {!notification.isRead ? (
                <AppButton
                  label="Mark as read"
                  icon="check"
                  compact
                  variant="quiet"
                  testID={`mark-notification-read-${notification.id}`}
                  onPress={() => onMarkRead(notification.id)}
                  loading={isMarking}
                  disabled={markingAllNotifications || (Boolean(markingNotificationId) && !isMarking)}
                />
              ) : (
                <Text style={[styles.smallText, { color: colors.mutedForeground }]}>Read</Text>
              )}
            </View>
          </Panel>
        );
      })}
    </>
  );
}

function MerchantShopSettings({
  onLocation,
}: {
  onLocation: () => Promise<Coordinates | null>;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const shopQuery = useGetDukaanMerchantShop({
    query: {
      queryKey: getGetDukaanMerchantShopQueryKey(),
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  });
  const saveShop = useUpdateDukaanMerchantShop();
  const [draft, setDraft] = useState<{ name: string; address: string } | null>(null);
  const [locationOverride, setLocationOverride] = useState<Coordinates | null>(null);
  const [capturingLocation, setCapturingLocation] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'success' | 'warning'>('success');
  const shop = shopQuery.data;
  const form = draft ?? { name: shop?.name ?? '', address: shop?.address ?? '' };

  const updateDraft = (changes: Partial<{ name: string; address: string }>) => {
    setDraft((current) => ({
      name: current?.name ?? shop?.name ?? '',
      address: current?.address ?? shop?.address ?? '',
      ...current,
      ...changes,
    }));
    setMessage('');
  };
  const captureLocation = async () => {
    setCapturingLocation(true);
    try {
      const coordinates = await onLocation();
      if (coordinates) {
        setLocationOverride(coordinates);
        setMessageTone('success');
        setMessage('New coordinates captured. Save shop details to apply them.');
      }
    } finally {
      setCapturingLocation(false);
    }
  };
  const saveDetails = async () => {
    if (!shop) return;
    const name = form.name.trim().replace(/\s+/g, ' ');
    const address = form.address.trim();
    if (name.length < 2 || name.length > 100 || address.length < 5 || address.length > 240) {
      setMessageTone('warning');
      setMessage('Enter a shop name (2–100 characters) and address (5–240 characters).');
      return;
    }
    const coordinates = locationOverride ?? { latitude: shop.latitude, longitude: shop.longitude };
    setMessage('');
    try {
      await saveShop.mutateAsync({
        data: { name, address, latitude: coordinates.latitude, longitude: coordinates.longitude },
      });
      setDraft(null);
      setLocationOverride(null);
      setMessageTone('success');
      setMessage('Shop details updated.');
      await queryClient.invalidateQueries();
    } catch (reason) {
      setMessageTone('warning');
      setMessage(errorMessage(reason, 'Could not update the shop details. Try again.'));
    }
  };

  if (shopQuery.isLoading && !shop) {
    return (
      <View style={styles.profileSubsection}>
        <View style={styles.row}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>Loading your shop details…</Text>
        </View>
      </View>
    );
  }
  if (shopQuery.isError) {
    return (
      <View style={styles.profileSubsection}>
        <SectionHeading title="Shop details" detail="Update your listing and map location." />
        <Notice tone="warning">{errorMessage(shopQuery.error, 'Shop details could not be loaded.')}</Notice>
        <AppButton label="Try again" icon="refresh-cw" compact onPress={() => { void shopQuery.refetch(); }} />
      </View>
    );
  }
  if (!shop) {
    return <View style={styles.profileSubsection}><Notice tone="warning">Your shop details are not available right now.</Notice></View>;
  }

  const displayCoordinates = locationOverride ?? { latitude: shop.latitude, longitude: shop.longitude };
  const hasChanges = form.name.trim() !== shop.name ||
    form.address.trim() !== shop.address ||
    locationOverride !== null;

  return (
    <View style={styles.profileSubsection}>
      <SectionHeading title="Shop details" detail="Update the name, public address, and map pin for your listing." />
      <Field
        label="Shop name"
        value={form.name}
        onChangeText={(name) => updateDraft({ name })}
        placeholder="e.g. Rehmat General Store"
        maxLength={100}
        testID="merchant-shop-name"
      />
      <Field
        label="Public shop address"
        value={form.address}
        onChangeText={(address) => updateDraft({ address })}
        placeholder="Street, neighbourhood, city"
        multiline
        maxLength={240}
        testID="merchant-shop-address"
      />
      <View style={[styles.coordinateCard, { backgroundColor: colors.secondary }]}>
        <Feather name="map-pin" color={colors.primary} size={16} />
        <Text style={[styles.smallText, { color: colors.foreground, flex: 1 }]}>
          {displayCoordinates.latitude.toFixed(5)}, {displayCoordinates.longitude.toFixed(5)}
          {locationOverride ? ' · new location' : ' · saved'}
        </Text>
        <AppButton
          label="Share location again"
          icon="navigation"
          compact
          variant="outline"
          onPress={() => { void captureLocation(); }}
          loading={capturingLocation}
          testID="merchant-share-location"
        />
      </View>
      <Text style={[styles.smallText, { color: colors.mutedForeground }]}>
        Allow location access to capture your current shop coordinates, then save to update the map pin.
      </Text>
      {message ? <Notice tone={messageTone}>{message}</Notice> : null}
      <AppButton
        label="Save shop details"
        icon="check"
        onPress={() => { void saveDetails(); }}
        loading={saveShop.isPending}
        disabled={!hasChanges || capturingLocation}
        testID="save-merchant-shop-details"
      />
      {shop.status !== 'approved' ? (
        <Text style={[styles.smallText, { color: colors.mutedForeground }]}>
          Updating details does not change the shop’s current review status.
        </Text>
      ) : null}
    </View>
  );
}

function MerchantView(props: {
  profile: Profile;
  location: Coordinates;
  usingDemoLocation: boolean;
  shopForm: { name: string; address: string; contact: string };
  setShopForm: React.Dispatch<React.SetStateAction<{ name: string; address: string; contact: string }>>;
  onLocation: () => Promise<Coordinates | null>;
  onRegister: () => void;
  creatingShop: boolean;
  products?: ProductItem[];
  productsLoading: boolean;
  form: { name: string; category: string; unit: string; price: string; stock: string };
  setForm: React.Dispatch<React.SetStateAction<{ name: string; category: string; unit: string; price: string; stock: string }>>;
  editingId: string;
  onSaveProduct: () => void;
  onEditProduct: (product: ProductItem) => void;
  onDeleteProduct: (id: string) => void;
  onClearForm: () => void;
  savingProduct: boolean;
  instruction: string;
  setInstruction: (value: string) => void;
  onAskAssistant: () => void;
  assistantBusy: boolean;
  assistantReply: string;
  assistantError: string;
  recording: boolean;
  voiceBusy: boolean;
  voiceReview: boolean;
  onStartVoice: () => void;
  onStopVoice: () => void;
  preview: any;
  confirmBusy: boolean;
  onConfirmPreview: () => void;
  onCancelPreview: () => void;
}) {
  const colors = useColors();
  const isNarrow = useWindowDimensions().width < 540;
  if (!props.profile.shopStatus) {
    return (
      <Panel>
        <SectionHeading title="Register your neighbourhood shop" detail="Your listing stays private until an admin reviews it." />
        <Field label="Shop name" value={props.shopForm.name} onChangeText={(name) => props.setShopForm((prev) => ({ ...prev, name }))} placeholder="e.g. Rehmat General Store" />
        <Field label="Public shop address" value={props.shopForm.address} onChangeText={(address) => props.setShopForm((prev) => ({ ...prev, address }))} placeholder="Street, neighbourhood, city" multiline />
        <Field label="Shop contact mobile" value={props.shopForm.contact} onChangeText={(contact) => props.setShopForm((prev) => ({ ...prev, contact }))} placeholder="03XXXXXXXXX" keyboardType="phone-pad" />
        <Notice>Your personal email and CNIC are never shown to customers. Only shop name, address, and this public contact are listed.</Notice>
        <View style={[styles.coordinateCard, { backgroundColor: colors.secondary }]}>
          <Feather name="map-pin" color={colors.primary} size={16} />
          <Text style={[styles.smallText, { color: colors.foreground, flex: 1 }]}>
            {props.usingDemoLocation ? 'Location not captured yet' : `${props.location.latitude.toFixed(5)}, ${props.location.longitude.toFixed(5)}`}
          </Text>
          <AppButton label="Get location" icon="navigation" compact variant="outline" onPress={() => { void props.onLocation(); }} />
        </View>
        <Text style={[styles.smallText, { color: colors.mutedForeground }]}>Location permission is requested only when you tap the button. Coordinates are used to show nearby shops and directions.</Text>
        <AppButton label="Submit for review" onPress={props.onRegister} loading={props.creatingShop} disabled={props.usingDemoLocation} />
      </Panel>
    );
  }
  if (props.profile.shopStatus !== 'approved') {
    return (
      <>
        <Panel>
          <View style={styles.statusHeaderRow}>
            <View style={[styles.statusIcon, { backgroundColor: colors.secondary }]}>
              <Feather name={props.profile.shopStatus === 'rejected' ? 'x-circle' : 'clock'} size={21} color={colors.primary} />
            </View>
            <View style={styles.statusTextGroup}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {props.profile.shopStatus === 'rejected' ? 'Shop application was rejected' : 'Shop application in review'}
              </Text>
              <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>Inventory editing and ordering unlock after admin approval.</Text>
            </View>
          </View>
          <Notice tone="warning">Current status: {props.profile.shopStatus}</Notice>
        </Panel>
      </>
    );
  }
  const preview = props.preview;
  return (
    <>
      <Panel>
        <SectionHeading title="Ask the inventory assistant" detail="Add, update, or remove products in English, Urdu, or Roman Urdu. Nothing is saved without your confirmation." />
        <Field label="Inventory instruction" value={props.instruction} onChangeText={props.setInstruction} placeholder="Add 12 packs of tea, 250 g each, at PKR 450 per pack" multiline />
        {props.voiceReview ? (
          <Notice tone="success">Voice note transcribed. Review the text above, correct any product quantities or prices, then tap Prepare change.</Notice>
        ) : null}
        <View style={styles.merchantAssistantActions}>
          <View style={styles.merchantVoiceButton}>
            <AppButton
              label={props.recording ? 'Stop note' : props.voiceBusy ? 'Processing…' : 'Voice note'}
              icon={props.recording ? 'square' : 'mic'}
              variant="quiet"
              compact
              onPress={props.recording ? props.onStopVoice : props.onStartVoice}
              loading={props.voiceBusy && !props.recording}
              disabled={props.voiceBusy || props.assistantBusy || props.confirmBusy}
              testID="merchant-inventory-voice"
            />
          </View>
          <View style={styles.merchantPrepareButton}>
            <AppButton
              label="Prepare change"
              compact
              onPress={props.onAskAssistant}
              loading={props.assistantBusy}
              disabled={!props.instruction.trim() || props.voiceBusy || props.recording || props.confirmBusy}
              testID="merchant-prepare-change"
            />
          </View>
        </View>
        <Text style={[styles.smallText, { color: colors.mutedForeground }]}>Voice notes use Gemini first and Groq as a fallback. Review your transcript before preparing the change.</Text>
        {props.assistantError ? <Notice tone="warning">{props.assistantError}</Notice> : null}
        {props.assistantReply ? (
          <Notice tone={preview ? 'warning' : 'success'}>{props.assistantReply}</Notice>
        ) : null}
        {preview && preview.action !== 'clarify' ? (
          <View style={[styles.previewCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Eyebrow>REVIEW BEFORE SAVING · {preview.action.toUpperCase()}</Eyebrow>
            <Text style={[styles.productName, { color: colors.foreground }]}>{preview.name} · {preview.unit}</Text>
            <Text style={[styles.bodyText, { color: colors.foreground }]}>Category: {preview.category} · PKR {preview.price} · stock {preview.stock}</Text>
            <Text style={[styles.smallText, { color: colors.mutedForeground }]}>
              {preview.action === 'delete'
                ? 'This will remove the product from your active listings.'
                : 'Check every field. The proposed change has not been saved yet.'}
            </Text>
            <View style={styles.row}>
              <AppButton
                label={preview.action === 'create' ? 'Confirm add product' : preview.action === 'update' ? 'Confirm update' : 'Confirm remove'}
                icon="check"
                variant={preview.action === 'delete' ? 'danger' : 'primary'}
                onPress={props.onConfirmPreview}
                loading={props.confirmBusy}
                testID="merchant-confirm-inventory-change"
              />
              <AppButton label="Cancel" variant="outline" onPress={props.onCancelPreview} disabled={props.confirmBusy} testID="merchant-cancel-inventory-change" />
            </View>
          </View>
        ) : null}
      </Panel>
      <Panel>
        <SectionHeading title={props.editingId ? 'Edit product' : 'Add a product'} detail="Price in whole PKR; stock is the available quantity." />
        <Field label="Product name" value={props.form.name} onChangeText={(name) => props.setForm((prev) => ({ ...prev, name }))} placeholder="Fresh atta" />
        <View style={[styles.formFieldsRow, isNarrow && styles.formFieldsColumn]}>
          <Field label="Category" value={props.form.category} onChangeText={(category) => props.setForm((prev) => ({ ...prev, category }))} placeholder="Pantry" containerStyle={isNarrow ? undefined : { flex: 1, minWidth: 0 }} />
          <Field label="Pack size" value={props.form.unit} onChangeText={(unit) => props.setForm((prev) => ({ ...prev, unit }))} placeholder="1 kg bag" containerStyle={isNarrow ? undefined : { flex: 1, minWidth: 0 }} />
        </View>
        <View style={[styles.formFieldsRow, isNarrow && styles.formFieldsColumn]}>
          <Field label="Price (PKR)" value={props.form.price} onChangeText={(price) => props.setForm((prev) => ({ ...prev, price }))} keyboardType="number-pad" placeholder="250" containerStyle={isNarrow ? undefined : { flex: 1, minWidth: 0 }} />
          <Field label="Stock" value={props.form.stock} onChangeText={(stock) => props.setForm((prev) => ({ ...prev, stock }))} keyboardType="number-pad" placeholder="12" containerStyle={isNarrow ? undefined : { flex: 1, minWidth: 0 }} />
        </View>
        <View style={styles.row}>
          <AppButton label={props.editingId ? 'Save changes' : 'Add product'} icon="check" onPress={props.onSaveProduct} loading={props.savingProduct} />
          {props.editingId ? <AppButton label="Clear" variant="outline" onPress={props.onClearForm} /> : null}
        </View>
      </Panel>
      <Panel>
        <SectionHeading title="Your inventory" detail={props.productsLoading ? 'Loading products…' : `${props.products?.length ?? 0} product listings`} />
        {props.products?.map((product) => (
          <View key={product.id} style={[styles.productCard, { borderColor: colors.border }]}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[styles.productName, { color: colors.foreground }]}>{product.name} · {product.unit}</Text>
              <Text style={[styles.smallText, { color: colors.mutedForeground }]}>PKR {product.price} · stock {product.stock} · {product.active ? 'listed' : 'hidden'}</Text>
            </View>
            <AppButton label="Edit" compact variant="outline" onPress={() => props.onEditProduct(product)} />
            {product.active ? <Pressable onPress={() => props.onDeleteProduct(product.id)}><Feather name="trash-2" size={17} color={colors.destructive} /></Pressable> : null}
          </View>
        ))}
      </Panel>
    </>
  );
}

const emptyAdminOrderFilterDraft = (): AdminOrderFilterDraft => ({
  startDate: '',
  endDate: '',
  shopId: '',
  productName: '',
  status: '',
  minAmount: '',
  maxAmount: '',
});

const adminOrderStatusLabels: Record<AdminOrderStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  ready: 'Ready for pickup',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const adminOrderStatusOptions: { value: AdminOrderStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'ready', label: 'Ready for pickup' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

function isValidAdminDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function AdminView({
  overview,
  loading,
  message,
  onReview,
  reviewBusy,
}: {
  overview: any;
  loading: boolean;
  message: string;
  onReview: (shopId: string, status: 'approved' | 'rejected') => void;
  reviewBusy: boolean;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { width: viewportWidth } = useWindowDimensions();
  const stackAdminMetrics = viewportWidth < 380;
  const [activeAdminTab, setActiveAdminTab] = useState<'overview' | 'users' | 'profileRequests' | 'activity'>('overview');
  const [userPageOffsets, setUserPageOffsets] = useState<number[]>([0]);
  const [filterDraft, setFilterDraft] = useState<AdminOrderFilterDraft>(emptyAdminOrderFilterDraft);
  const [appliedFilters, setAppliedFilters] = useState<AdminOrderFilters>({});
  const [filterError, setFilterError] = useState('');
  const [userSearchDraft, setUserSearchDraft] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const userOffset = userPageOffsets[userPageOffsets.length - 1] ?? 0;
  const userQueryParams = (offset: number) => ({ ...(userSearch ? { search: userSearch } : {}), offset });
  const userFilters = userQueryParams(userOffset);
  const adminOrdersQuery = useGetDukaanAdminOrders(appliedFilters, {
    query: {
      queryKey: getGetDukaanAdminOrdersQueryKey(appliedFilters),
      enabled: activeAdminTab === 'overview',
      staleTime: 0,
      refetchOnWindowFocus: true,
    },
  });
  const adminUsersQuery = useGetDukaanAdminUsers(userFilters, {
    query: {
      queryKey: getGetDukaanAdminUsersQueryKey(userFilters),
      enabled: activeAdminTab === 'users',
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  });

  if (loading) return <Panel><Text style={[styles.bodyText, { color: colors.mutedForeground }]}>Loading admin overview…</Text></Panel>;
  if (!overview) return <Panel><Notice tone="warning">Admin access is not configured for this account.</Notice></Panel>;

  const stats = [
    ['Customers', overview.customers],
    ['Merchants', overview.merchants],
    ['Pending shops', overview.pendingShops],
    ['Orders', overview.orders],
  ];
  const shopOptions = adminOrdersQuery.data?.shops ?? [];
  const matchingOrders = (adminOrdersQuery.data?.orders ?? []) as AdminOrderRow[];
  const cachedUserPages = userPageOffsets.map((offset) =>
    queryClient.getQueryData<AdminUsersPage>(getGetDukaanAdminUsersQueryKey(userQueryParams(offset))),
  );
  const matchingUsers = cachedUserPages.flatMap((page) => page?.users ?? []);
  const totalMatchingOrders = adminOrdersQuery.data?.totalCount ?? 0;
  const totalMatchingUsers = adminUsersQuery.data?.totalCount
    ?? cachedUserPages.find((page) => page !== undefined)?.totalCount
    ?? 0;
  const loadingMoreUsers =
    adminUsersQuery.isFetching && adminUsersQuery.data === undefined && matchingUsers.length > 0;

  const updateFilter = <K extends keyof AdminOrderFilterDraft>(key: K, value: AdminOrderFilterDraft[K]) => {
    setFilterDraft((current) => ({ ...current, [key]: value }));
  };
  const applyOrderFilters = () => {
    const startDate = filterDraft.startDate.trim();
    const endDate = filterDraft.endDate.trim();
    const productName = filterDraft.productName.trim();
    if (startDate && !isValidAdminDate(startDate)) {
      setFilterError('Enter the start date as a valid YYYY-MM-DD date.');
      return;
    }
    if (endDate && !isValidAdminDate(endDate)) {
      setFilterError('Enter the end date as a valid YYYY-MM-DD date.');
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      setFilterError('End date must be on or after start date.');
      return;
    }
    if (productName.length > 100) {
      setFilterError('Product name search must be 100 characters or fewer.');
      return;
    }
    const parseAmount = (value: string, label: string) => {
      if (!value.trim()) return undefined;
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000) {
        throw new Error(`${label} must be a valid non-negative amount.`);
      }
      return amount;
    };
    let minAmount: number | undefined;
    let maxAmount: number | undefined;
    try {
      minAmount = parseAmount(filterDraft.minAmount, 'Minimum amount');
      maxAmount = parseAmount(filterDraft.maxAmount, 'Maximum amount');
    } catch (reason) {
      setFilterError(reason instanceof Error ? reason.message : 'Enter a valid amount range.');
      return;
    }
    if (minAmount !== undefined && maxAmount !== undefined && minAmount > maxAmount) {
      setFilterError('Maximum amount must be at least the minimum amount.');
      return;
    }
    setFilterError('');
    setAppliedFilters({
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      ...(filterDraft.shopId ? { shopId: filterDraft.shopId } : {}),
      ...(productName ? { productName } : {}),
      ...(filterDraft.status ? { status: filterDraft.status } : {}),
      ...(minAmount !== undefined ? { minAmount } : {}),
      ...(maxAmount !== undefined ? { maxAmount } : {}),
    });
  };
  const clearOrderFilters = () => {
    setFilterDraft(emptyAdminOrderFilterDraft());
    setAppliedFilters({});
    setFilterError('');
  };
  const applyUserSearch = () => {
    setUserPageOffsets([0]);
    setUserSearch(userSearchDraft.trim().slice(0, 100));
  };
  const clearUserSearch = () => {
    setUserSearchDraft('');
    setUserSearch('');
    setUserPageOffsets([0]);
  };
  const loadMoreUsers = () => {
    const currentPageCount = adminUsersQuery.data?.users.length ?? 0;
    const nextOffset = userOffset + currentPageCount;
    if (!currentPageCount || nextOffset >= totalMatchingUsers) return;
    setUserPageOffsets((offsets) => (
      offsets[offsets.length - 1] === userOffset ? [...offsets, nextOffset] : offsets
    ));
  };

  return (
    <>
      <View style={styles.adminSubtabs}>
        {([
          { id: 'overview', label: 'Overview', icon: 'grid' },
          { id: 'users', label: 'User management', icon: 'users' },
          { id: 'profileRequests', label: 'Profile changes', icon: 'user-check' },
          { id: 'activity', label: 'Recent activity', icon: 'activity' },
        ] as const).map((tab) => {
          const selected = activeAdminTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={tab.label}
              testID={`admin-subtab-${tab.id}`}
              onPress={() => setActiveAdminTab(tab.id)}
              style={[
                styles.adminSubtab,
                {
                  backgroundColor: selected ? colors.primary : colors.card,
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}
            >
              <Feather name={tab.icon} size={14} color={selected ? colors.primaryForeground : colors.foreground} />
              <Text
                numberOfLines={2}
                style={[
                  styles.adminSubtabText,
                  { color: selected ? colors.primaryForeground : colors.foreground },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {activeAdminTab === 'overview' ? (
        <>
      <Panel>
        <SectionHeading title="Platform pulse" detail="System totals and recent operational activity. Personal details are excluded from audit logs." />
        <View style={styles.statsGrid}>
          {stats.map(([label, value]) => (
            <View key={String(label)} style={[styles.statCard, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.statNumber, { color: colors.primary }]}>{Number(value).toLocaleString()}</Text>
              <Text style={[styles.smallText, { color: colors.mutedForeground }]}>{label}</Text>
            </View>
          ))}
        </View>
        <Notice>Recorded order volume: PKR {Number(overview.volumePkr).toLocaleString()}. This is not payment settlement.</Notice>
      </Panel>

      <Panel>
        <SectionHeading title="Shop applications" detail={`${overview.pendingShopApplications?.length ?? 0} awaiting review`} />
        {message ? <Notice tone="success">{message}</Notice> : null}
        {overview.pendingShopApplications?.map((shop: any) => (
          <View key={shop.id} style={[styles.adminShop, { borderColor: colors.border }]}>
            <Text style={[styles.productName, { color: colors.foreground }]}>{shop.name}</Text>
            <Text style={[styles.smallText, { color: colors.mutedForeground }]}>{shop.address}</Text>
            <Text style={[styles.smallText, { color: colors.mutedForeground }]}>Owner: {shop.ownerName ?? '—'} · Shop contact: {shop.contact}</Text>
            <Text style={[styles.smallText, { color: colors.mutedForeground }]}>{shop.latitude.toFixed(4)}, {shop.longitude.toFixed(4)}</Text>
            <View style={styles.row}>
              <AppButton label="Approve" icon="check" compact onPress={() => onReview(shop.id, 'approved')} loading={reviewBusy} />
              <AppButton label="Reject" icon="x" compact variant="outline" onPress={() => onReview(shop.id, 'rejected')} disabled={reviewBusy} />
              <Pressable onPress={() => Linking.openURL(`https://www.google.com/maps?q=${shop.latitude},${shop.longitude}`)}>
                <Feather name="map" size={19} color={colors.primary} />
              </Pressable>
            </View>
          </View>
        ))}
        {(overview.pendingShopApplications?.length ?? 0) === 0 ? <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>No pending shop applications.</Text> : null}
      </Panel>

      <Panel>
        <SectionHeading
          title="Order filters"
          detail={Object.keys(appliedFilters).length === 0
            ? 'No filters applied. Showing all orders.'
            : 'Combine date, shop, product, status, and amount filters. Results and average update when you apply them.'}
        />
        <View style={styles.adminFilterRow}>
          <Field
            label="From date (YYYY-MM-DD)"
            value={filterDraft.startDate}
            onChangeText={(value) => updateFilter('startDate', value)}
            placeholder="2026-01-01"
            maxLength={10}
            testID="admin-order-start-date"
            containerStyle={styles.adminFilterField}
          />
          <Field
            label="To date (YYYY-MM-DD)"
            value={filterDraft.endDate}
            onChangeText={(value) => updateFilter('endDate', value)}
            placeholder="2026-12-31"
            maxLength={10}
            testID="admin-order-end-date"
            containerStyle={styles.adminFilterField}
          />
        </View>
        <Field
          label="Product name"
          value={filterDraft.productName}
          onChangeText={(value) => updateFilter('productName', value)}
          placeholder="Search orders by product"
          maxLength={100}
          testID="admin-order-product-filter"
        />
        <SearchableSelect
          label="Shop"
          value={filterDraft.shopId}
          options={[
            { value: '', label: 'All shops' },
            ...shopOptions.map((shop) => ({ value: shop.id, label: shop.name })),
          ]}
          onChange={(value) => updateFilter('shopId', value)}
          searchPlaceholder="Search shops"
          emptyMessage="No shops match that search."
          testID="admin-shop-filter"
        />
        {!adminOrdersQuery.isLoading && shopOptions.length === 0 ? (
          <Text style={[styles.smallText, { color: colors.mutedForeground }]}>No shops are available to filter.</Text>
        ) : null}
        <SearchableSelect
          label="Order status"
          value={filterDraft.status}
          options={adminOrderStatusOptions}
          onChange={(value) => updateFilter('status', value)}
          searchPlaceholder="Search statuses"
          emptyMessage="No order statuses match that search."
          testID="admin-status-filter"
        />
        <View style={styles.adminFilterRow}>
          <Field
            label="Minimum amount (PKR)"
            value={filterDraft.minAmount}
            onChangeText={(value) => updateFilter('minAmount', value)}
            placeholder="Any"
            keyboardType="decimal-pad"
            testID="admin-order-min-amount"
            containerStyle={styles.adminFilterField}
          />
          <Field
            label="Maximum amount (PKR)"
            value={filterDraft.maxAmount}
            onChangeText={(value) => updateFilter('maxAmount', value)}
            placeholder="Any"
            keyboardType="decimal-pad"
            testID="admin-order-max-amount"
            containerStyle={styles.adminFilterField}
          />
        </View>
        {filterError ? <Notice tone="warning">{filterError}</Notice> : null}
        <View style={styles.row}>
          <AppButton
            label="Apply filters"
            icon="filter"
            compact
            testID="apply-admin-order-filters"
            onPress={applyOrderFilters}
            loading={adminOrdersQuery.isFetching}
          />
          <AppButton label="Clear filters" icon="x" compact variant="outline" onPress={clearOrderFilters} />
        </View>
      </Panel>

      <Panel>
        <SectionHeading
          title="Filtered orders"
          detail={`${totalMatchingOrders.toLocaleString()} matching order${totalMatchingOrders === 1 ? '' : 's'}`}
        />
        {adminOrdersQuery.isLoading ? (
          <View style={styles.row}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>Loading filtered orders…</Text>
          </View>
        ) : adminOrdersQuery.isError ? (
          <>
            <Notice tone="warning">{errorMessage(adminOrdersQuery.error, 'Order data could not be loaded.')}</Notice>
            <AppButton label="Try again" icon="refresh-cw" compact onPress={() => { void adminOrdersQuery.refetch(); }} />
          </>
        ) : totalMatchingOrders === 0 ? (
          <View style={{ gap: 8 }}>
            <Text style={[styles.productName, { color: colors.foreground }]}>No orders match these filters.</Text>
            <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>Try a wider date range or clear the filters.</Text>
            <AppButton label="Clear filters" icon="x" compact variant="outline" onPress={clearOrderFilters} />
          </View>
        ) : (
          <>
            <View style={stackAdminMetrics ? styles.adminMetricStack : styles.adminMetricRow}>
              <View style={[styles.statCard, stackAdminMetrics ? styles.adminMetricStackCard : styles.adminMetricCard, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.statNumber, styles.adminMetricNumber, { color: colors.primary }]}>
                  PKR {Number(adminOrdersQuery.data?.averageAmount ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </Text>
                <Text style={[styles.smallText, { color: colors.mutedForeground }]}>Average order amount</Text>
              </View>
              <View style={[styles.statCard, stackAdminMetrics ? styles.adminMetricStackCard : styles.adminMetricCard, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.statNumber, styles.adminMetricNumber, { color: colors.primary }]}>{totalMatchingOrders.toLocaleString()}</Text>
                <Text style={[styles.smallText, { color: colors.mutedForeground }]}>Matching orders</Text>
              </View>
            </View>
            {totalMatchingOrders > matchingOrders.length ? (
              <Text style={[styles.smallText, { color: colors.mutedForeground }]}>
                Showing the {matchingOrders.length} newest matches; the average includes all {totalMatchingOrders} matching orders.
              </Text>
            ) : null}
            {matchingOrders.map((order) => (
              <View key={order.id} style={[styles.adminOrderRow, { borderColor: colors.border }]}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.productName, { color: colors.foreground }]}>{order.shopName}</Text>
                    <Text style={[styles.smallText, { color: colors.mutedForeground }]}>Order #{order.id.slice(0, 8)}</Text>
                  </View>
                  <Tag>{adminOrderStatusLabels[order.status]}</Tag>
                </View>
                <Text style={[styles.smallText, { color: colors.foreground }]} numberOfLines={2}>
                  {order.productNames.join(' · ') || 'No product names'}
                </Text>
                <View style={styles.rowBetween}>
                  <Text style={[styles.smallText, { color: colors.mutedForeground }]}>{new Date(order.createdAt).toLocaleString()}</Text>
                  <Text style={[styles.priceText, { color: colors.primary }]}>PKR {order.total.toLocaleString()}</Text>
                </View>
              </View>
            ))}
          </>
        )}
      </Panel>
        </>
      ) : null}

      {activeAdminTab === 'users' ? (
      <Panel>
        <SectionHeading title="User management" detail="Search customer and merchant accounts by name, email, or shop." />
        <Field
          label="Search accounts"
          value={userSearchDraft}
          onChangeText={setUserSearchDraft}
          onSubmitEditing={applyUserSearch}
          returnKeyType="search"
          placeholder="Name, email, or shop"
          maxLength={100}
          testID="admin-user-search"
        />
        <View style={styles.row}>
          <AppButton
            label="Search"
            icon="search"
            compact
            testID="search-admin-users"
            onPress={applyUserSearch}
            disabled={adminUsersQuery.isFetching}
          />
          {userSearch || userSearchDraft ? (
            <AppButton label="Clear search" icon="x" compact variant="outline" onPress={clearUserSearch} />
          ) : null}
        </View>
        {adminUsersQuery.isLoading && matchingUsers.length === 0 ? (
          <View style={styles.row}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>Loading accounts…</Text>
          </View>
        ) : null}
        {adminUsersQuery.isError ? (
          <>
            <Notice tone="warning">{errorMessage(adminUsersQuery.error, 'Account data could not be loaded.')}</Notice>
            <AppButton label="Try again" icon="refresh-cw" compact onPress={() => { void adminUsersQuery.refetch(); }} />
          </>
        ) : null}
        {!adminUsersQuery.isLoading && !adminUsersQuery.isError && totalMatchingUsers === 0 ? (
          <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
            {userSearch ? 'No customer or merchant accounts match that search.' : 'No customer or merchant accounts are available.'}
          </Text>
        ) : null}
        {matchingUsers.length > 0 ? (
          <>
            {loadingMoreUsers ? (
              <View style={styles.row}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.smallText, { color: colors.mutedForeground }]}>Loading more accounts…</Text>
              </View>
            ) : null}
            {matchingUsers.map((user) => (
              <View key={user.id} style={[styles.adminUserRow, { borderColor: colors.border }]}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.productName, { color: colors.foreground }]}>{user.name}</Text>
                    <Text style={[styles.smallText, { color: colors.mutedForeground }]}>{user.email}</Text>
                  </View>
                  <Tag>{user.role === 'customer' ? 'Customer' : 'Merchant'}</Tag>
                </View>
                {user.role === 'merchant' ? (
                  <Text style={[styles.smallText, { color: colors.mutedForeground }]}>
                    Shop: {user.shopName ?? 'No linked shop'}{user.shopStatus ? ` · ${user.shopStatus}` : ''}
                  </Text>
                ) : null}
              </View>
            ))}
            {!adminUsersQuery.isError && matchingUsers.length < totalMatchingUsers ? (
              <AppButton
                label="Load more users"
                icon="arrow-down"
                compact
                testID="load-more-admin-users"
                onPress={loadMoreUsers}
                disabled={adminUsersQuery.isFetching}
                loading={loadingMoreUsers}
              />
            ) : null}
          </>
        ) : null}
      </Panel>
      ) : null}

      {activeAdminTab === 'profileRequests' ? (
        <AdminProfileChangeRequestsView />
      ) : null}

      {activeAdminTab === 'activity' ? (
        <Panel>
          <SectionHeading title="Recent activity" detail="Latest security-conscious audit events." />
          {overview.recentEvents?.length ? overview.recentEvents.map((event: any, index: number) => (
            <View key={`${event.entityId}-${index}`} style={[styles.eventRow, { borderBottomColor: colors.border }]}>
              <Feather name="activity" size={15} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.smallText, { color: colors.foreground, fontWeight: '700' }]}>{event.action}</Text>
                <Text style={[styles.smallText, { color: colors.mutedForeground }]}>{event.entityType} · {String(event.entityId).slice(0, 12)}</Text>
              </View>
              <Text style={[styles.smallText, { color: colors.mutedForeground }]}>{new Date(event.createdAt).toLocaleDateString()}</Text>
            </View>
          )) : (
            <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>No recent activity yet.</Text>
          )}
        </Panel>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, padding: 22 },
  authPage: { flexGrow: 1, justifyContent: 'center', padding: 22, gap: 26, maxWidth: 620, width: '100%', alignSelf: 'center' },
  appHeader: { height: 62, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  brandMarkSmall: { width: 34, height: 34, borderRadius: 12 },
  brandName: { fontSize: 19, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  brandSub: { fontSize: 10, fontFamily: 'Inter_500Medium', marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notificationBadge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  notificationBadgeText: { fontSize: 9, fontFamily: 'Inter_700Bold', fontWeight: '800' },
  authHero: { gap: 10 },
  heroTitle: { fontFamily: 'Georgia', fontSize: 38, lineHeight: 44, fontWeight: '600', letterSpacing: -1.1 },
  sectionTitle: { fontFamily: 'Georgia', fontSize: 20, lineHeight: 26, fontWeight: '600' },
  bodyText: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21 },
  smallText: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16 },
  footerNote: { fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center', lineHeight: 18, paddingHorizontal: 14 },
  linkText: { fontSize: 13, fontWeight: '700', fontFamily: 'Inter_600SemiBold' },
  errorText: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' },
  label: { fontSize: 12, fontWeight: '700', fontFamily: 'Inter_600SemiBold' },
  page: { paddingHorizontal: 16, paddingTop: 13, paddingBottom: 50, gap: 14, maxWidth: 720, width: '100%', alignSelf: 'center' },
  pageTitle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 5 },
  pageHeading: { fontFamily: 'Georgia', fontSize: 30, lineHeight: 35, fontWeight: '600', letterSpacing: -0.6 },
  locationPill: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 30, flexDirection: 'row', gap: 6, alignItems: 'center' },
  locationText: { fontSize: 11, fontWeight: '700', fontFamily: 'Inter_600SemiBold' },
  navRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingVertical: 5 },
  navItem: { paddingVertical: 9, paddingHorizontal: 10, borderWidth: 1, borderRadius: 100, flexDirection: 'row', alignItems: 'center', gap: 5 },
  navText: { fontSize: 11, fontWeight: '700', fontFamily: 'Inter_600SemiBold' },
  heroPanel: { overflow: 'hidden', paddingTop: 22 },
  heroIntroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  formFieldsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  formFieldsColumn: { flexDirection: 'column', alignItems: 'stretch' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  assistantHeadingRow: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  assistantHeadingText: { flex: 1, minWidth: 0 },
  assistantHeadingIcon: { width: 28, height: 28, flexShrink: 0, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  assistantWelcome: { padding: 14, borderRadius: 16, gap: 4 },
  userMessage: { alignItems: 'flex-end' },
  assistantMessage: { alignItems: 'flex-start' },
  assistantProductsMessage: { width: '100%', minWidth: 0, alignItems: 'stretch' },
  messageBubble: { maxWidth: '96%', padding: 12, borderWidth: 1, borderRadius: 17, gap: 10 },
  assistantProductsBubble: { width: '100%', maxWidth: '100%', minWidth: 0 },
  assistantProductCard: { width: '100%', minWidth: 0, padding: 11, borderWidth: 1, borderRadius: 14, gap: 5 },
  assistantProductText: { flexShrink: 1, minWidth: 0 },
  assistantProductContact: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 },
  assistantProductPurchase: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 },
  assistantProductPrice: { flexShrink: 1, minWidth: 0 },
  merchantAssistantActions: { width: '100%', flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'stretch', gap: 8 },
  merchantVoiceButton: { flex: 1, minWidth: 0 },
  merchantPrepareButton: { flex: 1.25, minWidth: 0 },
  composer: { padding: 10, borderWidth: 1, borderRadius: 18, gap: 8 },
  composerInput: { minHeight: 60, borderWidth: 0, paddingHorizontal: 6, paddingVertical: 5 },
  composerActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 7 },
  productCard: { paddingVertical: 11, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  productIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  productName: { fontFamily: 'Inter_600SemiBold', fontWeight: '700', fontSize: 13 },
  notificationStatus: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 100 },
  notificationStatusText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', fontWeight: '700' },
  priceText: { fontFamily: 'Inter_700Bold', fontWeight: '800', fontSize: 12 },
  stickyCart: { position: 'absolute', zIndex: 40, left: 12, right: 12, borderRadius: 18, minHeight: 64, paddingHorizontal: 16, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 10, elevation: 8 },
  cartAction: { borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10 },
  iconButton: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#101C1680' },
  modalCard: { padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 13, maxHeight: '88%' },
  divider: { height: 1, width: '100%', marginVertical: 1 },
  pickupCode: { fontFamily: 'Inter_700Bold', fontWeight: '800', fontSize: 36, letterSpacing: 6, textAlign: 'center' },
  coordinateCard: { padding: 11, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 9 },
  statusIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  statusHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, marginBottom: 14 },
  statusTextGroup: { flex: 1, gap: 5, paddingTop: 1 },
  previewCard: { padding: 14, borderWidth: 1, borderRadius: 16, gap: 9 },
  orderActionRow: { width: '100%', flexDirection: 'row', alignItems: 'flex-end', gap: 9 },
  orderActionCell: { flex: 1, minWidth: 0 },
  orderPickupCode: { width: '100%', borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 },
  orderPickupCodeInfo: { flex: 1, minWidth: 0, gap: 3 },
  orderPickupCodeValue: { flexShrink: 0, fontSize: 24, letterSpacing: 5 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  statCard: { minWidth: '45%', flexGrow: 1, borderRadius: 15, padding: 14, gap: 4 },
  statNumber: { fontFamily: 'Georgia', fontSize: 24, fontWeight: '700' },
  adminShop: { borderTopWidth: 1, paddingTop: 13, gap: 8 },
  profileSubsection: { width: '100%', gap: 12, paddingTop: 4 },
  eventRow: { borderBottomWidth: 1, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
  adminSubtabs: { width: '100%', flexDirection: 'row', alignItems: 'stretch', gap: 6 },
  adminSubtab: { flex: 1, minWidth: 0, minHeight: 56, borderWidth: 1, borderRadius: 14, paddingHorizontal: 6, paddingVertical: 7, alignItems: 'center', justifyContent: 'center', gap: 3 },
  adminSubtabText: { fontSize: 10, lineHeight: 13, textAlign: 'center', fontWeight: '700', fontFamily: 'Inter_600SemiBold' },
  adminFilterRow: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  adminFilterField: { flex: 1, minWidth: 0 },
  adminMetricRow: { width: '100%', flexDirection: 'row', alignItems: 'stretch', gap: 9 },
  adminMetricStack: { width: '100%', flexDirection: 'column', gap: 9 },
  adminMetricCard: { flex: 1, minWidth: 0 },
  adminMetricStackCard: { width: '100%', minWidth: 0, flexGrow: 0 },
  adminMetricNumber: { fontSize: 20, lineHeight: 26 },
  adminOrderRow: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8, marginTop: 10 },
  adminUserRow: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8, marginTop: 10 },
});
