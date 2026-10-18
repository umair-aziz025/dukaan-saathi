import AsyncStorage from '@react-native-async-storage/async-storage';

type WalkthroughRole = 'customer' | 'merchant' | 'admin';

const STORAGE_PREFIX = 'dukaan-saathi:onboarding:v1';
const COMPLETED_VALUE = 'completed';

export const sharedIntroStorageKey = `${STORAGE_PREFIX}:shared`;

export function roleWalkthroughStorageKey(userId: string, role: WalkthroughRole) {
  return `${STORAGE_PREFIX}:user:${encodeURIComponent(userId)}:${role}`;
}

export async function isWalkthroughComplete(key: string) {
  return (await AsyncStorage.getItem(key)) === COMPLETED_VALUE;
}

export async function markWalkthroughComplete(key: string) {
  await AsyncStorage.setItem(key, COMPLETED_VALUE);
}
