import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { BrandLogo, BrandLogoMark } from '@/components/entry/BrandLogo';
import { HelpAssistant } from '@/components/help/HelpAssistant';
import { WalkthroughScreen } from '@/components/onboarding/WalkthroughScreen';
import { sharedIntroSteps } from '@/components/onboarding/walkthroughContent';
import { isWalkthroughComplete, markWalkthroughComplete, sharedIntroStorageKey } from '@/services/onboardingProgress';

const socialLinks: { label: string; icon: React.ComponentProps<typeof Feather>['name']; url: string; testID: string }[] = [
  {
    label: 'GitHub',
    icon: 'github',
    url: 'https://github.com/umair-aziz025',
    testID: 'welcome-social-github',
  },
  {
    label: 'LinkedIn',
    icon: 'linkedin',
    url: 'https://www.linkedin.com/in/umairaziz001/',
    testID: 'welcome-social-linkedin',
  },
  {
    label: 'Instagram',
    icon: 'instagram',
    url: 'https://www.instagram.com/umair._.92/',
    testID: 'welcome-social-instagram',
  },
];

function Benefit({ icon, title, detail }: { icon: React.ComponentProps<typeof Feather>['name']; title: string; detail: string }) {
  const colors = useColors();
  return (
    <View style={styles.benefit}>
      <View style={[styles.benefitIcon, { backgroundColor: colors.secondary }]}>
        <Feather name={icon} size={17} color={colors.primary} />
      </View>
      <View style={styles.benefitCopy}>
        <Text style={[styles.benefitTitle, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.benefitDetail, { color: colors.mutedForeground }]}>{detail}</Text>
      </View>
    </View>
  );
}

export function WelcomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [introComplete, setIntroComplete] = useState<boolean | null>(null);
  const [socialLinkError, setSocialLinkError] = useState('');

  const openSocialLink = async (url: string) => {
    setSocialLinkError('');
    try {
      await Linking.openURL(url);
    } catch {
      setSocialLinkError('Unable to open that link. Please check your connection and try again.');
    }
  };

  useEffect(() => {
    let active = true;
    void isWalkthroughComplete(sharedIntroStorageKey)
      .then((complete) => {
        if (active) setIntroComplete(complete);
      })
      .catch(() => {
        if (active) setIntroComplete(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const finishIntro = async () => {
    await markWalkthroughComplete(sharedIntroStorageKey);
    setIntroComplete(true);
  };

  if (introComplete === null) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!introComplete) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <WalkthroughScreen
          steps={sharedIntroSteps}
          finishLabel="Finish introduction"
          testIdPrefix="shared-intro"
          onFinish={finishIntro}
        />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === 'web' ? 67 : Math.max(insets.top ? 4 : 22, 18),
            paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 24 : 12) + 12,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topline}>
          <BrandLogo size={46} orientation="horizontal" />
          <View style={[styles.languagePill, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.languageDot, { backgroundColor: colors.accentStrong }]} />
            <Text style={[styles.languageText, { color: colors.foreground }]}>MADE FOR PAKISTAN</Text>
          </View>
        </View>
        <View style={[styles.heroPlate, { backgroundColor: colors.primary }]}>
          <View style={styles.heroArt} pointerEvents="none">
            <View style={styles.sun} />
            <View style={[styles.arch, { borderColor: `${colors.primaryForeground}32` }]} />
            <BrandLogoMark size={96} opacity={0.28} />
          </View>
          <View style={[styles.heroKicker, { backgroundColor: `${colors.primaryForeground}18` }]}>
            <View style={[styles.kickerDot, { backgroundColor: colors.accentStrong }]} />
            <Text style={[styles.kickerText, { color: colors.primaryForeground }]}>YOUR NEIGHBOURHOOD, AT YOUR DOOR</Text>
          </View>
          <Text style={[styles.headline, { color: colors.primaryForeground }]}>The shops you know.{'\n'}A simpler way to shop.</Text>
          <Text style={[styles.heroBody, { color: `${colors.primaryForeground}CC` }]}>
            Fresh everyday groceries from nearby dukaan owners — with the comfort of a familiar Saathi.
          </Text>
          <View style={styles.localNote}>
            <Feather name="map-pin" size={14} color={colors.accentStrong} />
            <Text style={[styles.localText, { color: colors.primaryForeground }]}>Neighbourhood shops. Real people. Clear prices.</Text>
          </View>
        </View>

        <View style={styles.benefitsHead}>
          <Text style={[styles.sectionEyebrow, { color: colors.accentStrong }]}>SHOP YOUR WAY</Text>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>A little more local.</Text>
        </View>
        <View style={[styles.benefitList, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Benefit icon="message-circle" title="Speak your language" detail="Order in English, Urdu, or Roman Urdu." />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Benefit icon="shopping-bag" title="Your nearby shops" detail="Browse local stock and compare before you choose." />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Benefit icon="check-circle" title="Pickup, on your terms" detail="Review every item and confirm with the shop." />
        </View>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            testID="welcome-signup"
            onPress={() => router.push('/signup')}
            style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: pressed ? 0.88 : 1 }]}
          >
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Sign up</Text>
            <Feather name="arrow-right" size={17} color={colors.primaryForeground} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            testID="welcome-login"
            onPress={() => router.push('/login')}
            style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.78 : 1 }]}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>Log in</Text>
          </Pressable>
        </View>
        <View style={[styles.welcomeFooter, { borderTopColor: colors.border }]} testID="welcome-footer">
          <Text style={[styles.trustFoot, { color: colors.mutedForeground }]}>
            A friendly way to shop local, one basket at a time.
          </Text>
          <View style={styles.footerAttribution}>
            <View style={[styles.footerAttributionIcon, { backgroundColor: colors.secondary }]}>
              <Feather name="heart" size={17} color={colors.primary} />
            </View>
            <View style={styles.footerAttributionText}>
              <View style={styles.footerCareRow}>
                <Text style={[styles.footerEyebrow, { color: colors.accentStrong }]}>CRAFTED WITH</Text>
                <Text style={[styles.footerCareSignature, { color: colors.accentStrong }]}>Care</Text>
              </View>
              <Text style={[styles.footerCreator, { color: colors.foreground }]}>
                Created by <Text style={[styles.footerNameSignature, { color: colors.primary }]}>Umair Aziz</Text>
              </Text>
            </View>
          </View>
          <View style={styles.footerSocialRow}>
            {socialLinks.map((social) => (
              <Pressable
                key={social.label}
                testID={social.testID}
                accessibilityRole="link"
                accessibilityLabel={`Visit Umair Aziz on ${social.label}`}
                accessibilityHint="Opens an external profile"
                onPress={() => { void openSocialLink(social.url); }}
                style={({ pressed }) => [
                  styles.footerSocialLink,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <Feather name={social.icon} size={19} color={colors.primary} />
                <Text style={[styles.footerSocialLabel, { color: colors.foreground }]}>{social.label}</Text>
              </Pressable>
            ))}
          </View>
          {socialLinkError ? (
            <Text accessibilityRole="alert" style={[styles.footerLinkError, { color: colors.destructive }]}>
              {socialLinkError}
            </Text>
          ) : null}
          <Text style={[styles.footerCopyright, { color: colors.mutedForeground }]}>
            © {new Date().getFullYear()} Dukaan Saathi · Made for neighbourhoods
          </Text>
        </View>
      </ScrollView>
      <HelpAssistant role="guest" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { flexGrow: 1, width: '100%', maxWidth: 540, alignSelf: 'center', paddingHorizontal: 22, gap: 20 },
  topline: { minHeight: 54, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  languagePill: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 30, paddingHorizontal: 11, paddingVertical: 8 },
  languageDot: { width: 6, height: 6, borderRadius: 3 },
  languageText: { fontSize: 9, fontWeight: '800', letterSpacing: 1.15 },
  heroPlate: { position: 'relative', overflow: 'hidden', minHeight: 300, borderRadius: 28, paddingHorizontal: 22, paddingVertical: 24, justifyContent: 'flex-end' },
  heroArt: { position: 'absolute', right: -20, top: -24, width: 160, height: 170, alignItems: 'center', justifyContent: 'center' },
  sun: { width: 138, height: 138, borderRadius: 69, backgroundColor: '#D99A3D', opacity: 0.3, position: 'absolute', top: 14, right: 18 },
  arch: { position: 'absolute', width: 160, height: 160, borderWidth: 1, borderRadius: 80, top: 32, right: 11 },
  heroKicker: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 18 },
  kickerDot: { width: 6, height: 6, borderRadius: 3 },
  kickerText: { fontSize: 8, fontWeight: '800', letterSpacing: 1.3 },
  headline: { maxWidth: 330, fontFamily: 'Georgia', fontSize: 31, lineHeight: 37, fontWeight: '700', letterSpacing: -0.55 },
  heroBody: { maxWidth: 330, fontSize: 13, lineHeight: 20, marginTop: 10 },
  localNote: { flexDirection: 'row', alignItems: 'center', gap: 7, borderTopWidth: 1, borderTopColor: '#FFFFFF26', paddingTop: 14, marginTop: 18 },
  localText: { fontSize: 11, fontWeight: '600' },
  benefitsHead: { gap: 4, marginTop: 2 },
  sectionEyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  sectionTitle: { fontFamily: 'Georgia', fontSize: 22, fontWeight: '700', letterSpacing: -0.25 },
  benefitList: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 15 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 14 },
  benefitIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  benefitCopy: { flex: 1, gap: 3 },
  benefitTitle: { fontSize: 13, fontWeight: '700' },
  benefitDetail: { fontSize: 11, lineHeight: 16 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 51 },
  actions: { gap: 10, marginTop: 1 },
  primaryButton: { minHeight: 54, borderRadius: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 11 },
  primaryButtonText: { fontSize: 15, fontWeight: '700' },
  secondaryButton: { minHeight: 52, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontSize: 14, fontWeight: '700' },
  welcomeFooter: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 17, gap: 13, marginTop: 'auto' },
  trustFoot: { textAlign: 'center', fontSize: 11, lineHeight: 17 },
  footerAttribution: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  footerAttributionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  footerAttributionText: { gap: 2, flexShrink: 1 },
  footerCareRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 5 },
  footerEyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  footerCareSignature: { fontFamily: Platform.select({ ios: 'Snell Roundhand', default: 'cursive' }), fontSize: 21, lineHeight: 28 },
  footerCreator: { fontSize: 12, lineHeight: 30, fontWeight: '600' },
  footerNameSignature: { fontFamily: Platform.select({ ios: 'Snell Roundhand', default: 'cursive' }), fontSize: 24, lineHeight: 30, fontWeight: '400' },
  footerSocialRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  footerSocialLink: { flex: 1, minWidth: 0, minHeight: 64, borderWidth: 1, borderRadius: 15, paddingVertical: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', gap: 5 },
  footerSocialLabel: { fontSize: 11, fontWeight: '700' },
  footerLinkError: { fontSize: 11, lineHeight: 16, textAlign: 'center' },
  footerCopyright: { textAlign: 'center', fontSize: 10, lineHeight: 16, paddingRight: Platform.OS === 'web' ? 0 : 66 },
});
