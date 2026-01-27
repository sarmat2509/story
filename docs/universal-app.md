# Universal App (M6) - Architecture Documentation

## Overview

Единая кодовая база на Expo + React Native + React Native Web для iOS, Android и Web платформ с 95% переиспользованием кода.

## Architecture

### Tech Stack

- **Expo SDK 50+** - unified development platform
- **React Native 0.73+** - cross-platform UI framework
- **React Native Web** - renders RN components to DOM
- **React Navigation v6** - navigation (adaptive: Drawer/Tabs)
- **React Native UI Lib** - production-ready components
- **NativeWind 4.0** - Tailwind CSS for React Native
- **TanStack Query v5** - server state management
- **Zustand** - client state management
- **react-i18next** - internationalization

### State Management Strategy

**TanStack Query** manages server state (80%):
- Stories (list, detail, status)
- Children profiles
- Characters
- Dictionaries (goals, tones, styles)
- User data

**Zustand** manages client state (20%):
- Authentication (token, user)
- Wizard form state
- UI state (modals, loading)
- Offline queue

### Responsive Design

**Breakpoints:**
- Mobile: < 768px (default)
- Tablet: >= 768px (`md:`)
- Desktop: >= 1024px (`lg:`)

**Navigation:**
- Desktop: Drawer Navigator (sidebar)
- Mobile/Tablet: Bottom Tab Navigator

## Current Implementation (Phase 1 MVP)

### Completed
- ✅ Project structure
- ✅ Configuration files (Expo, Babel, TypeScript, Tailwind, Metro)
- ✅ API client with interceptors
- ✅ Zustand stores (auth, wizard, UI, offline)
- ✅ TanStack Query hooks (auth, stories, children, dictionaries)
- ✅ React Navigation setup (Root, Auth, Main)
- ✅ Basic screens (Login, Home, Wizard, Library)
- ✅ Responsive utilities
- ✅ i18n configuration
- ✅ OAuth helpers (web-ready, native placeholder)
- ✅ PWA configuration

### Next Steps (Phase 2)
- Full wizard implementation with progressive disclosure
- Children management (list, detail, forms)
- Characters management (list, detail, forms)
- Story detail screen with audio player
- Enhanced library (search, filters)
- Settings screen
- UI components library
- Full OAuth implementation (native)

## Running the App

See [apps/universal-app/README.md](../../apps/universal-app/README.md) for detailed instructions.

Quick start:
```bash
cd apps/universal-app
pnpm install
pnpm start
# Press 'w' for web
```
