import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  onIdTokenChanged,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { getNativeAuthPersistence } from './firebaseNativePersistence';

const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '';
const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

export const firebaseConfigReady = Boolean(
  config.apiKey && config.authDomain && config.projectId && config.appId,
);

let auth: Auth | null = null;
if (firebaseConfigReady) {
  const app = getApps().some((candidate) => candidate.name === 'dukaan-saathi-client')
    ? getApp('dukaan-saathi-client')
    : initializeApp(config, 'dukaan-saathi-client');
  if (Platform.OS === 'web') {
    auth = getAuth(app);
  } else {
    try {
      const persistence = getNativeAuthPersistence();
      auth = persistence ? initializeAuth(app, { persistence }) : getAuth(app);
    } catch {
      auth = getAuth(app);
    }
  }
}

export const firebaseAuth = auth;

type FirebaseSession = {
  isLoaded: boolean;
  user: User | null;
};

const FirebaseSessionContext = createContext<FirebaseSession>({
  isLoaded: !firebaseConfigReady,
  user: null,
});

export function FirebaseAuthProvider({ children }: React.PropsWithChildren) {
  const [session, setSession] = useState<FirebaseSession>({
    isLoaded: !firebaseConfigReady,
    user: firebaseAuth?.currentUser ?? null,
  });

  useEffect(() => {
    if (!firebaseAuth) return;
    return onIdTokenChanged(firebaseAuth, (user) => {
      setSession({ isLoaded: true, user });
    }, () => {
      setSession({ isLoaded: true, user: null });
    });
  }, []);

  useEffect(() => {
    setAuthTokenGetter(async () => {
      const user = firebaseAuth?.currentUser;
      return user ? user.getIdToken() : null;
    });
    return () => setAuthTokenGetter(null);
  }, []);

  return (
    <FirebaseSessionContext.Provider value={session}>
      {children}
    </FirebaseSessionContext.Provider>
  );
}

export function useFirebaseSession() {
  return useContext(FirebaseSessionContext);
}

export function requireFirebaseAuth(): Auth {
  if (!firebaseAuth) {
    throw new Error('Firebase Auth is not configured. Add the Firebase Web App settings to Replit.');
  }
  return firebaseAuth;
}

export async function signOutFirebase() {
  await signOut(requireFirebaseAuth());
}
