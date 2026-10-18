import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setBaseUrl } from '@workspace/api-client-react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform, StatusBar, useColorScheme } from 'react-native';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useColors } from '@/hooks/useColors';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import Constants, { AppOwnership } from 'expo-constants';
import * as SystemUI from 'expo-system-ui';
import { FirebaseAuthProvider } from '@/services/firebaseAuth';

// Prevent the splash screen from auto-hiding before asset loading is complete.
if (Platform.OS !== 'web') {
  void SplashScreen.preventAutoHideAsync();
}

const queryClient = new QueryClient();
const GestureHandlerRootViewWithChildren =
  GestureHandlerRootView as unknown as React.ComponentType<
    React.PropsWithChildren<{ style?: { flex?: number } }>
  >;
const domain = process.env.EXPO_PUBLIC_DOMAIN;
if (Platform.OS === 'web') {
  setBaseUrl(null);
} else if (domain) {
  setBaseUrl(`https://${domain}`);
}
function RootLayoutNav({ backgroundColor }: { backgroundColor: string }) {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back', headerShown: false, contentStyle: { backgroundColor } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="signup" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    ...Feather.font,
  });

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors.background]);

  useEffect(() => {
    if (Platform.OS === 'web' || Constants.appOwnership === AppOwnership.Expo) return;
    let active = true;
    void import('expo-notifications')
      .then((Notifications) => {
        if (!active) return;
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
          }),
        });
      })
      .catch((error) => {
        console.warn('Push notification handler is unavailable in this runtime.', error);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || fontsLoaded || fontError) {
      void SplashScreen.hideAsync().catch(() => {});
    }
    if (Platform.OS === 'web') return;
    const fallback = setTimeout(() => {
      void SplashScreen.hideAsync().catch(() => {});
    }, 1800);
    return () => clearTimeout(fallback);
  }, [fontsLoaded, fontError]);

  return (
    <>
      <StatusBar
        hidden={false}
        barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
        translucent={Platform.OS === 'android'}
      />
      <FirebaseAuthProvider>
        <SafeAreaProvider>
          <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
              <GestureHandlerRootViewWithChildren style={{ flex: 1 }}>
                <KeyboardProvider>
                  <RootLayoutNav backgroundColor={colors.background} />
                </KeyboardProvider>
              </GestureHandlerRootViewWithChildren>
            </QueryClientProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </FirebaseAuthProvider>
    </>
  );
}
