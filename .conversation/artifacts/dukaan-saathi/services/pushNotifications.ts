import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { AppOwnership } from 'expo-constants';
import { Platform } from 'react-native';

const PUSH_OPT_IN_KEY = 'dukaan-saathi:push-opt-in';
const PUSH_TOKEN_ID_KEY = 'dukaan-saathi:push-token-id';

function accountKey(base: string, userId: string) {
  return `${base}:${userId}`;
}

export function supportsPhonePush() {
  return (
    (Platform.OS === 'ios' || Platform.OS === 'android') &&
    Constants.appOwnership !== AppOwnership.Expo
  );
}

export async function getExpoPushToken(requestPermission: boolean): Promise<string | null> {
  if (!supportsPhonePush()) return null;
  const Notifications = await import('expo-notifications');

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('order-updates', {
      name: 'Order updates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#177A55',
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && requestPermission) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!permission.granted) return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    throw new Error('Phone alerts need an Expo project ID in app.json (expo.extra.eas.projectId).');
  }

  const result = await Notifications.getExpoPushTokenAsync({ projectId });
  return result.data;
}

export async function readPushAlertsPreference(userId: string) {
  return (await AsyncStorage.getItem(accountKey(PUSH_OPT_IN_KEY, userId))) === 'enabled';
}

export async function savePushAlertsPreference(userId: string, enabled: boolean) {
  await AsyncStorage.setItem(accountKey(PUSH_OPT_IN_KEY, userId), enabled ? 'enabled' : 'disabled');
}

export async function readPushTokenId(userId: string) {
  return AsyncStorage.getItem(accountKey(PUSH_TOKEN_ID_KEY, userId));
}

export async function savePushTokenId(userId: string, tokenId: string) {
  await AsyncStorage.setItem(accountKey(PUSH_TOKEN_ID_KEY, userId), tokenId);
}

export async function clearPushTokenId(userId: string) {
  await AsyncStorage.removeItem(accountKey(PUSH_TOKEN_ID_KEY, userId));
}
