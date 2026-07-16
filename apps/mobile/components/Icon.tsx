import {
  CaretLeft, CaretRight, CaretDown, Plus, Check, X, Camera, ClipboardText,
  PencilSimple, Trash, MagnifyingGlass, GearSix, SignOut, WifiSlash,
  HardDrives, ShieldCheck, Package, Target, EnvelopeSimple, ArrowsClockwise, Download,
  MapPin, CrosshairSimple, Bell, Images,
} from "phosphor-react-native";
import { COLORS } from "../lib/theme";

const ICONS = {
  CaretLeft, CaretRight, CaretDown, Plus, Check, X, Camera, ClipboardText,
  PencilSimple, Trash, MagnifyingGlass, GearSix, SignOut, WifiSlash,
  HardDrives, ShieldCheck, Package, Target, EnvelopeSimple, ArrowsClockwise, Download,
  MapPin, CrosshairSimple, Bell, Images,
} as const;

export type IconName = keyof typeof ICONS;

/** Phosphor Bold is the app's icon voice (mockup parity). */
export function Icon({ name, size = 18, color = COLORS.ink }: { name: IconName; size?: number; color?: string }) {
  const Cmp = ICONS[name];
  if (!Cmp) return null;
  return <Cmp size={size} color={color} weight="bold" />;
}
