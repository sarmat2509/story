# WonderTales Universal App

Cross-platform application for creating personalized illustrated fairy tales.

## Tech Stack

- **React Native 0.73+** + **Expo SDK 50+**
- **React Native Web** - для web-версии
- **React Navigation v6** - навигация
- **React Native UI Lib** + **NativeWind 4.0** - UI components
- **TanStack Query v5** - data fetching
- **Zustand** - state management
- **react-i18next** - internationalization

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+
- Backend API должен быть запущен (`pnpm dev:api` в корне проекта)

### Installation

```bash
# From project root
pnpm install

# Or from this directory
pnpm install
```

### Running the App

#### Web (рекомендуется для разработки)
```bash
pnpm start
# Then press 'w' for web

# Or directly
pnpm web
```

App will open at `http://localhost:8081` (or next available port)

#### iOS (Expo Go)
```bash
pnpm start
# Then press 'i' for iOS simulator
# Or scan QR code with Expo Go app
```

#### Android (Expo Go)
```bash
pnpm start
# Then press 'a' for Android emulator
# Or scan QR code with Expo Go app
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
API_BASE_URL=http://localhost:3000
GOOGLE_CLIENT_ID_WEB=your-google-client-id
GOOGLE_CLIENT_ID_IOS=your-ios-client-id
GOOGLE_CLIENT_ID_ANDROID=your-android-client-id
APPLE_CLIENT_ID=com.wondertales.app
```

## Project Structure

```
src/
  ├── api/              # TanStack Query hooks
  ├── components/       # Reusable components
  ├── config/           # Configuration
  ├── hooks/            # Custom hooks
  ├── navigation/       # React Navigation
  ├── screens/          # Screen components
  ├── store/            # Zustand stores
  ├── types/            # TypeScript types
  └── utils/            # Utilities
```

## Features (Phase 1)

- ✅ OAuth authentication (Google + Apple)
- ✅ Create story wizard
- ✅ Story library
- ✅ Responsive design (mobile/tablet/desktop)
- ✅ Multi-language support (uk/ru/en/es)

## Development

### Type Checking

```bash
pnpm type-check
```

### Linting

```bash
pnpm lint
```

### Building for Web

```bash
pnpm build:web
```

Output will be in `dist/` directory.

## Notes

- **OAuth**: На данном этапе полностью работает только на Web. Native OAuth (iOS/Android) требует EAS Build.
- **Expo Go**: Поддерживает большинство функций, кроме native OAuth SDK.
- **Production builds**: iOS/Android production builds будут настроены в следующих фазах через EAS Build.

## Документация монорепозитория

Сборка, инфраструктура и архитектура описаны в корне репозитория: [docs/README.md](../../docs/README.md).
