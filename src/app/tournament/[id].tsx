import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Calendar from 'expo-calendar';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { apiFetch, ApiError } from '../../constants/api';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/colors';
import VenueRating from '../../components/VenueRating';

interface Player {
  id: number;
  username: string;
}

interface Team {
  id: number;
  name: string;
  captain: Player;
  members: Player[];
}

interface TournamentDetail {
  id: number;
  title: string;
  description?: string | null;
  city?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  format: 'single_elim' | 'round_robin';
  skill_level?: string | null;
  start_date?: string | null;
  team_size: number;
  max_teams?: number | null;
  status: 'registration' | 'in_progress' | 'completed';
  host: Player;
  team_count: number;
  teams: Team[];
}

interface TMatch {
  id: number;
  round: number;
  bracket_position: number;
  team_a?: Team | null;
  team_b?: Team | null;
  team_a_score?: number | null;
  team_b_score?: number | null;
  winner_team_id?: number | null;
  status: 'pending' | 'completed';
}

interface StandingRow {
  team: Team;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
}

const FORMAT_LABELS: Record<string, string> = { single_elim: 'Single Elimination', round_robin: 'Round Robin' };

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TournamentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, userToken } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [matches, setMatches] = useState<TMatch[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [creatingTeam, setCreatingTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');

  const [resultDraft, setResultDraft] = useState<Record<number, { a: string; b: string }>>({});

  const load = useCallback(async () => {
    try {
      const t = await apiFetch<TournamentDetail>(`/api/tournaments/${id}`, { token: userToken });
      setTournament(t);
      if (t.status !== 'registration') {
        const m = await apiFetch<TMatch[]>(`/api/tournaments/${id}/matches`, { token: userToken });
        setMatches(m);
        if (t.format === 'round_robin') {
          const s = await apiFetch<StandingRow[]>(`/api/tournaments/${id}/standings`, { token: userToken });
          setStandings(s);
        }
      }
    } catch (error) {
      console.warn('Failed to load tournament:', (error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id, userToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const isHost = !!(user && tournament && user.id === tournament.host.id);
  const myTeam = tournament?.teams.find((t) => t.members.some((m) => m.id === user?.id));

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) {
      Alert.alert('Error', 'Give your team a name.');
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/tournaments/${id}/teams`, { method: 'POST', token: userToken, body: { name: newTeamName.trim() } });
      setNewTeamName('');
      setCreatingTeam(false);
      await load();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not create team.';
      Alert.alert('Error', message);
    } finally {
      setBusy(false);
    }
  };

  const handleJoinTeam = async (teamId: number) => {
    setBusy(true);
    try {
      await apiFetch(`/api/tournaments/${id}/teams/${teamId}/join`, { method: 'POST', token: userToken });
      await load();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not join team.';
      Alert.alert('Error', message);
    } finally {
      setBusy(false);
    }
  };

  const handleLeaveTeam = async (teamId: number) => {
    setBusy(true);
    try {
      await apiFetch(`/api/tournaments/${id}/teams/${teamId}/leave`, { method: 'DELETE', token: userToken });
      await load();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not leave team.';
      Alert.alert('Error', message);
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateBracket = () => {
    Alert.alert('Start Tournament', 'This locks in the current teams and generates the schedule. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Generate',
        onPress: async () => {
          setBusy(true);
          try {
            await apiFetch(`/api/tournaments/${id}/generate-bracket`, { method: 'POST', token: userToken });
            await load();
          } catch (error) {
            const message = error instanceof ApiError ? error.message : 'Could not generate the bracket.';
            Alert.alert('Error', message);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const handleSubmitResult = async (matchId: number) => {
    const draft = resultDraft[matchId];
    if (!draft || draft.a.trim() === '' || draft.b.trim() === '') {
      Alert.alert('Error', 'Enter both scores.');
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/tournaments/${id}/matches/${matchId}/result`, {
        method: 'POST',
        token: userToken,
        body: { team_a_score: Number(draft.a), team_b_score: Number(draft.b) },
      });
      await load();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not submit result.';
      Alert.alert('Error', message);
    } finally {
      setBusy(false);
    }
  };

  const handleAddToCalendar = async () => {
    if (!tournament?.start_date) return;
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Needed', 'Allow calendar access to add this event.');
        return;
      }
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const defaultCalendar = calendars.find((c) => c.allowsModifications) || calendars[0];
      if (!defaultCalendar) {
        Alert.alert('No Calendar Found', 'Could not find a calendar to add this event to.');
        return;
      }
      const start = new Date(tournament.start_date);
      const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
      await Calendar.createEventAsync(defaultCalendar.id, {
        title: tournament.title,
        location: [tournament.address, tournament.city].filter(Boolean).join(', '),
        startDate: start,
        endDate: end,
        notes: tournament.description || undefined,
      });
      Alert.alert('Added', 'Added to your calendar.');
    } catch (error) {
      Alert.alert('Error', 'Could not add to calendar.');
    }
  };

  const handleShare = async () => {
    if (!tournament) return;
    const when = formatDate(tournament.start_date);
    const where = [tournament.address, tournament.city].filter(Boolean).join(', ');
    const lines = [tournament.title, FORMAT_LABELS[tournament.format], when, where].filter(Boolean);
    try {
      await Share.share({ message: lines.join('\n') });
    } catch (error) {
      console.warn('Failed to share tournament:', (error as Error).message);
    }
  };

  if (loading || !tournament) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.blue} />
      </View>
    );
  }

  const roundsMap = matches.reduce<Record<number, TMatch[]>>((acc, m) => {
    (acc[m.round] = acc[m.round] || []).push(m);
    return acc;
  }, {});
  const roundNumbers = Object.keys(roundsMap).map(Number).sort((a, b) => a - b);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>{tournament.title}</Text>
        <Text style={styles.hostText}>Hosted by @{tournament.host.username}</Text>
        {!!tournament.description && <Text style={styles.description}>{tournament.description}</Text>}

        <View style={styles.detailRow}>
          <MaterialIcons name="emoji-events" size={16} color={colors.blue} />
          <Text style={styles.detailText}>{FORMAT_LABELS[tournament.format]}</Text>
        </View>
        {formatDate(tournament.start_date) && (
          <View style={styles.detailRow}>
            <MaterialIcons name="event" size={16} color={colors.blue} />
            <Text style={styles.detailText}>{formatDate(tournament.start_date)}</Text>
          </View>
        )}
        {!!(tournament.address || tournament.city) && (
          <View style={styles.detailRow}>
            <MaterialIcons name="place" size={16} color={colors.blue} />
            <Text style={styles.detailText}>{[tournament.address, tournament.city].filter(Boolean).join(', ')}</Text>
          </View>
        )}
        {!!tournament.skill_level && (
          <View style={styles.detailRow}>
            <MaterialIcons name="sports-volleyball" size={16} color={colors.blue} />
            <Text style={styles.detailText}>{tournament.skill_level}</Text>
          </View>
        )}

        <View style={styles.actionButtonRow}>
          {tournament.start_date && (
            <TouchableOpacity style={styles.calendarButton} onPress={handleAddToCalendar}>
              <MaterialIcons name="event-available" size={16} color={colors.blue} />
              <Text style={styles.calendarButtonText}>Add to Calendar</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.calendarButton} onPress={handleShare}>
            <MaterialIcons name="share" size={16} color={colors.blue} />
            <Text style={styles.calendarButtonText}>Share</Text>
          </TouchableOpacity>
        </View>

        {isHost && tournament.status === 'registration' && (
          <TouchableOpacity style={styles.generateButton} onPress={handleGenerateBracket} disabled={busy || tournament.teams.length < 2}>
            <Text style={styles.buttonText}>{busy ? 'Working...' : 'Generate Bracket & Start'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {!!(tournament.address || tournament.city) && (
        <VenueRating
          address={tournament.address}
          city={tournament.city}
          latitude={tournament.latitude}
          longitude={tournament.longitude}
        />
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          Teams ({tournament.team_count}
          {tournament.max_teams ? ` / ${tournament.max_teams}` : ''})
        </Text>
        {tournament.teams.length === 0 && <Text style={styles.emptyText}>No teams registered yet.</Text>}
        {tournament.teams.map((team) => {
          const isMyTeam = team.id === myTeam?.id;
          const full = team.members.length >= tournament.team_size;
          return (
            <View key={team.id} style={styles.teamRow}>
              <View style={styles.teamInfo}>
                <Text style={styles.teamName}>{team.name}</Text>
                <Text style={styles.teamMeta}>
                  {team.members.length}/{tournament.team_size} · captain @{team.captain.username}
                </Text>
              </View>
              <View style={styles.teamActions}>
                {isMyTeam && (
                  <TouchableOpacity
                    style={styles.chatButton}
                    onPress={() => router.push(`/team-chat/${team.id}`)}
                  >
                    <MaterialIcons name="chat-bubble-outline" size={14} color={colors.blue} />
                    <Text style={styles.chatButtonText}>Chat</Text>
                  </TouchableOpacity>
                )}
                {tournament.status === 'registration' && (
                  isMyTeam ? (
                    <TouchableOpacity style={styles.leaveButton} onPress={() => handleLeaveTeam(team.id)} disabled={busy}>
                      <Text style={styles.leaveButtonText}>Leave</Text>
                    </TouchableOpacity>
                  ) : !myTeam && !full ? (
                    <TouchableOpacity style={styles.joinButton} onPress={() => handleJoinTeam(team.id)} disabled={busy}>
                      <Text style={styles.joinButtonText}>Join</Text>
                    </TouchableOpacity>
                  ) : null
                )}
              </View>
            </View>
          );
        })}

        {tournament.status === 'registration' && !myTeam && (
          creatingTeam ? (
            <View style={styles.createTeamBox}>
              <TextInput
                style={styles.input}
                placeholder="Team name"
                placeholderTextColor="#999"
                value={newTeamName}
                onChangeText={setNewTeamName}
              />
              <View style={styles.createTeamButtonRow}>
                <TouchableOpacity style={styles.createTeamSubmit} onPress={handleCreateTeam} disabled={busy}>
                  <Text style={styles.buttonText}>Create Team</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.createTeamCancel} onPress={() => setCreatingTeam(false)}>
                  <Text style={styles.createTeamCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.newTeamButton} onPress={() => setCreatingTeam(true)}>
              <MaterialIcons name="add" size={16} color={colors.blue} />
              <Text style={styles.newTeamButtonText}>Register a Team</Text>
            </TouchableOpacity>
          )
        )}
      </View>

      {tournament.format === 'round_robin' && standings.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Standings</Text>
          <View style={styles.standingsHeaderRow}>
            <Text style={[styles.standingsCell, styles.standingsTeamCell, styles.standingsHeaderText]}>Team</Text>
            <Text style={[styles.standingsCell, styles.standingsHeaderText]}>W</Text>
            <Text style={[styles.standingsCell, styles.standingsHeaderText]}>L</Text>
            <Text style={[styles.standingsCell, styles.standingsHeaderText]}>T</Text>
            <Text style={[styles.standingsCell, styles.standingsHeaderText]}>+/-</Text>
          </View>
          {standings.map((row, index) => (
            <View key={row.team.id} style={styles.standingsRow}>
              <Text style={[styles.standingsCell, styles.standingsTeamCell]}>
                {index + 1}. {row.team.name}
              </Text>
              <Text style={styles.standingsCell}>{row.wins}</Text>
              <Text style={styles.standingsCell}>{row.losses}</Text>
              <Text style={styles.standingsCell}>{row.ties}</Text>
              <Text style={styles.standingsCell}>{row.points_for - row.points_against}</Text>
            </View>
          ))}
        </View>
      )}

      {matches.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{tournament.format === 'single_elim' ? 'Bracket' : 'Matches'}</Text>
          {roundNumbers.map((round) => (
            <View key={round} style={styles.roundBlock}>
              {tournament.format === 'single_elim' && (
                <Text style={styles.roundLabel}>
                  {roundsMap[round].length === 1 ? 'Final' : `Round ${round}`}
                </Text>
              )}
              {roundsMap[round].map((m) => {
                const draft = resultDraft[m.id] || { a: '', b: '' };
                const canEnter = isHost && m.status === 'pending' && m.team_a && m.team_b;
                return (
                  <View key={m.id} style={styles.matchRow}>
                    <View style={styles.matchTeams}>
                      <Text style={[styles.matchTeamName, m.winner_team_id === m.team_a?.id && styles.matchTeamWinner]}>
                        {m.team_a?.name || 'TBD'}
                        {m.status === 'completed' ? `  ${m.team_a_score}` : ''}
                      </Text>
                      <Text style={styles.matchVs}>vs</Text>
                      <Text style={[styles.matchTeamName, m.winner_team_id === m.team_b?.id && styles.matchTeamWinner]}>
                        {m.team_b?.name || 'TBD'}
                        {m.status === 'completed' ? `  ${m.team_b_score}` : ''}
                      </Text>
                    </View>
                    {canEnter && (
                      <View style={styles.resultForm}>
                        <TextInput
                          style={styles.scoreInput}
                          placeholder="0"
                          placeholderTextColor="#999"
                          keyboardType="number-pad"
                          value={draft.a}
                          onChangeText={(v) => setResultDraft((prev) => ({ ...prev, [m.id]: { ...draft, a: v } }))}
                        />
                        <Text style={styles.scoreDash}>-</Text>
                        <TextInput
                          style={styles.scoreInput}
                          placeholder="0"
                          placeholderTextColor="#999"
                          keyboardType="number-pad"
                          value={draft.b}
                          onChangeText={(v) => setResultDraft((prev) => ({ ...prev, [m.id]: { ...draft, b: v } }))}
                        />
                        <TouchableOpacity style={styles.submitScoreButton} onPress={() => handleSubmitResult(m.id)} disabled={busy}>
                          <Text style={styles.submitScoreText}>Save</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    content: { padding: 16, paddingBottom: 40 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 18,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 1,
    },
    title: { fontSize: 20, fontWeight: '700', color: colors.text },
    hostText: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: 8 },
    description: { fontSize: 14, color: colors.text, marginBottom: 10 },
    detailRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    detailText: { fontSize: 14, color: colors.text, marginLeft: 8 },
    actionButtonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    calendarButton: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: colors.blue,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    calendarButtonText: { color: colors.blue, fontWeight: '600', fontSize: 13, marginLeft: 6 },
    generateButton: {
      backgroundColor: colors.blue,
      borderRadius: 8,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 12,
    },
    buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 },
    emptyText: { fontSize: 13, color: colors.textMuted },
    teamRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    teamInfo: { flex: 1 },
    teamName: { fontSize: 15, fontWeight: '700', color: colors.text },
    teamMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    teamActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    chatButton: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.blue,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 7,
      gap: 4,
    },
    chatButtonText: { color: colors.blue, fontWeight: '700', fontSize: 12 },
    joinButton: { backgroundColor: colors.blue, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
    joinButtonText: { color: '#fff', fontWeight: '700', fontSize: 12 },
    leaveButton: { borderWidth: 1, borderColor: colors.danger, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
    leaveButtonText: { color: colors.danger, fontWeight: '700', fontSize: 12 },
    newTeamButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.blue,
      borderRadius: 8,
      paddingVertical: 12,
      marginTop: 14,
    },
    newTeamButtonText: { color: colors.blue, fontWeight: '700', fontSize: 14, marginLeft: 6 },
    createTeamBox: { marginTop: 14 },
    input: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 15,
      color: colors.text,
      marginBottom: 10,
    },
    createTeamButtonRow: { flexDirection: 'row', gap: 10 },
    createTeamSubmit: { flex: 1, backgroundColor: colors.blue, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
    createTeamCancel: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
    createTeamCancelText: { color: colors.textMuted, fontWeight: '600' },
    standingsHeaderRow: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
    standingsRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
    standingsCell: { flex: 1, fontSize: 13, color: colors.text, textAlign: 'center' },
    standingsTeamCell: { flex: 2, textAlign: 'left', fontWeight: '600' },
    standingsHeaderText: { color: colors.textMuted, fontWeight: '700', fontSize: 12 },
    roundBlock: { marginBottom: 16 },
    roundLabel: { fontSize: 13, fontWeight: '700', color: colors.blue, marginBottom: 8 },
    matchRow: {
      backgroundColor: colors.background,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      marginBottom: 8,
    },
    matchTeams: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
    matchTeamName: { fontSize: 14, color: colors.text, fontWeight: '600' },
    matchTeamWinner: { color: colors.success },
    matchVs: { fontSize: 12, color: colors.textMuted, marginHorizontal: 8 },
    resultForm: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
    scoreInput: {
      width: 48,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 6,
      padding: 8,
      fontSize: 14,
      color: colors.text,
      textAlign: 'center',
    },
    scoreDash: { color: colors.textMuted },
    submitScoreButton: { backgroundColor: colors.blue, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8, marginLeft: 4 },
    submitScoreText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  });
