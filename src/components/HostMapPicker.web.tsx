import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/colors';

interface LatLng {
  latitude: number;
  longitude: number;
}

interface Region extends LatLng {
  latitudeDelta: number;
  longitudeDelta: number;
}

interface HostMapPickerProps {
  region: Region;
  pin: LatLng | null;
  onRegionChange: (region: Region) => void;
  onPick: (coord: LatLng) => void;
}

// react-native-maps has no web implementation, so the web build gets a
// plain hint instead of the tap-to-drop-pin picker used on iOS/Android.
export default function HostMapPicker(_props: HostMapPickerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Interactive pin placement is available in the iOS/Android app.</Text>
      <Text style={styles.text}>Use the City/Address fields above for now.</Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
    alignItems: 'center',
  },
  text: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
});
