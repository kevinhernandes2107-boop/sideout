import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/colors';

interface StarRatingProps {
  value: number;
  size?: number;
  onChange?: (value: number) => void;
}

export default function StarRating({ value, size = 16, onChange }: StarRatingProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const stars = [1, 2, 3, 4, 5];
  return (
    <View style={styles.row}>
      {stars.map((star) => {
        const filled = star <= Math.round(value);
        const Star = (
          <MaterialIcons
            key={star}
            name={filled ? 'star' : 'star-border'}
            size={size}
            color={colors.gold}
            style={styles.star}
          />
        );
        if (!onChange) return Star;
        return (
          <TouchableOpacity key={star} onPress={() => onChange(star)}>
            {Star}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

interface RatingSummaryProps {
  average: number | null | undefined;
  count: number;
  size?: number;
}

export function RatingSummary({ average, count, size = 14 }: RatingSummaryProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!count || average == null) return null;
  return (
    <View style={styles.summaryRow}>
      <MaterialIcons name="star" size={size} color={colors.gold} />
      <Text style={[styles.summaryText, { fontSize: size }]}>
        {average.toFixed(1)} ({count})
      </Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  row: { flexDirection: 'row' },
  star: { marginRight: 2 },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryText: { color: colors.textMuted, fontWeight: '600', marginLeft: 3 },
});
