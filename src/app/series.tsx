import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { apiFetch, ApiError } from '../constants/api';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/colors';

interface SeriesUser {
  id: number;
  username: string;
}

interface SeriesEntry {
  id: number;
  title: string;
  city?: string | null;
  address?: string | null;
  recurrence: string;
  next_start: string;
  active: boolean;
  host: SeriesUser;
  co_host?: SeriesUser | null;
}

export default function SeriesScreen() {
  const { user, userToken } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [series, setSeries] = useState<SeriesEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const [editingCoHostId, setEditingCoHostId] = useState<number | null>(null);
  const [coHostDraft, setCoHostDraft] = useState('');
  const [savingCoHost, setSavingCoHost] = useState(false);

  const fetchSeries = useCallback(async () => {
    try {
      const data = await apiFetch<SeriesEntry[]>('/api/series', { token: userToken });
      setSeries(data);
    } catch (error) {
      console.warn('Failed to load recurring matches:', (error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userToken]);

  useFocusEffect(
    useCallback(() => {
      fetchSeries();
    }, [fetchSeries])
  );

  const handleCancel = (item: SeriesEntry) => {
    Alert.alert(
      'Cancel Recurring Match',
      `This stops "${item.title}" from repeating and cancels any already-scheduled upcoming matches for it. Matches that already happened stay as-is.`,
      [
        { text: 'Never mind', style: 'cancel' },
        {
          text: 'Cancel Series',
          style: 'destructive',
          onPress: async () => {
            setCancellingId(item.id);
            try {
              await apiFetch(`/api/series/${item.id}`, { method: 'DELETE', token: userToken });
              setSeries((prev) => prev.map((s) => (s.id === item.id ? { ...s, active: false } : s)));
            } catch (error) {
              const message = error instanceof ApiError ? error.message : 'Could not cancel this series.';
              Alert.alert('Error', message);
            } finally {
              setCancellingId(null);
            }
          },
        },
      ]
    );
  };

  const startEditingCoHost = (item: SeriesEntry) => {
    setEditingCoHostId(item.id);
    setCoHostDraft(item.co_host?.username || '');
  };

  const saveCoHost = async (item: SeriesEntry) => {
    setSavingCoHost(true);
    try {
      const updated = await apiFetch<SeriesEntry>(`/api/series/${item.id}/co-host`, {
        method: 'PATCH',
        token: userToken,
        body: { co_host_username: coHostDraft.trim() || null },
      });
      setSeries((prev) => prev.map((s) => (s.id === item.id ? updated : s)));
      setEditingCoHostId(null);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not set co-host.';
      Alert.alert('Error', message);
    } finally {
      setSavingCoHost(false);
    }
  };

  const removeCoHost = async (item: SeriesEntry) => {
    setSavingCoHost(true);
    try {
      const updated = await apiFetch<SeriesEntry>(`/api/series/${item.id}/co-host`, {
        method: 'PATCH',
        token: userToken,
        body: { co_host_username: null },
      });
      setSeries((prev) => prev.map((s) => (s.id === item.id ? updated : s)));
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not remove co-host.';
      Alert.alert('Error', message);
    } finally {
      setSavingCoHost(false);
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
      data={series}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => {
        const isRealHost = item.host.id === user?.id;
        return (
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <View style={styles.info}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.meta}>
                  {item.recurrence} · {[item.address, item.city].filter(Boolean).join(', ') || 'No location set'}
                </Text>
                <Text style={styles.meta}>
                  {item.active
                    ? `Next: ${new Date(item.next_start).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`
                    : 'Cancelled'}
                </Text>
              </View>
              {item.active && (
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => handleCancel(item)}
                  disabled={cancellingId === item.id}
                >
                  {cancellingId === item.id ? (
                    <ActivityIndicator size="small" color={colors.danger} />
                  ) : (
                    <Text style={styles.cancelText}>Cancel</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {item.active && isRealHost && (
              <View style={styles.coHostSection}>
                {editingCoHostId === item.id ? (
                  <View style={styles.coHostEditRow}>
                    <TextInput
                      style={styles.coHostInput}
                      value={coHostDraft}
                      onChangeText={setCoHostDraft}
                      placeholder="@username"
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      style={styles.coHostSaveButton}
                      onPress={() => saveCoHost(item)}
                      disabled={savingCoHost}
                    >
                      {savingCoHost ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.coHostSaveText}>Save</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setEditingCoHostId(null)}>
                      <Text style={styles.coHostCancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ) : item.co_host ? (
                  <View style={styles.coHostEditRow}>
                    <MaterialIcons name="person" size={14} color={colors.textMuted} />
                    <Text style={styles.coHostText}>Co-host: @{item.co_host.username}</Text>
                    <TouchableOpacity onPress={() => startEditingCoHost(item)}>
                      <Text style={styles.coHostLink}>Change</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeCoHost(item)} disabled={savingCoHost}>
                      <Text style={[styles.coHostLink, { color: colors.danger }]}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => startEditingCoHost(item)}>
                    <Text style={styles.coHostLink}>+ Add a co-host</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            {item.active && !isRealHost && item.co_host && (
              <Text style={styles.coHostText}>You're co-hosting for @{item.host.username}</Text>
            )}
          </View>
        );
      }}
      ListEmptyComponent={
        <View style={styles.centered}>
          <MaterialIcons name="event-repeat" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>
            No recurring matches yet. Pick Weekly or Biweekly when hosting to set one up.
          </Text>
        </View>
      }
    />
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  emptyText: { fontSize: 15, color: colors.textMuted, textAlign: 'center' },
  listContent: { padding: 16 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  info: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 3 },
  cancelButton: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 10,
  },
  cancelText: { color: colors.danger, fontWeight: '600', fontSize: 13 },
  coHostSection: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  coHostEditRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coHostText: { fontSize: 12, color: colors.textMuted, marginLeft: 4, flex: 1 },
  coHostLink: { fontSize: 12, fontWeight: '700', color: colors.blue },
  coHostInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: colors.text,
  },
  coHostSaveButton: { backgroundColor: colors.blue, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  coHostSaveText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  coHostCancelText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
});
