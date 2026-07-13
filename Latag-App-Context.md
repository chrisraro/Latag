# Latag App - Claude Code Custom Instructions

## 1. Stack & Architecture
- **Mobile:** Expo / React Native, NativeWind (Tailwind).
- **Backend:** Next.js 15 (App Router), Supabase (Auth only), Upstash Redis.
- **Database (Strict):** `expo-sqlite` managed by `drizzle-orm/expo-sqlite`. 

## 2. Strict Offline-First Rules (CRITICAL)
- **Zero Cloud DB Reads:** The mobile app MUST NEVER fetch inventory, sessions, or photos from Supabase or any external API. All reads/writes happen against the local SQLite instance.
- **Media Handling:** NEVER write image BLOBs to SQLite. Compress images using `expo-image-manipulator`, save them to the device using `expo-file-system`, and store ONLY the `file://` URI string in the SQLite database.

## 3. UI/UX Rules
- Prioritize gesture-driven inputs (sliders, scroll wheels, touch chips) over text keyboards for mobile data entry. 
- Use React Native Reanimated for smooth UI transitions to mask any local DB write times.
- Default styling to dark mode (`bg-black`) to save OLED battery life.

## 4. Backend Rules
- Next.js API routes are strictly for anonymous telemetry ingestion.
- Always use Upstash Redis for incrementing telemetry counters to prevent Postgres bottlenecks.

# Latag Media Handling Protocol

Whenever you are tasked with capturing or saving images, you MUST follow this exact sequence:
1. Do not use standard `fetch` or `FormData` to upload images.
2. Use `expo-image-manipulator` to compress the raw camera cache file (resize width: 1200, compress: 0.7, format: JPEG).
3. Use `expo-file-system` to move the compressed file to `${FileSystem.documentDirectory}latag_media/`.
4. Return ONLY the `file://` URI string to be saved into the Drizzle SQLite database.