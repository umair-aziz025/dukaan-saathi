import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

export function Panel({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const colors = useColors();
  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

export function AppButton({
  label,
  onPress,
  disabled,
  variant = 'primary',
  icon,
  loading,
  compact,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'quiet' | 'outline' | 'danger';
  icon?: React.ComponentProps<typeof Feather>['name'];
  loading?: boolean;
  compact?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  const backgroundColor = variant === 'primary'
    ? colors.primary
    : variant === 'danger'
      ? colors.destructive
      : variant === 'quiet'
        ? colors.secondary
        : 'transparent';
  const color = variant === 'primary' || variant === 'danger'
    ? colors.primaryForeground
    : colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        {
          backgroundColor,
          borderColor: variant === 'outline' ? colors.border : backgroundColor,
          opacity: disabled || loading ? 0.55 : pressed ? 0.82 : 1,
        },
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={color} /> : icon ? <Feather name={icon} size={16} color={color} /> : null}
      <Text style={[styles.buttonText, { color }, compact && styles.buttonTextCompact]}>{label}</Text>
    </Pressable>
  );
}

export function ThemedDialog({
  visible,
  title,
  message,
  onClose,
}: {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
}) {
  const colors = useColors();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.dialogBackdrop,
          { backgroundColor: `${colors.foreground}78` },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss dialog"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.dialogCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowColor: colors.foreground,
            },
          ]}
        >
          <View style={styles.dialogHeader}>
            <View
              style={[
                styles.dialogIcon,
                { backgroundColor: colors.secondary },
              ]}
            >
              <Feather name="info" size={19} color={colors.primary} />
            </View>
            <View style={styles.dialogCopy}>
              <Text
                accessibilityRole="header"
                style={[styles.dialogTitle, { color: colors.foreground }]}
              >
                {title}
              </Text>
              <Text
                accessibilityRole="alert"
                style={[styles.dialogMessage, { color: colors.mutedForeground }]}
              >
                {message}
              </Text>
            </View>
          </View>
          <AppButton label="Got it" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

export function Field({
  label,
  error,
  multiline,
  containerStyle,
  style,
  ...props
}: TextInputProps & { label: string; error?: string; containerStyle?: ViewStyle }) {
  const colors = useColors();
  return (
    <View style={[styles.fieldWrap, containerStyle]}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor={colors.mutedForeground}
        selectionColor={colors.accent}
        style={[
          styles.input,
          multiline && styles.multiline,
          {
            color: colors.foreground,
            backgroundColor: colors.card,
            borderColor: error ? colors.destructive : colors.border,
          },
          style,
        ]}
      />
      {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}

export type SearchableSelectOption<Value extends string = string> = {
  value: Value;
  label: string;
};

export function SearchableSelect<Value extends string>({
  label,
  value,
  options,
  onChange,
  searchPlaceholder,
  emptyMessage,
  testID,
}: {
  label: string;
  value: Value;
  options: readonly SearchableSelectOption<Value>[];
  onChange: (value: Value) => void;
  searchPlaceholder: string;
  emptyMessage: string;
  testID: string;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selectedOption = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query
      ? options.filter((option) => option.label.toLocaleLowerCase().includes(query))
      : options;
  }, [options, search]);
  const close = () => {
    setSearch('');
    setOpen(false);
  };

  return (
    <>
      <View style={styles.searchableSelectGroup}>
        <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${selectedOption?.label ?? 'Choose an option'}`}
          accessibilityHint="Opens a searchable list of options"
          testID={testID}
          onPress={() => {
            setSearch('');
            setOpen(true);
          }}
          style={[
            styles.searchableTrigger,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[styles.searchableTriggerText, { color: colors.foreground }]}
          >
            {selectedOption?.label ?? 'Choose an option'}
          </Text>
          <Feather name="chevron-down" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <Modal animationType="slide" onRequestClose={close} transparent visible={open}>
        <View style={styles.searchableModalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Close ${label.toLowerCase()} selector`}
            onPress={close}
            style={[StyleSheet.absoluteFill, { backgroundColor: `${colors.foreground}70` }]}
          />
          <KeyboardAvoidingView behavior="padding" style={styles.searchableSheetDock}>
            <View
              style={[
                styles.searchableSheet,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 12),
                },
              ]}
            >
              <View style={styles.searchableHeader}>
                <Text style={[styles.searchableTitle, { color: colors.foreground }]}>
                  Choose {label.toLowerCase()}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close selector"
                  hitSlop={8}
                  onPress={close}
                  style={styles.searchableClose}
                >
                  <Feather name="x" size={21} color={colors.foreground} />
                </Pressable>
              </View>
              <View
                style={[
                  styles.searchableSearch,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Feather name="search" size={17} color={colors.mutedForeground} />
                <TextInput
                  accessibilityLabel={searchPlaceholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setSearch}
                  placeholder={searchPlaceholder}
                  placeholderTextColor={colors.mutedForeground}
                  returnKeyType="search"
                  style={[styles.searchableSearchInput, { color: colors.foreground }]}
                  testID={`${testID}-search`}
                  value={search}
                />
              </View>
              <ScrollView
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                style={styles.searchableOptions}
                contentContainerStyle={styles.searchableOptionsContent}
              >
                {filteredOptions.length ? filteredOptions.map((option) => {
                  const selected = option.value === value;
                  return (
                    <Pressable
                      key={option.value || 'all'}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      testID={`${testID}-option-${option.value || 'all'}`}
                      onPress={() => {
                        onChange(option.value);
                        close();
                      }}
                      style={[
                        styles.searchableOption,
                        {
                          backgroundColor: selected ? colors.secondary : colors.card,
                          borderColor: selected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={[styles.searchableOptionText, { color: colors.foreground }]}
                      >
                        {option.label}
                      </Text>
                      {selected ? <Feather name="check" size={17} color={colors.primary} /> : null}
                    </Pressable>
                  );
                }) : (
                  <View style={styles.searchableEmpty}>
                    <Text style={[styles.detail, { color: colors.mutedForeground }]}>
                      {emptyMessage}
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>{children}</Text>;
}

export function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  const colors = useColors();
  return (
    <View style={{ gap: 5, marginBottom: 14 }}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      {detail ? <Text style={[styles.detail, { color: colors.mutedForeground }]}>{detail}</Text> : null}
    </View>
  );
}

export function Notice({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warning' | 'success' }) {
  const colors = useColors();
  const tint = tone === 'success' ? '#2E7350' : tone === 'warning' ? '#A96721' : colors.primary;
  return (
    <View style={[styles.notice, { backgroundColor: `${tint}12`, borderColor: `${tint}30` }]}>
      <Text style={[styles.noticeText, { color: colors.foreground }]}>{children}</Text>
    </View>
  );
}

export function Tag({
  children,
  selected,
  onPress,
  testID,
}: {
  children: React.ReactNode;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      testID={testID}
      style={[
        styles.tag,
        {
          backgroundColor: selected ? colors.primary : colors.secondary,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      <Text style={{ color: selected ? colors.primaryForeground : colors.foreground, fontSize: 12, fontWeight: '700' }}>
        {children}
      </Text>
    </Pressable>
  );
}

export const ui = StyleSheet.create({
  body: { fontSize: 14, lineHeight: 21, fontFamily: 'Inter_400Regular' },
  bold: { fontFamily: 'Inter_600SemiBold' },
});

const styles = StyleSheet.create({
  panel: {
    padding: 17,
    borderWidth: 1,
    borderRadius: 20,
    gap: 12,
  },
  button: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  buttonCompact: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Inter_600SemiBold',
  },
  buttonTextCompact: {
    fontSize: 12,
  },
  fieldWrap: { gap: 7, minWidth: 0 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.15, fontFamily: 'Inter_600SemiBold' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  multiline: { minHeight: 86, textAlignVertical: 'top' },
  error: { fontSize: 12, lineHeight: 17 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.7, textTransform: 'uppercase', fontFamily: 'Inter_700Bold' },
  sectionTitle: { fontSize: 20, lineHeight: 26, fontFamily: 'Georgia', fontWeight: '600' },
  detail: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular' },
  notice: { paddingHorizontal: 13, paddingVertical: 11, borderRadius: 13, borderWidth: 1 },
  noticeText: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' },
  tag: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 100, borderWidth: 1 },
  dialogBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 440,
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    gap: 18,
    elevation: 16,
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
  },
  dialogHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 13 },
  dialogIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogCopy: { flex: 1, gap: 6, paddingTop: 1 },
  dialogTitle: { fontSize: 18, lineHeight: 24, fontWeight: '700', fontFamily: 'Inter_700Bold' },
  dialogMessage: { fontSize: 13, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  searchableSelectGroup: { gap: 7 },
  searchableTrigger: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  searchableTriggerText: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  searchableModalRoot: { flex: 1, justifyContent: 'flex-end' },
  searchableSheetDock: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 12 },
  searchableSheet: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '86%',
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    gap: 12,
    elevation: 16,
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
  },
  searchableHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  searchableTitle: { flex: 1, minWidth: 0, fontSize: 18, lineHeight: 24, fontWeight: '700', fontFamily: 'Inter_700Bold' },
  searchableClose: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  searchableSearch: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  searchableSearchInput: { flex: 1, minWidth: 0, minHeight: 46, paddingVertical: 0, fontSize: 14, fontFamily: 'Inter_400Regular' },
  searchableOptions: { flexShrink: 1 },
  searchableOptionsContent: { gap: 7, paddingBottom: 4 },
  searchableOption: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchableOptionText: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: 'Inter_500Medium' },
  searchableEmpty: { minHeight: 72, justifyContent: 'center', alignItems: 'center', padding: 18 },
});
