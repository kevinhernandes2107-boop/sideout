import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/colors';

interface AddressResult {
  address: string;
  city: string;
  latitude: number;
  longitude: number;
}

interface Suggestion {
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
  };
}

interface AddressAutocompleteProps {
  value: string;
  onChangeText: (text: string) => void;
  onSelect: (result: AddressResult) => void;
  placeholder?: string;
  /** When provided, results are restricted to near this point instead of searched globally. */
  near?: { latitude: number; longitude: number } | null;
}

const DEBOUNCE_MS = 500;
const MIN_QUERY_LENGTH = 3;
// ~0.6 degrees (~65km / 40mi) half-width — wide enough to cover a metro area,
// tight enough that a partial venue name finds the local match first.
const NEARBY_DELTA_DEGREES = 0.6;

export default function AddressAutocomplete({ value, onChangeText, onSelect, placeholder, near }: AddressAutocompleteProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const query = value.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      try {
        let url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=8&q=${encodeURIComponent(query)}`;
        if (near) {
          const left = near.longitude - NEARBY_DELTA_DEGREES;
          const right = near.longitude + NEARBY_DELTA_DEGREES;
          const top = near.latitude + NEARBY_DELTA_DEGREES;
          const bottom = near.latitude - NEARBY_DELTA_DEGREES;
          url += `&viewbox=${left},${top},${right},${bottom}&bounded=1`;
        }
        const response = await fetch(url, { headers: { Accept: 'application/json' } });
        const data: Suggestion[] = await response.json();
        if (requestId === requestIdRef.current) {
          setSuggestions(data);
          setOpen(true);
        }
      } catch (error) {
        console.warn('Address lookup failed:', (error as Error).message);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  const handleSelect = (suggestion: Suggestion) => {
    const addr = suggestion.address || {};
    const streetAddress = [addr.house_number, addr.road].filter(Boolean).join(' ') || suggestion.display_name.split(',')[0];
    const city = addr.city || addr.town || addr.village || addr.suburb || '';

    setOpen(false);
    setSuggestions([]);
    onSelect({
      address: streetAddress,
      city,
      latitude: parseFloat(suggestion.lat),
      longitude: parseFloat(suggestion.lon),
    });
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#999"
          value={value}
          onChangeText={(text) => {
            onChangeText(text);
            setOpen(true);
          }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
        />
        {loading && <ActivityIndicator size="small" color={colors.blue} style={styles.spinner} />}
      </View>

      {open && suggestions.length > 0 && (
        <View style={styles.dropdown}>
          {suggestions.map((item, index) => (
            <TouchableOpacity
              key={`${item.lat}-${item.lon}-${index}`}
              style={[styles.suggestionRow, index === suggestions.length - 1 && styles.suggestionRowLast]}
              onPress={() => handleSelect(item)}
            >
              <Text style={styles.suggestionText} numberOfLines={2}>
                {item.display_name}
              </Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.attribution}>Search by OpenStreetMap</Text>
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  wrapper: { position: 'relative', zIndex: 20 },
  inputRow: { position: 'relative', justifyContent: 'center' },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    paddingRight: 36,
    fontSize: 16,
    color: colors.text,
  },
  spinner: { position: 'absolute', right: 12 },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  suggestionRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  suggestionRowLast: { borderBottomWidth: 0 },
  suggestionText: { fontSize: 13, color: colors.text },
  attribution: { fontSize: 10, color: colors.textMuted, textAlign: 'right', paddingHorizontal: 12, paddingVertical: 6 },
});
