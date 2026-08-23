import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { apiFetch, ApiError } from '../constants/api';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/colors';
import StarRating, { RatingSummary } from './StarRating';

interface VenueRatingProps {
  address?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface Venue {
  id: number;
  rating_average: number | null;
  rating_count: number;
}

interface Review {
  id: number;
  user: { id: number; username: string };
  rating: number;
  body?: string | null;
  created_at: string;
}

export default function VenueRating({ address, city, latitude, longitude }: VenueRatingProps) {
  const { user, userToken } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [draftRating, setDraftRating] = useState(0);
  const [draftBody, setDraftBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!address || !address.trim()) {
      setLoading(false);
      return;
    }
    try {
      const v = await apiFetch<Venue>('/api/venues/resolve', {
        method: 'POST',
        token: userToken,
        body: {
          address,
          city: city || undefined,
          latitude: latitude ?? undefined,
          longitude: longitude ?? undefined,
        },
      });
      setVenue(v);
      const r = await apiFetch<Review[]>(`/api/venues/${v.id}/reviews`, { token: userToken });
      setReviews(r);
      const mine = r.find((rv) => rv.user.id === user?.id);
      if (mine) {
        setDraftRating(mine.rating);
        setDraftBody(mine.body || '');
      }
    } catch (error) {
      console.warn('Failed to load venue rating:', (error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [address, city, latitude, longitude, userToken, user?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const submit = async () => {
    if (!venue || !draftRating) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/venues/${venue.id}/reviews`, {
        method: 'POST',
        token: userToken,
        body: { rating: draftRating, body: draftBody.trim() || undefined },
      });
      setShowForm(false);
      await load();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not submit your review.';
      Alert.alert('Error', message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!address || !address.trim()) return null;

  const myReview = reviews.find((rv) => rv.user.id === user?.id);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Venue Rating</Text>
        {!!venue && venue.rating_count > 0 && (
          <RatingSummary average={venue.rating_average} count={venue.rating_count} size={14} />
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={colors.blue} />
      ) : (
        <>
          {reviews.length === 0 ? (
            <Text style={styles.emptyText}>No reviews yet — be the first to rate this spot.</Text>
          ) : (
            reviews.map((rv) => (
              <View key={rv.id} style={styles.reviewRow}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.reviewUsername}>@{rv.user.username}</Text>
                  <StarRating value={rv.rating} size={13} />
                </View>
                {!!rv.body && <Text style={styles.reviewBody}>{rv.body}</Text>}
              </View>
            ))
          )}

          {!showForm ? (
            <TouchableOpacity style={styles.addReviewButton} onPress={() => setShowForm(true)}>
              <Text style={styles.addReviewButtonText}>{myReview ? 'Edit Your Review' : 'Leave a Review'}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.formBox}>
              <StarRating value={draftRating} size={26} onChange={setDraftRating} />
              <TextInput
                style={styles.reviewInput}
                value={draftBody}
                onChangeText={setDraftBody}
                placeholder="Good competition? Courts in good shape? Let others know..."
                placeholderTextColor="#999"
                multiline
              />
              <View style={styles.formButtonRow}>
                <TouchableOpacity style={styles.submitButton} onPress={submit} disabled={submitting || !draftRating}>
                  {submitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.submitButtonText}>Submit</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowForm(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  emptyText: { fontSize: 13, color: colors.textMuted, marginBottom: 10 },
  reviewRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewUsername: { fontSize: 13, fontWeight: '700', color: colors.text },
  reviewBody: { fontSize: 13, color: colors.textMuted, marginTop: 4, lineHeight: 18 },
  addReviewButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.blue,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  addReviewButtonText: { color: colors.blue, fontWeight: '700', fontSize: 13 },
  formBox: { marginTop: 10 },
  reviewInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: colors.text,
    marginTop: 10,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  formButtonRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 14 },
  submitButton: {
    backgroundColor: colors.blue,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 9,
    minWidth: 80,
    alignItems: 'center',
  },
  submitButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  cancelText: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
});
