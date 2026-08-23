import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { apiFetch, ApiError } from '../../constants/api';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/colors';

interface Sender {
  id: number;
  username: string;
}

interface TeamMessage {
  id: number;
  team_id: number;
  sender: Sender;
  body: string;
  created_at: string;
}

const POLL_INTERVAL_MS = 3000;

export default function TeamChatScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const { user, userToken } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const data = await apiFetch<TeamMessage[]>(`/api/teams/${teamId}/messages`, { token: userToken });
      setMessages(data);
    } catch (error) {
      console.warn('Failed to load team messages:', (error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [teamId, userToken]);

  useFocusEffect(
    useCallback(() => {
      fetchMessages();
      intervalRef.current = setInterval(fetchMessages, POLL_INTERVAL_MS);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }, [fetchMessages])
  );

  const handleSend = async () => {
    const body = draft.trim();
    if (!body) return;

    setSending(true);
    setDraft('');
    try {
      const message = await apiFetch<TeamMessage>(`/api/teams/${teamId}/messages`, {
        method: 'POST',
        body: { body },
        token: userToken,
      });
      setMessages((prev) => [...prev, message]);
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'Could not send message.';
      console.warn('Failed to send team message:', msg);
      setDraft(body);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item, index }: { item: TeamMessage; index: number }) => {
    const isMine = item.sender.id === user?.id;
    const prev = messages[index - 1];
    const showSender = !isMine && (!prev || prev.sender.id !== item.sender.id);
    return (
      <View style={[styles.bubbleRow, isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
        <View style={{ maxWidth: '78%' }}>
          {showSender && <Text style={styles.senderLabel}>@{item.sender.username}</Text>}
          <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
            <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{item.body}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.blue} />
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMessage}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No messages yet — coordinate with your team here.</Text>
            </View>
          }
        />
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Message your team..."
          placeholderTextColor="#999"
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={sending || !draft.trim()}>
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 15, color: colors.textMuted, textAlign: 'center' },
  listContent: { padding: 16, paddingBottom: 8 },
  bubbleRow: { flexDirection: 'row', marginBottom: 8 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  senderLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, marginBottom: 2, marginLeft: 4 },
  bubble: { maxWidth: '100%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { backgroundColor: colors.blue, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, color: colors.text },
  bubbleTextMine: { color: '#fff' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: colors.blue,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  sendButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
