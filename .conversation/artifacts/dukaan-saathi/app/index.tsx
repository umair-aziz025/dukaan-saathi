import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { WelcomeScreen } from '@/components/entry/WelcomeScreen';
import { useColors } from '@/hooks/useColors';
import { useFirebaseSession } from '@/services/firebaseAuth';

export default function PublicHomeRoute() {
  const { isLoaded, user } = useFirebaseSession();
  const isSignedIn = Boolean(user?.emailVerified);
  const router = useRouter();
  const colors = useColors();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    router.replace('/(tabs)');
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || isSignedIn) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.mutedForeground }}>Opening your Saathi…</Text>
      </View>
    );
  }
  return <WelcomeScreen />;
}
