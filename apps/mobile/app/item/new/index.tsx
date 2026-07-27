import RapidConsole from "../../session/[id]/add";

/**
 * `/item/new` — the Rapid Console with no batch behind it, which is where both
 * tab bars' quick-add button lands (see `lib/quick-add.ts`). A static segment,
 * so it wins over `/item/[id]` in the router. `?item=<id>` edits a loose item.
 */
export default function NewItemScreen() {
  return <RapidConsole noBatch />;
}
