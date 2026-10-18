import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import {
  createUserWithEmailAndPassword,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { getGetDukaanProfileQueryKey, useCreateDukaanProfile } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { BrandLogo } from '@/components/entry/BrandLogo';
import { AppButton } from '@/components/saathi-ui';
import { requireFirebaseAuth } from '@/services/firebaseAuth';

type AuthMode = 'signin' | 'signup';
type AccountRole = 'customer' | 'merchant';
const emailDomains = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'me.com',
  'proton.me', 'protonmail.com',
]);

const resetEmailNotice =
  'If an account exists for that email, you’ll receive a password-reset link. Open the link in your email to choose a new password, then return here to log in.';

function firebaseAuthCode(error: unknown) {
  if (!error || typeof error !== 'object') return null;
  if ('code' in error && typeof error.code === 'string') return error.code;
  if ('message' in error && typeof error.message === 'string') {
    return error.message.match(/auth\/[a-z0-9-]+/i)?.[0] ?? null;
  }
  return null;
}

function errorMessage(error: unknown, fallback: string) {
  const code = firebaseAuthCode(error);
  if (code?.startsWith('auth/')) {
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'We couldn’t sign you in with those details. Check your email and password and try again.';
      case 'auth/invalid-email':
        return 'Enter a valid email address.';
      case 'auth/email-already-in-use':
        return 'An account may already use this email. Try logging in or resetting your password.';
      case 'auth/weak-password':
        return 'Choose a password with at least 8 characters.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Wait a few minutes, then try again.';
      case 'auth/network-request-failed':
        return 'We couldn’t connect. Check your internet connection and try again.';
      default:
        return fallback;
    }
  }
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    if (/firebase|auth\//i.test(error.message)) return fallback;
    return error.message.replace(/^HTTP \d+[^:]*:\s*/, '').slice(0, 220);
  }
  return fallback;
}

function FormField({
  label, value, onChangeText, placeholder, secureTextEntry, keyboardType, autoComplete, maxLength, autoCapitalize, testID,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'email-address' | 'number-pad' | 'phone-pad' | 'default';
  autoComplete?: 'email' | 'password' | 'new-password' | 'one-time-code';
  maxLength?: number;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  testID?: string;
}) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType ?? 'default'}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize ?? 'none'}
        autoCorrect={false}
        secureTextEntry={secureTextEntry}
        maxLength={maxLength}
        selectionColor={colors.accent}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          { color: colors.foreground, backgroundColor: colors.card, borderColor: focused ? colors.primary : colors.border },
          focused && { borderWidth: 1.5 },
        ]}
      />
    </View>
  );
}

function SignupRoleOption({
  role,
  selected,
  title,
  detail,
  testID,
  onPress,
}: {
  role: AccountRole;
  selected: boolean;
  title: string;
  detail: string;
  testID: string;
  onPress: (role: AccountRole) => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      testID={testID}
      onPress={() => onPress(role)}
      style={({ pressed }) => [
        styles.roleOption,
        {
          backgroundColor: selected ? colors.secondary : colors.card,
          borderColor: selected ? colors.primary : colors.border,
          opacity: pressed ? 0.82 : 1,
        },
      ]}
    >
      <View style={[styles.roleIndicator, { borderColor: colors.primary }]}>
        {selected ? <View style={[styles.roleIndicatorDot, { backgroundColor: colors.primary }]} /> : null}
      </View>
      <Text style={[styles.roleTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.roleDetail, { color: colors.mutedForeground }]}>{detail}</Text>
    </Pressable>
  );
}

export function AuthScreen({ mode }: { mode: AuthMode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const onboarding = useCreateDukaanProfile();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cnic, setCnic] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AccountRole>('customer');
  const [verificationPurpose, setVerificationPurpose] = useState<'signup' | 'signin' | null>(null);
  const [accountVerified, setAccountVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resetNotice, setResetNotice] = useState('');

  const persistProfile = async () => {
    const token = await requireFirebaseAuth().currentUser?.getIdToken();
    if (!token) {
      throw new Error('Your verified session is still starting. Please retry in a moment.');
    }
    await onboarding.mutateAsync({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        cnic: cnic.trim(),
        role,
      },
    });
    await queryClient.invalidateQueries({ queryKey: getGetDukaanProfileQueryKey() });
    router.replace('/(tabs)');
  };

  const retryProfileSetup = async () => {
    setBusy(true);
    setError('');
    try {
      await persistProfile();
    } catch (reason) {
      setError(errorMessage(reason, 'Your account is verified, but profile setup did not finish. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setError('');
    setResetNotice('');
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (mode === 'signup') {
      const domain = normalizedEmail.split('@')[1];
      if (!emailDomains.has(domain)) {
        setError('Use a Gmail, Yahoo, Outlook, iCloud, or Proton address.');
        return;
      }
      if (name.trim().length < 2) {
        setError('Enter your full name before creating an account.');
        return;
      }
      const phoneDigits = phone.replace(/\D/g, '');
      if (!(/^03\d{9}$/.test(phoneDigits) || /^923\d{9}$/.test(phoneDigits))) {
        setError('Enter a valid Pakistani mobile number, such as 03XXXXXXXXX.');
        return;
      }
      if (!/^\d{5}-?\d{7}-?\d$/.test(cnic.trim())) {
        setError('Enter your 13-digit CNIC, with or without hyphens.');
        return;
      }
      if (password.length < 8) {
        setError('Choose a password with at least 8 characters.');
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        const credential = await createUserWithEmailAndPassword(
          requireFirebaseAuth(),
          normalizedEmail,
          password,
        );
        await updateProfile(credential.user, { displayName: name.trim() });
        await sendEmailVerification(credential.user);
        setVerificationPurpose('signup');
      } else {
        const credential = await signInWithEmailAndPassword(
          requireFirebaseAuth(),
          normalizedEmail,
          password,
        );
        if (!credential.user.emailVerified) {
          await sendEmailVerification(credential.user);
          setVerificationPurpose('signin');
        } else {
          router.replace('/(tabs)');
        }
      }
    } catch (reason) {
      setError(errorMessage(reason, 'Could not continue. Check your details and try again.'));
    } finally {
      setBusy(false);
    }
  };

  const verifyEmail = async () => {
    setError('');
    setBusy(true);
    try {
      const user = requireFirebaseAuth().currentUser;
      if (!user) throw new Error('Sign in again to continue email verification.');
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await reload(user);
          await user.getIdToken(true);
        } catch (reason) {
          if (attempt === 2) throw reason;
        }
        if (user.emailVerified) break;
        if (attempt < 2) {
          await new Promise<void>((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
        }
      }
      if (!user.emailVerified) {
        setError('We have not received the latest verification status yet. Open the link in your email, then try again.');
        return;
      }
      if (verificationPurpose === 'signup') {
        setAccountVerified(true);
        await persistProfile();
      } else {
        await queryClient.invalidateQueries();
        router.replace('/(tabs)');
      }
    } catch (reason) {
      setError(errorMessage(reason, 'Could not confirm email verification.'));
    } finally {
      setBusy(false);
    }
  };

  const resendVerification = async () => {
    setError('');
    setBusy(true);
    try {
      const user = requireFirebaseAuth().currentUser;
      if (!user) throw new Error('Sign in again to request a verification email.');
      await sendEmailVerification(user);
    } catch (reason) {
      setError(errorMessage(reason, 'Could not send another verification email.'));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    setError('');
    setResetNotice('');
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter your email address first.');
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(requireFirebaseAuth(), normalizedEmail);
      setResetNotice(resetEmailNotice);
    } catch (reason) {
      const code = firebaseAuthCode(reason);
      if (code === 'auth/user-not-found' || code === 'auth/invalid-email') {
        setResetNotice(resetEmailNotice);
      } else {
        setError(errorMessage(reason, 'We couldn’t send the reset link right now. Please try again shortly.'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === 'web' ? 67 : 8,
            paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 20) + 18,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={32}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="auth-back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={({ pressed }) => [styles.backButton, { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.65 : 1 }]}
        >
          <Text style={[styles.backArrow, { color: colors.foreground }]}>←</Text>
        </Pressable>
        <View style={styles.logoArea}><BrandLogo size={88} /></View>
        <View style={styles.heading}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {accountVerified
              ? 'Finishing your account'
              : verificationPurpose
                ? 'Verify your email'
                : resetNotice
                  ? 'Check your inbox'
                  : mode === 'signup'
                    ? 'Create account'
                    : 'Log in'}
          </Text>
          {accountVerified ? (
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Your email is verified. We’re setting up your {role === 'merchant' ? 'shop owner' : 'customer'} profile.
            </Text>
          ) : verificationPurpose ? (
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Open the verification link sent to {email.trim()}, then return here.
            </Text>
          ) : resetNotice ? (
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Use the secure email link to choose a new password.</Text>
          ) : mode === 'signup' ? (
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Choose your account type and profile details. You’ll verify your email with a link before entering the app.</Text>
          ) : null}
        </View>
        <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {accountVerified ? (
            <>
              {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : <ActivityIndicator color={colors.primary} />}
              {error ? <AppButton label="Retry profile setup" onPress={retryProfileSetup} loading={busy} /> : null}
            </>
          ) : verificationPurpose ? (
            <>
              {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
              <AppButton label="I verified my email" onPress={verifyEmail} loading={busy} />
              <Pressable accessibilityRole="button" onPress={resendVerification} disabled={busy} style={styles.resend}>
                <Text style={[styles.link, { color: colors.primary }]}>Resend verification link</Text>
              </Pressable>
            </>
          ) : resetNotice ? (
            <View style={styles.resetConfirmation}>
              <View style={[styles.resetIcon, { backgroundColor: colors.secondary }]}>
                <Feather name="mail" size={22} color={colors.primary} />
              </View>
              <Text style={[styles.resetTitle, { color: colors.foreground }]}>Check your email</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{resetNotice}</Text>
              <AppButton label="Back to log in" variant="outline" onPress={() => setResetNotice('')} />
            </View>
          ) : (
            <>
              {mode === 'signup' ? (
                <>
                  <FormField
                    label="Full name"
                    value={name}
                    onChangeText={setName}
                    placeholder="Your full name"
                    autoCapitalize="words"
                    testID="signup-name"
                  />
                </>
              ) : null}
              <FormField
                label="Email address"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoComplete="email"
                testID={mode === 'signup' ? 'signup-email' : 'login-email'}
              />
              {mode === 'signup' ? (
                <>
                  <FormField
                    label="Pakistani mobile number"
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="03XXXXXXXXX"
                    keyboardType="phone-pad"
                    maxLength={16}
                    testID="signup-phone"
                  />
                  <FormField
                    label="CNIC"
                    value={cnic}
                    onChangeText={setCnic}
                    placeholder="12345-1234567-1"
                    keyboardType="number-pad"
                    maxLength={15}
                    testID="signup-cnic"
                  />
                  <View style={styles.roleGroup}>
                    <Text style={[styles.label, { color: colors.foreground }]}>I’m joining as</Text>
                    <View style={styles.roleChoices}>
                      <SignupRoleOption
                        role="customer"
                        selected={role === 'customer'}
                        title="Customer"
                        detail="I want to shop nearby stores."
                        testID="signup-role-customer"
                        onPress={setRole}
                      />
                      <SignupRoleOption
                        role="merchant"
                        selected={role === 'merchant'}
                        title="Shop owner"
                        detail="I want to register my shop."
                        testID="signup-role-merchant"
                        onPress={setRole}
                      />
                    </View>
                  </View>
                </>
              ) : null}
              <FormField
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
                secureTextEntry
                autoComplete={mode === 'signup' ? 'new-password' : 'password'}
                testID={mode === 'signup' ? 'signup-password' : 'login-password'}
              />
              {mode === 'signup' ? (
                <Text style={[styles.passwordHint, { color: colors.mutedForeground }]}>Password must be at least 8 characters.</Text>
              ) : null}
              {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
              <AppButton
                label={mode === 'signup' ? 'Create account' : 'Log in'}
                onPress={submit}
                loading={busy}
                disabled={!email.trim() || !password || (mode === 'signup' && password.length < 8)}
                testID={mode === 'signup' ? 'signup-continue' : 'login-submit'}
              />
              {mode === 'signin' ? (
                <Pressable accessibilityRole="button" onPress={resetPassword} disabled={busy} style={styles.resend}>
                  <Text style={[styles.link, { color: colors.primary }]}>Forgot password?</Text>
                </Pressable>
              ) : null}
              <View style={styles.accountSwitch}>
                <Text style={[styles.accountSwitchPrompt, { color: colors.mutedForeground }]}>
                  {mode === 'signup' ? 'Already have an account?' : 'New to Dukaan Saathi?'}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  testID={mode === 'signup' ? 'signup-login-link' : 'login-signup-link'}
                  onPress={() => {
                    setError('');
                    setResetNotice('');
                    router.replace(mode === 'signup' ? '/login' : '/signup');
                  }}
                >
                  <Text style={[styles.accountSwitchAction, { color: colors.primary }]}>{mode === 'signup' ? 'Log in' : 'Create account'}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { width: '100%', maxWidth: 480, alignSelf: 'center', flexGrow: 1, paddingHorizontal: 24, gap: 22 },
  backButton: { width: 42, height: 42, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 25, lineHeight: 28, fontWeight: '400' },
  logoArea: { alignItems: 'center', marginTop: 2 },
  heading: { alignItems: 'center', gap: 7, marginTop: 0 },
  title: { fontFamily: 'Georgia', fontSize: 29, lineHeight: 36, fontWeight: '700', letterSpacing: -0.4, textAlign: 'center' },
  subtitle: { fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 300 },
  formCard: { borderWidth: 1, borderRadius: 22, padding: 18, gap: 16, marginTop: 1 },
  fieldWrap: { gap: 7 },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  error: { fontSize: 12, lineHeight: 17, marginTop: -5 },
  roleGroup: { gap: 9 },
  roleChoices: { flexDirection: 'row', gap: 10 },
  roleOption: { flex: 1, minHeight: 116, borderWidth: 1.5, borderRadius: 16, padding: 12, gap: 6 },
  roleIndicator: { width: 18, height: 18, borderWidth: 1.5, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  roleIndicatorDot: { width: 8, height: 8, borderRadius: 4 },
  roleTitle: { fontSize: 13, fontWeight: '700' },
  roleDetail: { fontSize: 10, lineHeight: 14 },
  passwordHint: { fontSize: 11, lineHeight: 16, marginTop: -9 },
  resend: { alignItems: 'center', paddingVertical: 2 },
  link: { fontSize: 13, fontWeight: '700' },
  accountSwitch: { minHeight: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', columnGap: 6, rowGap: 2 },
  accountSwitchPrompt: { fontSize: 11, lineHeight: 16, includeFontPadding: false, textAlign: 'center' },
  accountSwitchAction: { fontSize: 13, lineHeight: 16, includeFontPadding: false, fontWeight: '700' },
  resetConfirmation: { alignItems: 'center', gap: 13, paddingVertical: 4 },
  resetIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  resetTitle: { fontSize: 19, fontWeight: '700', textAlign: 'center' },
});
