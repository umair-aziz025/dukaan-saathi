import React, { useEffect, useRef, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { NavigationBar } from 'expo-navigation-bar';
import * as SystemUI from 'expo-system-ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { BrandLogo } from '@/components/entry/BrandLogo';

export type WalkthroughStep = {
  icon: React.ComponentProps<typeof Feather>['name'];
  eyebrow: string;
  title: string;
  body: string;
};

type WalkthroughScreenProps = {
  steps: WalkthroughStep[];
  finishLabel: string;
  testIdPrefix: string;
  onFinish: () => Promise<void> | void;
  systemBarsTranslucent?: boolean;
};

export function WalkthroughScreen({
  steps,
  finishLabel,
  testIdPrefix,
  onFinish,
  systemBarsTranslucent = false,
}: WalkthroughScreenProps) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState('');
  const bodyScroll = useRef<ScrollView>(null);
  const activeStep = steps[activeIndex];
  const isFinalStep = activeIndex === steps.length - 1;

  useEffect(() => {
    bodyScroll.current?.scrollTo({ y: 0, animated: false });
  }, [activeIndex]);

  useEffect(() => {
    if (isFinalStep || finishing || steps.length < 2) return;
    const timer = setTimeout(() => {
      setActiveIndex((index) => Math.min(steps.length - 1, index + 1));
    }, 3000);
    return () => clearTimeout(timer);
  }, [activeIndex, finishing, isFinalStep, steps.length]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors.background]);

  const goPrevious = () => {
    setFinishError('');
    setActiveIndex((index) => Math.max(0, index - 1));
  };

  const goNext = () => {
    setFinishError('');
    setActiveIndex((index) => Math.min(steps.length - 1, index + 1));
  };

  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    setFinishError('');
    try {
      await onFinish();
    } catch {
      setFinishError('We could not save your progress. Please try again.');
    } finally {
      setFinishing(false);
    }
  };

  return (
    <>
      <StatusBar
        barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
        translucent={systemBarsTranslucent && Platform.OS === 'android'}
      />
      {Platform.OS === 'android' ? (
        <NavigationBar style={colorScheme === 'dark' ? 'dark' : 'light'} />
      ) : null}
      <SafeAreaView
        style={[styles.safe, { backgroundColor: colors.background }]}
        edges={['top', 'bottom', 'left', 'right']}
      >
        <View
          style={[
            styles.page,
            {
              paddingTop: Platform.OS === 'web' ? 67 : 12,
              paddingBottom: Platform.OS === 'web' ? 34 : 12,
            },
          ]}
        >
          <View style={styles.header}>
            <BrandLogo size={38} orientation="horizontal" />
            <Text style={[styles.stepCount, { color: colors.mutedForeground }]}>
              {String(activeIndex + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}
            </Text>
          </View>

          <View
            style={styles.progressRow}
            accessibilityLabel={`Step ${activeIndex + 1} of ${steps.length}`}
            testID={`${testIdPrefix}-progress`}
          >
            {steps.map((step, index) => (
              <View
                key={`${step.eyebrow}-${index}`}
                style={[
                  styles.progressSegment,
                  { backgroundColor: index <= activeIndex ? colors.primary : colors.border },
                ]}
              />
            ))}
          </View>

          <ScrollView
            ref={bodyScroll}
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.iconFrame, { backgroundColor: colors.secondary }]}>
              <Feather name={activeStep.icon} size={30} color={colors.primary} />
            </View>
            <Text style={[styles.eyebrow, { color: colors.accentStrong }]}>{activeStep.eyebrow}</Text>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>
              {activeStep.title}
            </Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>{activeStep.body}</Text>
            {finishError ? (
              <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>
                {finishError}
              </Text>
            ) : null}
          </ScrollView>

          <View style={styles.controls}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: activeIndex === 0 }}
              disabled={activeIndex === 0 || finishing}
              onPress={goPrevious}
              testID={`${testIdPrefix}-previous`}
              style={({ pressed }) => [
                styles.previousButton,
                { borderColor: colors.border, opacity: activeIndex === 0 ? 0.42 : pressed ? 0.72 : 1 },
              ]}
            >
              <Feather name="arrow-left" size={16} color={colors.foreground} />
              <Text style={[styles.previousText, { color: colors.foreground }]}>Previous</Text>
            </Pressable>

            {isFinalStep ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: finishing, busy: finishing }}
                disabled={finishing}
                onPress={() => { void finish(); }}
                testID={`${testIdPrefix}-finish`}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: colors.primary, opacity: finishing || pressed ? 0.8 : 1 },
                ]}
              >
                {finishing ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : (
                  <>
                    <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>{finishLabel}</Text>
                    <Feather name="check" size={17} color={colors.primaryForeground} />
                  </>
                )}
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={goNext}
                testID={`${testIdPrefix}-next`}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Next</Text>
                <Feather name="arrow-right" size={17} color={colors.primaryForeground} />
              </Pressable>
            )}
          </View>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  page: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 22,
    gap: 20,
  },
  header: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepCount: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  progressRow: { flexDirection: 'row', gap: 7 },
  progressSegment: { flex: 1, height: 4, borderRadius: 3 },
  bodyScroll: { flex: 1 },
  bodyContent: { flexGrow: 1, justifyContent: 'center', gap: 18, paddingVertical: 24 },
  iconFrame: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 7,
  },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  title: { maxWidth: 460, fontFamily: 'Georgia', fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: -0.55 },
  body: { maxWidth: 430, fontSize: 15, lineHeight: 23 },
  error: { fontSize: 13, lineHeight: 19 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  previousButton: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  previousText: { fontSize: 13, fontWeight: '700' },
  primaryButton: {
    minHeight: 52,
    minWidth: 132,
    borderRadius: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryText: { fontSize: 14, fontWeight: '800' },
});
