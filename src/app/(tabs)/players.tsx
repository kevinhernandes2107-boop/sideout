import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../constants/api';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/colors';
import { RatingSummary } from '../../components/StarRating';

interface Player {
  id: number;
  username: string;
  pfp?: string | null;
  position?: string | null;
  skill_level?: string | null;
  city?: string | null;
}

interface RatingInfo {
  average: number | null;
  count: number;
}

const POSITION_FILTERS = ['All', 'Setter', 'Outside', 'Middle', 'Opposite', 'Libero', 'DS'];
const SKILL_FILTERS = ['All', 'Beginner', 'Intermediate', 'Advanced', 'Competitive'];

export default function PlayersScreen() {
  const router = useRouter();
  const { userToken } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [ratings, setRatings] = useState<Record<number, RatingInfo>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [positionFilter, setPositionFilter] = useState('All');
  const [skillFilter, setSkillFilter] = useState('All');
  const [citySearch, setCitySearch] = useState('');

  const fetchPlayers = useCallback(async () => {
    try {
      const data = await apiFetch<Player[]>('/api/users', { token: userToken });
      setPlayers(data);

      const summaries = await Promise.all(
        data.map((p) =>
          apiFetch<RatingInfo>(`/api/users/${p.id}/rating-summary`, { token: userToken })
            .then((r) => [p.id, r] as const)
            .catch(() => [p.id, { average: null, count: 0 }] as const)
        )
      );
      setRatings(Object.fromEntries(summaries));
    } catch (error) {
      console.warn('Failed to load players:', (error as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userToken]);

  useFocusEffect(
    useCallback(() => {
      fetchPlayers();
    }, [fetchPlayers])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchPlayers();
  };

  const filteredPlayers = useMemo(() => {
    return players.filter((p) => {
      if (positionFilter !== 'All' && p.position !== positionFilter) return false;
      if (skillFilter !== 'All' && p.skill_level !== skillFilter) return false;
      if (citySearch.trim() && !(p.city || '').toLowerCase().includes(citySearch.trim().toLowerCase())) return false;
      return true;
    });
  }, [players, positionFilter, skillFilter, citySearch]);

  const renderPlayer = ({ item }: { item: Player }) => {
    const rating = ratings[item.id];
    return (
      <TouchableOpacity style={styles.card} onPress={() => router.push(`/player/${item.id}`)}>
        {item.pfp ? (
          <Image source={{ uri: item.pfp }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarFallbackText}>🏐</Text>
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.username}>@{item.username}</Text>
          {!!(item.position || item.skill_level) && (
            <Text style={styles.meta}>{[item.position, item.skill_level].filter(Boolean).join(' · ')}</Text>
          )}
          {!!item.city && <Text style={styles.meta}>{item.city}</Text>}
          {rating && rating.count > 0 && (
            <View style={styles.ratingRow}>
              <RatingSummary average={rating.average} count={rating.count} />
            </View>
          )}
        </View>
        <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <MaterialIcons name="people" size={22} color={colors.blue} />
        <Text style={styles.headerTitle}>Players</Text>
      </View>

      <View style={styles.filterSection}>
        <TextInput
          style={styles.citySearch}
          placeholder="Search city..."
          placeholderTextColor={colors.textMuted}
          value={citySearch}
          onChangeText={setCitySearch}
        />
        <FlatList
          data={POSITION_FILTERS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(s) => `pos-${s}`}
          contentContainerStyle={styles.chipRow}
          renderItem={({ item: p }) => (
            <TouchableOpacity
              style={[styles.chip, positionFilter === p && styles.chipActive]}
              onPress={() => setPositionFilter(p)}
            >
              <Text style={[styles.chipText, positionFilter === p && styles.chipTextActive]}>{p}</Text>
            </TouchableOpacity>
          )}
        />
        <FlatList
          data={SKILL_FILTERS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(s) => `skill-${s}`}
          contentContainerStyle={styles.chipRow}
          renderItem={({ item: s }) => (
            <TouchableOpacity
              style={[styles.skillChip, skillFilter === s && styles.skillChipActive]}
              onPress={() => setSkillFilter(s)}
            >
              <Text style={[styles.chipText, skillFilter === s && styles.skillChipTextActive]}>{s}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.blue} />
        </View>
      ) : (
        <FlatList
          data={filteredPlayers}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderPlayer}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <MaterialIcons name="people-outline" size={44} color={colors.textMuted} />
              <Text style={styles.emptyText}>No players match your filters.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginLeft: 6 },
    filterSection: { paddingHorizontal: 20, marginBottom: 4 },
    citySearch: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 13,
      color: colors.text,
      marginBottom: 8,
    },
    chipRow: { paddingVertical: 2 },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginRight: 8,
      backgroundColor: colors.surface,
    },
    chipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
    chipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
    chipTextActive: { color: '#fff' },
    skillChip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginRight: 8,
      backgroundColor: colors.surface,
    },
    skillChipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
    skillChipTextActive: { color: colors.navy, fontWeight: '700' },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
    emptyText: { fontSize: 15, color: colors.textMuted },
    listContent: { padding: 20, paddingTop: 8 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
    },
    avatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
    avatarFallback: {
      width: 48,
      height: 48,
      borderRadius: 24,
      marginRight: 12,
      backgroundColor: '#0057B815',
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarFallbackText: { fontSize: 22 },
    info: { flex: 1 },
    username: { fontSize: 16, fontWeight: '700', color: colors.text },
    meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
    ratingRow: { marginTop: 4 },
  });
