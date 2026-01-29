---
name: implement_auth_journey
description: Implement a Netflix-style Auth Journey (PIN-based, Profile Switching, Persistent Header)
---

# Skill: Implement Netflix-style Auth Journey

## Purpose
Deploy a user-friendly authentication system optimized for shared devices (e.g., factory usage).
Features:
- **Profile Switching**: Grid view of users (like Netflix).
- **PIN Authentication**: Simple 4-digit PIN for daily access.
- **Standalone Profiles**: Works with or without Supabase Auth users.
- **Persistent Header**: User menu with "Switch Profile", "Settings", etc.

## Architecture
- **Backend**: Supabase (PostgreSQL).
- **Auth Strategy**: Hybrid. 
  - **RLS**: Public/Permissive for `profiles` (since PINs are verified client/server-side without Auth session).
  - **Session**: `localStorage` tracks the active profile ID.
- **Frontend**: Next.js App Router + Tailwind CSS.

## Step-by-Step Implementation

### 1. Database Schema
Extend or create the `profiles` table to support display names, avatars, and PINs.

```sql
-- migration.sql
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'production_floor';

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS pin_hash TEXT,
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS display_name TEXT,
ADD COLUMN IF NOT EXISTS persona TEXT;

-- Important for Standalone Auth:
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Allow Public Access (Logic handled by App)
CREATE POLICY "Enable public read access" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Enable public update access" ON public.profiles FOR UPDATE USING (true);
```

### 2. Service Layer (`services/auth.ts`)
Create a service to manage profiles and sessions.
- **PIN Hashing**: Use SHA-256 (client) or bcrypt (server/edge).
- **Session**: `setSession` stores `{ profileId, ... }` in `localStorage`.
- **API**: `createProfile`, `verifyPin`, `updateProfile`.

### 3. UI Primitives (`components/ui/`)

#### `PinPad.tsx`
A touch-friendly numeric keypad.
- **Props**: `onComplete(pin)`, `length` (default 4).
- **Style**: Large buttons, clear visual feedback.

#### `AvatarPicker.tsx`
Allows selecting from gradient presets or uploading images.
- **Presets**: `preset:gradient-1`, `preset:gradient-2`, etc.
- **Helper**: `getAvatarBackground(url)` to resolve preset strings to CSS backgrounds.

### 4. Domain Components (`components/domain/`)

#### `ProfileCard.tsx`
Displays a user profile (Avatar + Name).
- **Critical Detail**: Must handle `preset:` strings for the avatar image source.
```typescript
// ProfileCard snippet
import { getAvatarBackground, isPresetAvatar } from '@/components/ui/AvatarPicker';
// ...
const avatarBg = getAvatarBackground(avatarUrl);
// Render div with style={{ background: avatarBg }} if present.
```

#### `UserHeaderMenu.tsx` (Dumb Component)
The dropdown menu in the top-right.
- **Props**: `displayName`, `avatarUrl`, `onLogout`, `onSwitchProfile`.
- **Actions**: Shows DropdownMenu with "Account Settings", "Theme", "Logout".

#### `HeaderUserArea.tsx` (Smart Component)
Connects the Service Layer to the UI.
- **Action**: Calls `getSession()` on mount.
- **Logic**: Manages `isSettingsOpen` state.
- **Render**: Returns `<UserHeaderMenu />` or null.

### 5. Layout Integration
Add `HeaderUserArea` to your main application layout.

```typescript
// src/app/(modules)/layout.tsx
import { HeaderUserArea } from '@/components/domain/HeaderUserArea';

export default function Layout({ children }) {
  return (
    <header>
      {/* ... nav links ... */}
      <div className="ml-auto">
        <HeaderUserArea />
      </div>
    </header>
  );
}
```

### 6. Pages

#### Register (`/register`)
Multi-step wizard:
1. **Choose Persona**: (Admin, Production, etc.)
2. **Avatar**: Use `AvatarPicker`.
3. **Name**: Input text.
4. **PIN**: Use `PinPad` (create).
5. **Confirm**: Show `ProfileCard` preview.

#### Login (`/login`)
1. **Grid**: Fetch all profiles (`getAllProfiles`). Render grid of `ProfileCard`s.
2. **PIN Entry**: On click, navigate to `/login/pin/[id]`.
3. **Verify**: Show `PinPad`. On complete -> `verifyPin` -> `setSession` -> Redirect.

## Verification Checklist
- [ ] Database migration applied?
- [ ] RLS policies allow public SELECT/UPDATE?
- [ ] ProfileCard renders gradients correctly?
- [ ] Header shows User Menu after login?
- [ ] Page refresh persists user session?
