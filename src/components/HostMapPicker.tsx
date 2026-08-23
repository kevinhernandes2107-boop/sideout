import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import MapView, { Marker, type Region, type LatLng } from 'react-native-maps';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/colors';

interface HostMapPickerProps {
  region: Region;
  pin: LatLng | null;
  onRegionChange: (region: Region) => void;
  onPick: (coord: LatLng) => void;
}

export default function HostMapPicker({ region, pin, onRegionChange, onPick }: HostMapPickerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.mapContainer}>
      <MapView
        style={styles.map}
        region={region}
        onRegionChangeComplete={onRegionChange}
        onPress={(e) => onPick(e.nativeEvent.coordinate)}
      >
        {pin && <Marker coordinate={pin} pinColor={colors.gold} />}
      </MapView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  mapContainer: {
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  map: { flex: 1 },
});
