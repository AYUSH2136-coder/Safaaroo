# SafaaRoo Local Setup Guide

Follow this guide to get SafaaRoo running on your local machine for development.

## Prerequisites
- **Node.js** (v18+)
- **npm** or **yarn**
- **Flutter SDK** (v3.22+)
- **Android Studio** (for Android emulator and build tools)
- **Git**

## 1. Backend Setup (Node.js API & Web Sockets)

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   Copy `.env.example` to `.env` and fill in any secrets.
   ```bash
   cp .env.example .env
   ```
4. Start the development server:
   ```bash
   npm run dev
   # or
   npm start
   ```
   *Note: A SQLite database (`dev.db`) will be automatically created upon the first run.*

## 2. React Admin Dashboard Setup (Frontend)

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```

## 3. Flutter Mobile App Setup (Safaaroo)

1. Navigate to the Flutter directory:
   ```bash
   cd Safaaroo
   ```
2. Get Flutter packages:
   ```bash
   flutter pub get
   ```
3. Configure Mapbox:
   The app uses Mapbox for rendering the live tracking map.
   To run the app, pass the Mapbox access token as a Dart environment variable. Do not hardcode the real token into the source code.
   
   Example (Command Line):
   ```bash
   flutter run --dart-define=MAPBOX_ACCESS_TOKEN=pk.your_mapbox_token_here
   ```
   *Tip: In VSCode, you can add this to your `launch.json` under `args` or `toolArgs`.*

4. Configure the API URL:
   By default, the Flutter app targets `http://10.0.2.2:5000` (Android Emulator to localhost) or a configured ngrok tunnel. If you are using a physical device or a different port, update the `baseUrl` inside `lib/config/app_config.dart`.

5. Build and Run:
   ```bash
   flutter run
   ```
