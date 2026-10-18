import React from 'react';
import { useState } from 'react';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

const logo = require('@/assets/images/dukaan-saathi-mark-512.png');

export function BrandLogoMark({ size, opacity = 1 }: { size: number; opacity?: number }) {
  const colors = useColors();
  const [loaded, setLoaded] = useState(false);
  return (
    <View style={[styles.markFrame, { width: size, height: size, opacity }]}>
      {!loaded ? (
        <View style={styles.markFallback}>
          <Feather name="shopping-bag" size={Math.round(size * 0.58)} color={colors.primary} />
        </View>
      ) : null}
      <Image
        source={logo}
        contentFit="contain"
        cachePolicy="memory-disk"
        priority="high"
        transition={0}
        onLoad={() => setLoaded(true)}
        style={{ width: size, height: size, opacity: loaded ? 1 : 0 }}
      />
    </View>
  );
}

export function BrandLogo({
  size = 92,
  wordmark = true,
  orientation = 'vertical',
}: {
  size?: number;
  wordmark?: boolean;
  orientation?: 'vertical' | 'horizontal';
}) {
  const colors = useColors();
  const horizontal = orientation === 'horizontal';
  return (
    <View
      style={[styles.wrap, horizontal && styles.horizontalWrap]}
      accessibilityRole="image"
      accessibilityLabel="Dukaan Saathi"
    >
      <BrandLogoMark size={size} />
      {wordmark ? (
        <View style={[styles.wordmark, horizontal && styles.horizontalWordmark]}>
          <Text style={[styles.name, { color: colors.foreground }]}>dukaan saathi</Text>
          <Text style={[styles.urdu, { color: colors.mutedForeground }]}>آپ کے محلے کی دکان</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  markFrame: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  markFallback: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  wrap: { alignItems: 'center', gap: 7 },
  horizontalWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  wordmark: { alignItems: 'center', gap: 2 },
  horizontalWordmark: { alignItems: 'flex-start', flexShrink: 1 },
  name: { fontFamily: 'Georgia', fontSize: 18, fontWeight: '700', letterSpacing: -0.35 },
  urdu: { fontSize: 12, lineHeight: 18 },
});
