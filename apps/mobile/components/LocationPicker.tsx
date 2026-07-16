import { useEffect, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import {
  Camera,
  Map as MapLibreMap,
  type CameraRef,
  type MapRef,
  type ViewStateChangeEvent,
} from "@maplibre/maplibre-react-native";
import type { NativeSyntheticEvent } from "react-native";
import { FONT, COLORS } from "../lib/theme";
import { searchPlaces, type Place } from "../lib/geocode";
import { showError } from "../lib/toast";
import { Icon } from "./Icon";
import { PrimaryButton, SecondaryButton } from "./ui";

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
/** Metro Manila — sane default viewport when nothing is pinned yet. */
const DEFAULT_CENTER: [number, number] = [120.9842, 14.5995];

export type PickedLocation = { name: string; lat: number; lng: number };

/** Collapsed field row → full-height map modal. Drag-to-pin via a fixed center
 *  marker (the map moves under it); Nominatim search + locate-me are sugar on
 *  top. Fully usable offline: map may render blank, search fails to empty, but
 *  the picker still returns coords + a typed name. */
export function LocationPicker({
  value,
  onChange,
}: {
  value: PickedLocation | null;
  onChange: (v: PickedLocation | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={value ? `Location: ${value.name}` : "Pin a location"}
        onPress={() => { Haptics.selectionAsync(); setOpen(true); }}
        className="mb-3 h-[52px] flex-row items-center gap-2.5 rounded-[14px] border border-hairline bg-surface2 px-4"
      >
        <Icon name="MapPin" size={18} color={value ? COLORS.acid : COLORS.inkFaint} />
        <Text
          style={{ fontFamily: FONT.text }}
          numberOfLines={1}
          className={`flex-1 text-[15px] ${value ? "text-ink" : "text-inkfaint"}`}
        >
          {value ? value.name : "Pin a location — optional"}
        </Text>
      </Pressable>
      {open ? (
        <PickerModal
          value={value}
          onDone={(v) => { onChange(v); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function PickerModal({
  value,
  onDone,
  onClose,
}: {
  value: PickedLocation | null;
  onDone: (v: PickedLocation | null) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);

  const initialCenter: [number, number] = value ? [value.lng, value.lat] : DEFAULT_CENTER;
  const centerRef = useRef<[number, number]>(initialCenter);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [offlineHint, setOfflineHint] = useState(false);
  const [name, setName] = useState(value?.name ?? "");
  const searchSeq = useRef(0);

  // Nominatim policy: debounce ≥1s. Stale responses are dropped via seq.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setOfflineHint(false); return; }
    const seq = ++searchSeq.current;
    const t = setTimeout(async () => {
      const found = await searchPlaces(q);
      if (seq !== searchSeq.current) return;
      setResults(found);
      setOfflineHint(found.length === 0); // silent degrade: offline and no-match look the same
    }, 1000);
    return () => clearTimeout(t);
  }, [query]);

  const flyTo = (lng: number, lat: number) => {
    centerRef.current = [lng, lat];
    cameraRef.current?.flyTo({ center: [lng, lat], zoom: 15, duration: 600 });
  };

  const pickResult = (p: Place) => {
    Haptics.selectionAsync();
    Keyboard.dismiss();
    setName(p.name);
    setResults([]);
    setOfflineHint(false);
    flyTo(p.lng, p.lat);
  };

  const locateMe = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        showError("Location permission needed — search or drag instead");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      flyTo(pos.coords.longitude, pos.coords.latitude);
    } catch {
      // GPS unavailable — dragging and search still work; stay silent.
    }
  };

  const confirm = async () => {
    let center = centerRef.current;
    try {
      const live = await mapRef.current?.getCenter();
      if (live) center = live;
    } catch {
      // native view gone or map never loaded — last tracked center is still honest
    }
    onDone({ name: name.trim() || "Pinned location", lat: center[1], lng: center[0] });
  };

  const onRegionDidChange = (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    centerRef.current = e.nativeEvent.center;
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-bg">
        <View className="flex-1">
          <MapLibreMap
            ref={mapRef}
            style={{ flex: 1 }}
            mapStyle={STYLE_URL}
            attribution={false}
            logo={false}
            compass={false}
            touchPitch={false}
            onRegionDidChange={onRegionDidChange}
          >
            <Camera ref={cameraRef} initialViewState={{ center: initialCenter, zoom: value ? 15 : 11 }} />
          </MapLibreMap>

          {/* Fixed center pin — the map drags underneath it. Tip lands on center. */}
          <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
            <View style={{ transform: [{ translateY: -17 }] }}>
              <Icon name="MapPin" size={34} color={COLORS.acid} />
            </View>
          </View>

          <Text style={{ fontFamily: FONT.text }} className="absolute bottom-2 left-3 text-[11px] text-inkfaint">
            © OpenStreetMap
          </Text>

          {/* Search overlay */}
          <View className="absolute left-5 right-5" style={{ top: insets.top + 8 }}>
            <View className="flex-row items-center gap-2">
              <TextInput
                value={query}
                onChangeText={setQuery}
                accessibilityLabel="Search places"
                placeholder="Search places"
                placeholderTextColor="#8A8A8A"
                style={{ fontFamily: FONT.text }}
                className="h-[52px] flex-1 rounded-[14px] border border-hairline bg-surface1 px-4 text-[15px] text-ink"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onClose}
                className="h-[52px] w-[52px] items-center justify-center rounded-[14px] border border-hairline bg-surface1"
              >
                <Icon name="X" size={20} color={COLORS.ink} />
              </Pressable>
            </View>
            {offlineHint ? (
              <Text style={{ fontFamily: FONT.text }} className="mt-2 px-1 text-[11px] text-inkfaint">
                Offline — drag the map or type a name
              </Text>
            ) : null}
            {results.length > 0 ? (
              <View className="mt-2 rounded-[14px] border border-hairline bg-surface1">
                {results.map((p, i) => (
                  <Pressable
                    key={`${p.lat},${p.lng}`}
                    accessibilityRole="button"
                    accessibilityLabel={p.name}
                    onPress={() => pickResult(p)}
                    className={`min-h-[44px] flex-row items-center gap-2.5 px-3 py-3.5 ${i < results.length - 1 ? "border-b border-hairline" : ""}`}
                  >
                    <Icon name="MapPin" size={16} color={COLORS.inkFaint} />
                    <Text style={{ fontFamily: FONT.semibold }} numberOfLines={1} className="flex-1 text-[14px] text-ink">
                      {p.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          {/* Locate me */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Use my location"
            onPress={locateMe}
            className="absolute bottom-4 right-4 h-12 w-12 items-center justify-center rounded-full border border-hairline bg-surface1"
          >
            <Icon name="CrosshairSimple" size={22} color={COLORS.ink} />
          </Pressable>
        </View>

        {/* Footer */}
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View className="border-t border-hairline bg-surface1 px-5 pt-3" style={{ paddingBottom: insets.bottom + 8 }}>
            <Text style={{ fontFamily: FONT.text }} className="mb-2 text-[11px] text-inkfaint">
              Search © OpenStreetMap
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              accessibilityLabel="Location name"
              placeholder="Pinned location"
              placeholderTextColor="#8A8A8A"
              style={{ fontFamily: FONT.text }}
              className="h-[52px] rounded-[14px] border border-hairline bg-surface2 px-4 text-[15px] text-ink"
            />
            <PrimaryButton label="Use this location" onPress={confirm} />
            {value ? (
              <View className="mb-1 flex-row">
                <SecondaryButton label="Remove pin" onPress={() => onDone(null)} />
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
