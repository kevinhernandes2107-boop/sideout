import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
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
import StarRating from '../../components/StarRating';
import MatchScheduler, { type Recurrence, type ScheduledOccurrence } from '../../components/MatchScheduler';
import VenueRating from '../../components/VenueRating';

const SKILL_LEVELS = ['All Levels', 'Beginner', 'Intermediate', 'Advanced', 'Competitive'];
const RECURRENCE_OPTIONS: Recurrence[] = ['None', 'Weekly', 'Biweekly'];
const POLL_INTERVAL_MS = 4000;

interface Player {
  id: number;
  username: string;
  pfp?: string | null;
}

interface RosterEntry {
  user: Player;
  waitlisted: boolean;
}

interface MatchDetail {
  id: number;
  title: string;
  city?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  skill_level?: string | null;
  max_players?: number | null;
  recurrence?: string | null;
  series_id?: number | null;
  host: Player;
  co_host?: Player | null;
  rsvp_count: number;
  going: boolean;
  waitlist_count: number;
  on_waitlist: boolean;
  roster: RosterEntry[];
}

interface ChatMessage {
  id: number;
  sender: Player;
  body: string;
  created_at: string;
}

function formatTimeRange(start?: string | null, end?: string | null) {
  if (!start) return null;
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return null;

  const datePart = startDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const startTimePart = startDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  const endDate = end ? new Date(end) : null;
  if (endDate && !Number.isNaN(endDate.getTime())) {
    const endTimePart = endDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${datePart} · ${startTimePart} – ${endTimePart}`;
  }
  return `${datePart} · ${startTimePart}`;
}

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, userToken } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [rsvping, setRsvping] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    city: '',
    address: '',
    skillLevel: 'All Levels',
    maxPlayers: '',
    recurrence: 'None' as Recurrence,
  });
  const [editOccurrences, setEditOccurrences] = useState<ScheduledOccurrence[]>([]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [ratingBusy, setRatingBusy] = useState<number | null>(null);

  const fetchMatch = useCallback(async () => {
    try {
      const data = await apiFetch<MatchDetail>(`/api/matches/${id}`, { token: userToken });
      setMatch(data);
    } catch (error) {
      console.warn('Failed to load match:', (error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id, userToken]);

  const fetchMessages = useCallback(async () => {
    try {
      const data = await apiFetch<ChatMessage[]>(`/api/matches/${id}/messages`, { token: userToken });
      setMessages(data);
    } catch (error) {
      console.warn('Failed to load match chat:', (error as Error).message);
    }
  }, [id, userToken]);

  useFocusEffect(
    useCallback(() => {
      fetchMatch();
      fetchMessages();
      pollRef.current = setInterval(fetchMessages, POLL_INTERVAL_MS);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }, [fetchMatch, fetchMessages])
  );

  const isHost = !!(user && match && user.id === match.host.id);
  const isCoHost = !!(user && match && match.co_host && user.id === match.co_host.id);
  const isManager = isHost || isCoHost;
  const isParticipant = !!(user && match && match.roster.some((r) => r.user.id === user.id && !r.waitlisted));
  const canPostChat = isManager || isParticipant;
  const isPast = !!(match?.start_time && new Date(match.start_time).getTime() < Date.now());
  const wasInMatch = !!(user && match && (isManager || match.roster.some((r) => r.user.id === user.id)));

  const toggleRsvp = async () => {
    if (!match) return;
    setRsvping(true);
    try {
      await apiFetch<MatchDetail>(`/api/matches/${match.id}/rsvp`, {
        method: match.going || match.on_waitlist ? 'DELETE' : 'POST',
        token: userToken,
      });
      await fetchMatch();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not update RSVP.';
      Alert.alert('RSVP Failed', message);
    } finally {
      setRsvping(false);
    }
  };

  const startEditing = () => {
    if (!match) return;
    setEditForm({
      title: match.title,
      city: match.city || '',
      address: match.address || '',
      skillLevel: match.skill_level || 'All Levels',
      maxPlayers: match.max_players ? String(match.max_players) : '',
      recurrence: (match.recurrence as Recurrence) || 'None',
    });
    setEditOccurrences(
      match.start_time
        ? [{ startTime: new Date(match.start_time), endTime: match.end_time ? new Date(match.end_time) : null }]
        : []
    );
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!match) return;
    const occurrence = editOccurrences[0] || null;
    if (occurrence?.endTime && occurrence.endTime <= occurrence.startTime) {
      Alert.alert('Invalid Time', 'End time must be after the start time.');
      return;
    }

    setIsSaving(true);
    try {
      await apiFetch(`/api/matches/${match.id}`, {
        method: 'PATCH',
        token: userToken,
        body: {
          title: editForm.title.trim(),
          city: editForm.city.trim() || null,
          address: editForm.address.trim() || null,
          start_time: occurrence ? occurrence.startTime.toISOString() : null,
          end_time: occurrence?.endTime ? occurrence.endTime.toISOString() : null,
          skill_level: editForm.skillLevel,
          max_players: editForm.maxPlayers.trim() ? Number(editForm.maxPlayers.trim()) : null,
          recurrence: editForm.recurrence === 'None' ? null : editForm.recurrence,
        },
      });
      setIsEditing(false);
      await fetchMatch();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not save changes.';
      Alert.alert('Update Failed', message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelMatch = () => {
    if (!match) return;
    Alert.alert('Cancel Match', 'This removes the match for everyone. Are you sure?', [
      { text: 'Never mind', style: 'cancel' },
      {
        text: 'Cancel Match',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiFetch(`/api/matches/${match.id}`, { method: 'DELETE', token: userToken });
            router.back();
          } catch (error) {
            const message = error instanceof ApiError ? error.message : 'Could not cancel the match.';
            Alert.alert('Error', message);
          }
        },
      },
    ]);
  };

  const handleCancelSeries = () => {
    if (!match?.series_id) return;
    const seriesId = match.series_id;
    Alert.alert(
      'Cancel Recurring Series',
      'This stops the whole series from repeating and cancels any already-scheduled upcoming matches for it. This match stays as-is.',
      [
        { text: 'Never mind', style: 'cancel' },
        {
          text: 'Cancel Series',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch(`/api/series/${seriesId}`, { method: 'DELETE', token: userToken });
              Alert.alert('Series Cancelled', 'No more matches will be generated for this series.');
              await fetchMatch();
            } catch (error) {
              const message = error instanceof ApiError ? error.message : 'Could not cancel the series.';
              Alert.alert('Error', message);
            }
          },
        },
      ]
    );
  };

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || !match) return;
    setSending(true);
    setDraft('');
    try {
      const message = await apiFetch<ChatMessage>(`/api/matches/${match.id}/messages`, {
        method: 'POST',
        body: { body },
        token: userToken,
      });
      setMessages((prev) => [...prev, message]);
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'Could not send message.';
      Alert.alert('Error', msg);
      setDraft(body);
    } finally {
      setSending(false);
    }
  };

  const handleAddToCalendar = async () => {
    if (!match?.start_time) return;
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
      const start = new Date(match.start_time);
      const end = match.end_time ? new Date(match.end_time) : new Date(start.getTime() + 2 * 60 * 60 * 1000);
      await Calendar.createEventAsync(defaultCalendar.id, {
        title: match.title,
        location: [match.address, match.city].filter(Boolean).join(', '),
        startDate: start,
        endDate: end,
      });
      Alert.alert('Added', 'Added to your calendar.');
    } catch (error) {
      Alert.alert('Error', 'Could not add to calendar.');
    }
  };

  const submitRating = async (ratee_id: number, sportsmanship: number) => {
    if (!match) return;
    setRatingBusy(ratee_id);
    setRatings((prev) => ({ ...prev, [ratee_id]: sportsmanship }));
    try {
      await apiFetch(`/api/matches/${match.id}/ratings`, {
        method: 'POST',
        token: userToken,
        body: { ratee_id, sportsmanship },
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not submit rating.';
      Alert.alert('Error', message);
    } finally {
      setRatingBusy(null);
    }
  };

  if (loading || !match) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.blue} />
      </View>
    );
  }

  const when = formatTimeRange(match.start_time, match.end_time);
  const rateable = match.roster
    .filter((r) => !r.waitlisted && r.user.id !== user?.id)
    .concat(isManager ? [] : [{ user: match.host, waitlisted: false }])
    .filter((entry, index, arr) => arr.findIndex((e) => e.user.id === entry.user.id) === index);

  const handleShare = async () => {
    if (!match) return;
    const when = formatTimeRange(match.start_time, match.end_time);
    const where = [match.address, match.city].filter(Boolean).join(', ');
    const lines = [match.title, when, where].filter(Boolean);
    try {
      await Share.share({ message: lines.join('\n') });
    } catch (error) {
      console.warn('Failed to share match:', (error as Error).message);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {isEditing ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Edit Match</Text>
            <TextInput style={styles.input} value={editForm.title} onChangeText={(v) => setEditForm({ ...editForm, title: v })} placeholder="Title" placeholderTextColor="#999" />

            <Text style={styles.label}>Recurrence</Text>
            <View style={styles.pillRow}>
              {RECURRENCE_OPTIONS.map((opt) => (
                <TouchableOpacity key={opt} style={[styles.pill, editForm.recurrence === opt && styles.pillSelected]} onPress={() => setEditForm({ ...editForm, recurrence: opt })}>
                  <Text style={[styles.pillText, editForm.recurrence === opt && styles.pillTextSelected]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <MatchScheduler
              recurrence={editForm.recurrence}
              initialStartTime={editOccurrences[0]?.startTime || null}
              initialEndTime={editOccurrences[0]?.endTime || null}
              onChange={setEditOccurrences}
            />

            <TextInput style={styles.input} value={editForm.address} onChangeText={(v) => setEditForm({ ...editForm, address: v })} placeholder="Address" placeholderTextColor="#999" />
            <TextInput style={styles.input} value={editForm.city} onChangeText={(v) => setEditForm({ ...editForm, city: v })} placeholder="City" placeholderTextColor="#999" />
            <TextInput style={styles.input} value={editForm.maxPlayers} onChangeText={(v) => setEditForm({ ...editForm, maxPlayers: v })} placeholder="Max players" placeholderTextColor="#999" keyboardType="number-pad" />

            <Text style={styles.label}>Skill Level</Text>
            <View style={styles.pillRow}>
              {SKILL_LEVELS.map((level) => (
                <TouchableOpacity key={level} style={[styles.pill, editForm.skillLevel === level && styles.pillSelected]} onPress={() => setEditForm({ ...editForm, skillLevel: level })}>
                  <Text style={[styles.pillText, editForm.skillLevel === level && styles.pillTextSelected]}>{level}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.editButtonRow}>
              <TouchableOpacity style={styles.saveButton} onPress={handleSaveEdit} disabled={isSaving}>
                <Text style={styles.buttonText}>{isSaving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelEditButton} onPress={() => setIsEditing(false)}>
                <Text style={styles.cancelEditText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{match.title}</Text>
              {!!match.recurrence && (
                <View style={styles.recurrenceBadge}>
                  <MaterialIcons name="repeat" size={13} color={colors.navy} />
                  <Text style={styles.recurrenceText}>{match.recurrence}</Text>
                </View>
              )}
            </View>
            <Text style={styles.hostText}>
              Hosted by @{match.host.username}
              {match.co_host ? ` · co-hosted by @${match.co_host.username}` : ''}
            </Text>

            {when && (
              <View style={styles.detailRow}>
                <MaterialIcons name="event" size={16} color={colors.blue} />
                <Text style={styles.detailText}>{when}</Text>
              </View>
            )}
            {!!match.series_id && (
              <View style={styles.detailRow}>
                <MaterialIcons name="event-repeat" size={16} color={colors.blue} />
                <Text style={styles.detailText}>Part of a recurring series</Text>
              </View>
            )}
            <View style={styles.actionButtonRow}>
              {match.start_time && (
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
            {!!(match.address || match.city) && (
              <View style={styles.detailRow}>
                <MaterialIcons name="place" size={16} color={colors.blue} />
                <Text style={styles.detailText}>{[match.address, match.city].filter(Boolean).join(', ')}</Text>
              </View>
            )}
            {!!match.skill_level && (
              <View style={styles.detailRow}>
                <MaterialIcons name="sports-volleyball" size={16} color={colors.blue} />
                <Text style={styles.detailText}>{match.skill_level}</Text>
              </View>
            )}

            <View style={styles.rsvpRow}>
              <Text style={styles.rosterCount}>
                {match.rsvp_count}
                {match.max_players ? ` / ${match.max_players}` : ''} going
                {match.waitlist_count > 0 ? ` · ${match.waitlist_count} waitlisted` : ''}
              </Text>
              {!isManager && (
                <TouchableOpacity
                  style={[styles.rsvpButton, (match.going || match.on_waitlist) && styles.rsvpButtonActive]}
                  onPress={toggleRsvp}
                  disabled={rsvping}
                >
                  {rsvping ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.rsvpButtonText}>
                      {match.on_waitlist ? 'Leave Waitlist' : match.going ? "I'm Out" : match.max_players && match.rsvp_count >= match.max_players ? 'Join Waitlist' : "I'm In"}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {isManager && (
              <View style={styles.hostButtonRow}>
                <TouchableOpacity style={styles.editButton} onPress={startEditing}>
                  <MaterialIcons name="edit" size={16} color={colors.blue} />
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelMatchButton} onPress={handleCancelMatch}>
                  <MaterialIcons name="delete-outline" size={16} color={colors.danger} />
                  <Text style={styles.cancelMatchText}>Cancel Match</Text>
                </TouchableOpacity>
                {!!match.series_id && (
                  <TouchableOpacity style={styles.cancelMatchButton} onPress={handleCancelSeries}>
                    <MaterialIcons name="event-busy" size={16} color={colors.danger} />
                    <Text style={styles.cancelMatchText}>Cancel Series</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

        {!!(match.address || match.city) && (
          <VenueRating
            address={match.address}
            city={match.city}
            latitude={match.latitude}
            longitude={match.longitude}
          />
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Roster</Text>
          {match.roster.length === 0 ? (
            <Text style={styles.emptyText}>No one has RSVP'd yet.</Text>
          ) : (
            match.roster.map((entry) => (
              <View key={entry.user.id} style={styles.rosterRow}>
                {entry.user.pfp ? (
                  <Image source={{ uri: entry.user.pfp }} style={styles.rosterAvatar} />
                ) : (
                  <View style={styles.rosterAvatarFallback}>
                    <Text style={{ fontSize: 14 }}>🏐</Text>
                  </View>
                )}
                <Text style={styles.rosterName}>@{entry.user.username}</Text>
                {entry.waitlisted && <Text style={styles.waitlistTag}>Waitlist</Text>}
              </View>
            ))
          )}
        </View>

        {isPast && wasInMatch && rateable.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Rate Your Teammates</Text>
            {rateable.map((entry) => (
              <View key={entry.user.id} style={styles.rateRow}>
                <Text style={styles.rosterName}>@{entry.user.username}</Text>
                {ratingBusy === entry.user.id ? (
                  <ActivityIndicator size="small" color={colors.blue} />
                ) : (
                  <StarRating value={ratings[entry.user.id] || 0} onChange={(v) => submitRating(entry.user.id, v)} />
                )}
              </View>
            ))}
          </View>
        )}

        <View style={[styles.card, styles.chatCard]}>
          <Text style={styles.sectionTitle}>Match Chat</Text>
          <FlatList
            data={messages}
            keyExtractor={(item) => String(item.id)}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.chatRow}>
                <Text style={styles.chatSender}>@{item.sender.username}</Text>
                <Text style={styles.chatBody}>{item.body}</Text>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>No messages yet.</Text>}
          />

          {canPostChat ? (
            <View style={styles.chatInputRow}>
              <TextInput
                style={styles.chatInput}
                value={draft}
                onChangeText={setDraft}
                placeholder="Message the group..."
                placeholderTextColor="#999"
              />
              <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={sending || !draft.trim()}>
                <Text style={styles.sendButtonText}>Send</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.chatHint}>RSVP to join the conversation.</Text>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  flex: { flex: 1 },
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
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, flex: 1, marginRight: 8 },
  recurrenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFC72C30',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  recurrenceText: { fontSize: 11, fontWeight: '700', color: colors.navy, marginLeft: 3 },
  hostText: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: 10 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  detailText: { fontSize: 14, color: colors.text, marginLeft: 8 },
  actionButtonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
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
  rsvpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rosterCount: { fontSize: 13, fontWeight: '600', color: colors.textMuted, flex: 1 },
  rsvpButton: { backgroundColor: colors.blue, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  rsvpButtonActive: { backgroundColor: colors.danger },
  rsvpButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  hostButtonRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, gap: 10 },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.blue,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  editButtonText: { color: colors.blue, fontWeight: '600', marginLeft: 4, fontSize: 13 },
  cancelMatchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cancelMatchText: { color: colors.danger, fontWeight: '600', marginLeft: 4, fontSize: 13 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginTop: 8, marginBottom: 6 },
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
  pillRow: { flexDirection: 'row', flexWrap: 'wrap' },
  pill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  pillSelected: { backgroundColor: colors.blue, borderColor: colors.blue },
  pillText: { fontSize: 13, color: colors.textMuted },
  pillTextSelected: { color: '#fff', fontWeight: '600' },
  editButtonRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  saveButton: { flex: 1, backgroundColor: colors.blue, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  cancelEditButton: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  cancelEditText: { color: colors.textMuted, fontWeight: '600' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  emptyText: { fontSize: 13, color: colors.textMuted },
  rosterRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  rosterAvatar: { width: 30, height: 30, borderRadius: 15, marginRight: 10 },
  rosterAvatarFallback: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 10,
    backgroundColor: '#0057B815',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rosterName: { fontSize: 14, color: colors.text, fontWeight: '600', flex: 1 },
  waitlistTag: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.navy,
    backgroundColor: '#FFC72C30',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  rateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  chatCard: { paddingBottom: 12 },
  chatRow: { marginBottom: 10 },
  chatSender: { fontSize: 12, fontWeight: '700', color: colors.blue },
  chatBody: { fontSize: 14, color: colors.text, marginTop: 2 },
  chatInputRow: { flexDirection: 'row', marginTop: 8, gap: 8 },
  chatInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  sendButton: { backgroundColor: colors.blue, paddingHorizontal: 16, borderRadius: 20, justifyContent: 'center' },
  sendButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  chatHint: { fontSize: 12, color: colors.textMuted, marginTop: 8, fontStyle: 'italic' },
});
