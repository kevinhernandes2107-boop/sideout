import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Image, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { apiFetch, ApiError } from '../constants/api';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/colors';

interface BlockedEntry {
  user: {
    id: number;
    username: string;
    pfp?: string | null;
  };
}

export default function BlockedUsersScreen() {
  const { userToken } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [blocked, setBlocked] = useState<BlockedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblockingId, setUnblockingId] = useState<number | null>(null);

  const fetchBlocked = useCallback(async () => {
    try {
      const data = await apiFetch<BlockedEntry[]>('/api/blocked-users', { token: userToken });
      setBlocked(data);
    } catch (error) {
      console.warn('Failed to load blocked users:', (error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userToken]);

  useFocusEffect(
    useCallback(() => {
      fetchBlocked();
    }, [fetchBlocked])
  );

  const handleUnblock = async (userId: number) => {
    setUnblockingId(userId);
    try {
      await apiFetch(`/api/users/${userId}/block`, { method: 'DELETE', token: userToken });
      setBlocked((prev) => prev.filter((b) => b.user.id !== userId));
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not unblock this user.';
      Alert.alert('Error', message);
    } finally {
      setUnblockingId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.blue} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={blocked}
      keyExtractor={(item) => String(item.user.id)}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <View style={styles.card}>
          {item.user.pfp ? (
            <Image source={{ uri: item.user.pfp }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>🏐</Text>
            </View>
          )}
          <Text style={styles.username}>@{item.user.username}</Text>
          <TouchableOpacity
            style={styles.unblockButton}
            onPress={() => handleUnblock(item.user.id)}
            disabled={unblockingId === item.user.id}
          >
            {unblockingId === item.user.id ? (
              <ActivityIndicator size="small" color={colors.blue} />
            ) : (
              <Text style={styles.unblockText}>Unblock</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
      ListEmptyComponent={
        <View style={styles.centered}>
          <MaterialIcons name="block" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>You haven't blocked anyone.</Text>
        </View>
      }
    />
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  emptyText: { fontSize: 15, color: colors.textMuted },
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
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    backgroundColor: '#0057B815',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarFallbackText: { fontSize: 18 },
  username: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  unblockButton: {
    borderWidth: 1,
    borderColor: colors.blue,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  unblockText: { color: colors.blue, fontWeight: '600', fontSize: 13 },
});
