import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  // Firebase 13's shared declaration omits the React Native-only API.
  // @ts-expect-error The .native.ts resolver selects Firebase's React Native entry at runtime.
  getReactNativePersistence,
  type Persistence,
} from 'firebase/auth';

export function getNativeAuthPersistence(): Persistence {
  return getReactNativePersistence(AsyncStorage);
}
