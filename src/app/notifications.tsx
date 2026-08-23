import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../constants/api';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/colors';

interface Notification {
  id: number;
  type: string;
  message: string;
  related_match_id?: number | null;
  related_user_id?: number | null;
  related_tournament_id?: number | null;
  read: boolean;
  created_at: string;
}

const ICONS: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  rsvp: 'event-available',
  waitlist_promoted: 'upgrade',
  direct_message: 'chat-bubble',
  match_message: 'forum',
  match_cancelled: 'event-busy',
  team_message: 'forum',
  tournament_team_joined: 'group-add',
  tournament_started: 'emoji-events',
  tournament_next_match: 'sports-volleyball',
  tournament_result: 'scoreboard',
  tournament_completed: 'military-tech',
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { userToken } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await apiFetch<Notification[]>('/api/notifications', { token: userToken });
      setNotifications(data);
    } catch (error) {
      console.warn('Failed to load notifications:', (error as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userToken]);

  useFocusEffect(
    useCallback(() => {
      fetchNotifications();
    }, [fetchNotifications])
  );

  const handlePress = async (notif: Notification) => {
    if (!notif.read) {
      setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)));
      apiFetch(`/api/notifications/${notif.id}/read`, { method: 'POST', token: userToken }).catch(() => {});
    }

    if (notif.type === 'direct_message' && notif.related_user_id) {
      router.push(`/chat/${notif.related_user_id}`);
    } else if (notif.related_tournament_id) {
      router.push(`/tournament/${notif.related_tournament_id}`);
    } else if (notif.related_match_id) {
      router.push(`/match/${notif.related_match_id}`);
    }
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.blue} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchNotifications();
              }}
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.card, !item.read && styles.cardUnread]} onPress={() => handlePress(item)}>
              <View style={styles.iconWrap}>
                <MaterialIcons name={ICONS[item.type] || 'notifications'} size={20} color={colors.blue} />
              </View>
              <View style={styles.info}>
                <Text style={styles.message}>{item.message}</Text>
                <Text style={styles.time}>{new Date(item.created_at).toLocaleString()}</Text>
              </View>
              {!item.read && <View style={styles.unreadDot} />}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.centered}>
              <MaterialIcons name="notifications-none" size={48} color={colors.textMuted} />
              <Text style={styles.emptyText}>Nothing yet — RSVPs, messages, and match updates show up here.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  emptyText: { fontSize: 15, color: colors.textMuted, textAlign: 'center' },
  listContent: { padding: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardUnread: { borderColor: colors.blue, backgroundColor: '#0057B80A' },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0057B815',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  info: { flex: 1 },
  message: { fontSize: 14, color: colors.text, lineHeight: 20 },
  time: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold, marginLeft: 8 },
});
