/// <reference types="nativewind/types" />

// RECONCILIATION (Task 11): nativewind/types re-exports react-native-css-interop/types,
// which declares `*.css` module side-effect imports. In this environment's installed
// node_modules, react-native-css-interop is present in the pnpm store but not hoisted/linked
// into apps/mobile/node_modules (nor nested under nativewind/node_modules), so the reference
// chain resolves to nothing and `tsc --noEmit` fails on `import "../global.css"` in
// app/_layout.tsx with TS2882. Runtime (Metro/babel via nativewind/babel + nativewind/metro)
// is unaffected — this is a TS-only declaration gap. Declaring the module locally unblocks
// typecheck without touching the broader dependency install.
declare module "*.css";
