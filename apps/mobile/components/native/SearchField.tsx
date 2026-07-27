import { Pressable, TextInput, View } from "react-native";
import { COLORS, FONT } from "../../lib/theme";
import { Icon } from "../Icon";

/**
 * The inventory search field — deliberately **not** native.
 *
 * ## Why the native SearchBar was rejected
 *
 * G3 set out to put Material 3's `SearchBar` here. Reading the installed
 * @expo/ui 57.0.4 says no, on two counts:
 *
 * 1. **It cannot carry the tokens.** `SearchBarProps` is `{ onSearch, modifiers,
 *    children }` — no colours at all. `DockedSearchBar` is the same story with
 *    `onQueryChange` instead. The `background` modifier paints *behind* the bar;
 *    Material still draws its own container, query text and placeholder on top,
 *    in its own palette and its own font. On a near-black screen next to acid
 *    green that is a stock Material surface sitting in the middle of the
 *    Warehouse Console.
 * 2. **It cannot be controlled.** Neither component takes a `value`. `SearchBar`
 *    only reports on submit, so the live "type and the list narrows" behaviour
 *    would become "type, press enter, wait" — and neither the clear button nor
 *    a programmatic reset could ever empty the field. That is a functional
 *    regression, not a cosmetic one.
 *
 * The plan's rule is explicit: if a control cannot carry the design tokens,
 * keep the custom one and say why. This is that. It is extracted into
 * `components/native/` anyway so the decision lives beside `Segmented.tsx`,
 * which *did* clear the bar — the next person deciding whether to try the
 * native bar again should find both answers in one place.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Names the field for screen readers, and its clear button by extension. */
  label: string;
}) {
  return (
    <View className="h-[52px] flex-row items-center gap-2.5 rounded-[14px] border border-hairline bg-surface2 px-4">
      <Icon name="MagnifyingGlass" size={16} color={COLORS.inkFaint} />
      <TextInput
        value={value}
        onChangeText={onChange}
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={COLORS.inkFaint}
        autoCorrect={false}
        returnKeyType="search"
        style={{ fontFamily: FONT.text }}
        className="h-full flex-1 text-[15px] text-ink"
      />
      {value.length > 0 ? (
        <Pressable
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChange("")}
          className="h-6 w-6 items-center justify-center rounded-full bg-surface1"
        >
          <Icon name="X" size={12} color={COLORS.inkFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}
