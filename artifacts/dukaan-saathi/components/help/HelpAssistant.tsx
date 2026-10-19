import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  answerHelpQuestion,
  getHelpGreeting,
  getHelpSuggestions,
  type HelpMessage,
  type HelpRole,
} from '@/services/helpAssistantKnowledge';

type HelpAssistantProps = {
  role: HelpRole;
  bottomOffset?: number;
  visible?: boolean;
};

const roleLabels: Record<HelpRole, string> = {
  guest: 'Guest help',
  customer: 'Customer help',
  merchant: 'Shop-owner help',
  admin: 'Admin help',
};

export function HelpAssistant({ role, bottomOffset = 18, visible = true }: HelpAssistantProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<HelpMessage[]>(() => [getHelpGreeting(role)]);
  const [reducedMotion, setReducedMotion] = useState(true);
  const messageList = useRef<FlatList<HelpMessage>>(null);
  const inputRef = useRef<TextInput>(null);
  const messageSequence = useRef(0);
  const float = useRef(new Animated.Value(0)).current;

  const safeBottom = Math.max(insets.bottom, Platform.OS === 'web' ? 24 : 12);
  const fabBottom = safeBottom + bottomOffset - 7;
  const panelBottom = fabBottom + 56 + 12;
  const panelWidth = Math.min(360, Math.max(180, viewportWidth - 24));
  const panelHeight = Math.min(
    500,
    Math.max(180, viewportHeight - insets.top - panelBottom - 20),
  );

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReducedMotion(enabled);
      })
      .catch(() => {
        if (active) setReducedMotion(true);
      });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    float.stopAnimation();
    float.setValue(0);
    if (!visible || isOpen || reducedMotion) return;

    const bob = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: -4,
          duration: 1_100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1_100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    bob.start();
    return () => bob.stop();
  }, [float, isOpen, reducedMotion, visible]);

  useEffect(() => {
    setMessages([getHelpGreeting(role)]);
    setDraft('');
  }, [role]);

  useEffect(() => {
    if (!visible) setIsOpen(false);
  }, [visible]);

  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      messageList.current?.scrollToEnd({ animated: !reducedMotion });
    });
  }, [isOpen, messages, reducedMotion]);

  const send = (text = draft) => {
    const question = text.trim().slice(0, 400);
    if (!question) return;

    const userMessage: HelpMessage = {
      id: `user-${++messageSequence.current}`,
      sender: 'user',
      text: question,
    };
    const assistantMessage: HelpMessage = {
      id: `assistant-${++messageSequence.current}`,
      sender: 'assistant',
      text: answerHelpQuestion(role, question),
    };
    setMessages((current) => [...current, userMessage, assistantMessage].slice(-30));
    setDraft('');
  };

  const close = () => {
    setIsOpen(false);
    setDraft('');
    setMessages([getHelpGreeting(role)]);
  };

  const renderMessage = ({ item }: { item: HelpMessage }) => {
    const isUser = item.sender === 'user';
    return (
      <View style={[styles.messageRow, isUser ? styles.userMessageRow : styles.assistantMessageRow]}>
        <View
          style={[
            styles.messageBubble,
            {
              backgroundColor: isUser ? colors.primary : colors.card,
              borderColor: isUser ? colors.primary : colors.border,
            },
          ]}
        >
          <Text
            accessibilityLiveRegion={isUser ? 'none' : 'polite'}
            style={[
              styles.messageText,
              { color: isUser ? colors.primaryForeground : colors.foreground },
            ]}
          >
            {item.text}
          </Text>
        </View>
      </View>
    );
  };

  const quickQuestions =
    messages.length === 1 ? (
      <View style={styles.suggestions}>
        <Text style={[styles.suggestionTitle, { color: colors.mutedForeground }]}>Try asking</Text>
        <View style={styles.suggestionList}>
          {getHelpSuggestions(role).map((suggestion) => (
            <Pressable
              key={suggestion}
              accessibilityRole="button"
              onPress={() => send(suggestion)}
              style={({ pressed }) => [
                styles.suggestionButton,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <Text style={[styles.suggestionText, { color: colors.foreground }]}>{suggestion}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    ) : null;

  if (!visible) return null;

  return (
    <KeyboardAvoidingView
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {isOpen ? (
        <View
          accessibilityLabel="Help Saathi chat panel"
          style={[
            styles.panel,
            {
              right: Math.max(12, insets.right + 12),
              bottom: panelBottom,
              width: panelWidth,
              height: panelHeight,
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={[styles.panelHeader, { borderBottomColor: colors.border }]}>
            <View style={[styles.headerIcon, { backgroundColor: colors.secondary }]}>
              <Feather name="message-circle" size={18} color={colors.primary} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={[styles.panelTitle, { color: colors.foreground }]}>Help Saathi</Text>
              <Text style={[styles.panelSubtitle, { color: colors.mutedForeground }]}>
                {roleLabels[role]} · stays on this device
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Minimize help chat"
              hitSlop={8}
              onPress={() => setIsOpen(false)}
              style={({ pressed }) => [
                styles.headerAction,
                { backgroundColor: pressed ? colors.secondary : 'transparent' },
              ]}
            >
              <Feather name="minus" size={20} color={colors.foreground} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close help chat and clear this conversation"
              hitSlop={8}
              onPress={close}
              style={({ pressed }) => [
                styles.headerAction,
                { backgroundColor: pressed ? colors.secondary : 'transparent' },
              ]}
            >
              <Feather name="x" size={19} color={colors.foreground} />
            </Pressable>
          </View>

          <FlatList
            ref={messageList}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            ListFooterComponent={quickQuestions}
            style={styles.messages}
            contentContainerStyle={styles.messagesContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            accessibilityLabel="Help conversation"
            onContentSizeChange={() => {
              if (isOpen) messageList.current?.scrollToEnd({ animated: !reducedMotion });
            }}
          />

          <View style={[styles.composer, { borderTopColor: colors.border }]}>
            <TextInput
              ref={inputRef}
              accessibilityLabel="Ask Help Saathi a question"
              placeholder="Ask a question"
              placeholderTextColor={colors.mutedForeground}
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={() => send()}
              maxLength={400}
              returnKeyType="send"
              blurOnSubmit={false}
              style={[
                styles.input,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send question"
              accessibilityState={{ disabled: !draft.trim() }}
              disabled={!draft.trim()}
              onPress={() => send()}
              style={({ pressed }) => [
                styles.sendButton,
                {
                  backgroundColor: colors.primary,
                  opacity: !draft.trim() ? 0.5 : pressed ? 0.8 : 1,
                },
              ]}
            >
              <Feather name="arrow-up" size={19} color={colors.primaryForeground} />
            </Pressable>
          </View>
        </View>
      ) : (
        <Animated.View
          style={[
            styles.fabPosition,
            {
              right: Math.max(16, insets.right + 16),
              bottom: fabBottom,
              transform: [{ translateY: float }],
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Help Saathi"
            accessibilityHint="Opens a compact chat with guidance about Dukaan Saathi"
            accessibilityState={{ expanded: isOpen }}
            testID="help-assistant-open"
            onPress={() => setIsOpen(true)}
            style={({ pressed }) => [
              styles.fab,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.84 : 1,
                shadowColor: colors.primary,
              },
            ]}
          >
            <Feather name="message-circle" size={23} color={colors.primaryForeground} />
          </Pressable>
        </Animated.View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fabPosition: {
    position: 'absolute',
    zIndex: 60,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.24,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  panel: {
    position: 'absolute',
    zIndex: 70,
    borderWidth: 1,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#18231D',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },
  panelHeader: {
    minHeight: 66,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: { flex: 1, gap: 2 },
  panelTitle: { fontSize: 14, fontWeight: '800' },
  panelSubtitle: { fontSize: 10, lineHeight: 14 },
  headerAction: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messages: { flex: 1 },
  messagesContent: { flexGrow: 1, gap: 10, padding: 13 },
  messageRow: { width: '100%', flexDirection: 'row' },
  assistantMessageRow: { justifyContent: 'flex-start' },
  userMessageRow: { justifyContent: 'flex-end' },
  messageBubble: {
    maxWidth: '90%',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  messageText: { fontSize: 12, lineHeight: 18 },
  suggestions: { gap: 7, paddingTop: 2 },
  suggestionTitle: { fontSize: 10, fontWeight: '700' },
  suggestionList: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  suggestionButton: {
    minHeight: 36,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  suggestionText: { fontSize: 10, fontWeight: '600' },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 12,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
