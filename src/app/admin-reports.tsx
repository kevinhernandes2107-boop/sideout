import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../constants/api';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/colors';

interface Report {
  id: number;
  reporter: { username: string };
  reported: { username: string };
  reason: string;
  resolved: boolean;
  created_at: string;
}

export default function AdminReportsScreen() {
  const { userToken } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  const fetchReports = useCallback(async () => {
    try {
      const data = await apiFetch<Report[]>('/api/reports', { token: userToken });
      setReports(data);
    } catch (error) {
      console.warn('Failed to load reports:', (error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userToken]);

  useFocusEffect(
    useCallback(() => {
      fetchReports();
    }, [fetchReports])
  );

  const resolve = async (id: number) => {
    setResolvingId(id);
    try {
      await apiFetch(`/api/reports/${id}/resolve`, { method: 'POST', token: userToken });
      setReports((prev) => prev.map((r) => (r.id === id ? { ...r, resolved: true } : r)));
    } catch (error) {
      console.warn('Failed to resolve report:', (error as Error).message);
    } finally {
      setResolvingId(null);
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
      data={reports}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <View style={[styles.card, item.resolved && styles.cardResolved]}>
          <Text style={styles.reportLine}>
            @{item.reporter.username} reported @{item.reported.username}
          </Text>
          <Text style={styles.reason}>{item.reason}</Text>
          <Text style={styles.time}>{new Date(item.created_at).toLocaleString()}</Text>
          {!item.resolved && (
            <TouchableOpacity style={styles.resolveButton} onPress={() => resolve(item.id)} disabled={resolvingId === item.id}>
              {resolvingId === item.id ? (
                <ActivityIndicator size="small" color={colors.blue} />
              ) : (
                <>
                  <MaterialIcons name="check" size={16} color={colors.blue} />
                  <Text style={styles.resolveButtonText}>Mark Resolved</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}
      ListEmptyComponent={
        <View style={styles.centered}>
          <MaterialIcons name="flag" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>No reports.</Text>
        </View>
      }
    />
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
    emptyText: { fontSize: 15, color: colors.textMuted },
    listContent: { padding: 16 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardResolved: { opacity: 0.55 },
    reportLine: { fontSize: 14, fontWeight: '700', color: colors.text },
    reason: { fontSize: 13, color: colors.text, marginTop: 4 },
    time: { fontSize: 11, color: colors.textMuted, marginTop: 6 },
    resolveButton: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: colors.blue,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginTop: 10,
    },
    resolveButtonText: { color: colors.blue, fontWeight: '600', fontSize: 12, marginLeft: 4 },
  });
