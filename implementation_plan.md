# SafaaRoo — Multi-User School Bus Tracking System
## Implementation Plan (Phase 1 — Core Foundation)

> **Goal**: Evolve the existing single-mode location tracker POC into a production-ready, role-based school bus tracking platform. This plan covers only Phase 1 (the basic structure you described). More features will be layered on top after your approval.

---

## Understanding the Current System

The existing POC has:
- **SQLite** database with `devices`, `routes`, `stops`, `bus_live_state`, `notification_log`, `stop_subscribers` tables
- **Express + Socket.IO** backend
- **React (Vite)** frontend with pages: `Login`, `AdminRouteManager`, `BusTracker`, `LiveTracker`, `Transmitter`, `Receiver`
- No authentication/authorization — anyone can access any page
- Routes are static and centrally managed

---

## What Changes in Phase 1

The entire system needs to be restructured around **three user roles** with role-based access. The existing DB tables will be **extended** (not replaced), and several new tables will be added.

---

## Proposed Database Changes

### New Tables to Add (in `backend/config/db.js`)

#### `users` — All user accounts across all roles
```sql
CREATE TABLE users (
  user_id    TEXT PRIMARY KEY,   -- auto-generated UUID
  name       TEXT NOT NULL,
  mobile     TEXT NOT NULL UNIQUE,
  password   TEXT NOT NULL,      -- bcrypt hashed
  role       TEXT NOT NULL,      -- 'operator' | 'driver' | 'parent'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
```

#### `schools` — Registered schools (created by Operator)
```sql
CREATE TABLE schools (
  school_id   TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL,     -- FK → users(user_id)
  school_name TEXT NOT NULL,
  latitude    REAL NOT NULL,
  longitude   REAL NOT NULL,
  address     TEXT,
  created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (operator_id) REFERENCES users(user_id)
)
```

#### `vehicles` — Buses/vehicles registered by Operator
```sql
CREATE TABLE vehicles (
  vehicle_id     TEXT PRIMARY KEY,  -- vehicle number e.g. "CG12AS1834"
  operator_id    TEXT NOT NULL,     -- FK → users(user_id)
  driver_id      TEXT,              -- FK → users(user_id), nullable until assigned
  school_id      TEXT NOT NULL,     -- which school this bus belongs to
  vehicle_name   TEXT,              -- optional friendly name
  slot_no        TEXT,              -- auto-generated slot number
  status         TEXT DEFAULT 'inactive',
  created_at     TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (operator_id) REFERENCES users(user_id),
  FOREIGN KEY (driver_id)   REFERENCES users(user_id),
  FOREIGN KEY (school_id)   REFERENCES schools(school_id)
)
```

#### `parent_profiles` — Extra info linked to parent users
```sql
CREATE TABLE parent_profiles (
  profile_id    TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL UNIQUE,  -- FK → users(user_id)
  student_name  TEXT NOT NULL,
  school_id     TEXT,                  -- school where child is enrolled
  vehicle_id    TEXT,                  -- bus/vehicle selected by parent
  home_lat      REAL,                  -- parent's home/pickup coordinate
  home_lng      REAL,
  notify_pref   TEXT DEFAULT 'sms',   -- 'sms' | 'whatsapp'
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)    REFERENCES users(user_id),
  FOREIGN KEY (school_id)  REFERENCES schools(school_id),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id)
)
```

#### `driver_profiles` — Extra info linked to driver users
```sql
CREATE TABLE driver_profiles (
  profile_id   TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL UNIQUE,  -- FK → users(user_id)
  vehicle_id   TEXT,                  -- assigned vehicle (by operator OR self-registered)
  is_under_operator INTEGER DEFAULT 1, -- 1 = under operator, 0 = independent
  created_at   TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)    REFERENCES users(user_id),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id)
)
```

> **Note**: The existing `devices`, `routes`, `stops`, `bus_live_state`, `notification_log`, `stop_subscribers` tables are **kept as-is** for now. The new `vehicles` table will gradually replace `devices` as the canonical bus identity, with a migration strategy planned in Phase 2.

---

## Proposed Backend Changes

### New Files

#### [NEW] `backend/middleware/auth.js`
JWT-based middleware that reads the Bearer token from the `Authorization` header, verifies it, attaches `req.user = { user_id, role }`, and rejects requests without a valid token. Role-checking helpers (`requireRole('operator')`, etc.) also live here.

#### [NEW] `backend/routes/authRoutes.js`
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register new user (any role) |
| POST | `/api/auth/login` | Login → returns JWT token |
| GET  | `/api/auth/me` | Get own profile (protected) |

#### [NEW] `backend/controllers/authController.js`
- `register`: Validates fields by role, hashes password with `bcrypt`, inserts into `users` + role-specific profile table
- `login`: Verifies mobile + password, issues JWT with `{ user_id, role }` payload
- `getMe`: Returns logged-in user's full profile

#### [NEW] `backend/routes/operatorRoutes.js`
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/operator/schools` | Add a school |
| GET  | `/api/operator/schools` | List own schools |
| POST | `/api/operator/vehicles` | Add a vehicle (generates slot_no) |
| GET  | `/api/operator/vehicles` | List own vehicles with driver info |
| PUT  | `/api/operator/vehicles/:id` | Edit vehicle (change vehicle_no, assign driver) |
| DELETE | `/api/operator/vehicles/:id` | Remove vehicle |

#### [NEW] `backend/controllers/operatorController.js`
Handles all operator-specific DB operations. Generates `slot_no` automatically (format: `SCH-001`, `SCH-002`, etc.) when a vehicle is added.

#### [NEW] `backend/routes/parentRoutes.js`
| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/parent/schools` | List all schools (to select child's school) |
| GET  | `/api/parent/vehicles` | List vehicles for selected school |
| PUT  | `/api/parent/profile` | Save/update school, vehicle, home coords |
| GET  | `/api/parent/profile` | Get own profile + route details |
| GET  | `/api/parent/track/:vehicleId` | Get live location of selected vehicle |

#### [NEW] `backend/controllers/parentController.js`
Manages parent profile updates. The "route" for a parent is not stored as a DB route — it is **derived at query time** from:
- **Origin** = parent's `home_lat`, `home_lng` (their home coordinate)
- **Destination** = school's `latitude`, `longitude` (auto-set from the school they selected)
- **Bus position** = latest location broadcast by the vehicle's driver

#### [NEW] `backend/routes/driverRoutes.js`
| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/driver/profile` | Get driver profile + assigned vehicle |
| POST | `/api/driver/transmit/start` | Start GPS transmission session |
| POST | `/api/driver/transmit/stop` | Stop GPS transmission session |

#### [MODIFY] `backend/config/db.js`
Add all new `CREATE TABLE` statements inside the existing `db.serialize()` block.

#### [MODIFY] `backend/server.js`
- Import and mount `authRoutes`, `operatorRoutes`, `parentRoutes`, `driverRoutes`
- Add JWT secret to `.env`

#### [MODIFY] `backend/sockets/locationSocket.js`
- Attach `vehicle_id` to socket rooms (instead of or in addition to `device_id`)
- Emit location updates to a room named `vehicle:<vehicle_id>` so parents can subscribe to their chosen bus

#### [MODIFY] `backend/package.json`
Add new dependencies:
- `bcryptjs` — password hashing
- `jsonwebtoken` — JWT auth
- `uuid` — generating `user_id`, `school_id`, `profile_id`

---

## Proposed Frontend Changes

### Architecture

The frontend will use **React Router** with a **role-based layout**. After login, the user is redirected to their role-specific dashboard. All API calls will include the JWT Bearer token stored in `localStorage`.

### New & Modified Pages

#### [MODIFY] `frontend/src/pages/Login.jsx`
- Add **Register** tab alongside Login
- Registration form fields change based on selected role:
  - **Operator**: Name, Mobile, Password
  - **Driver**: Name, Mobile, Password → then choose: "Under Operator" (enter operator's vehicle no.) OR "Independent" (enter your own vehicle no.)
  - **Parent**: Name, Student Name, Mobile, Password
- On successful login, store `{ token, role, user_id }` in `localStorage` and redirect to role dashboard

#### [NEW] `frontend/src/pages/operator/OperatorDashboard.jsx`
- Header: Operator name, logout button
- **Vehicle List** — card per vehicle showing:
  - Vehicle No. + Slot No.
  - Driver Name
  - 📞 Call Driver button
  - 📍 View on Map button
  - ✏️ Edit button (edit vehicle no. / reassign driver)
- **Add New** button → opens add vehicle modal

#### [NEW] `frontend/src/pages/operator/AddVehicleModal.jsx`
- Fields: Vehicle Number (required), friendly name (optional)
- On submit: `POST /api/operator/vehicles` → slot_no is auto-generated by backend

#### [NEW] `frontend/src/pages/driver/DriverDashboard.jsx`
- Shows: assigned vehicle no. + slot, current transmission status
- **Transmitter Mode** — same as existing `Transmitter.jsx` but:
  - Bound to the driver's assigned `vehicle_id`
  - Big toggle: **Start Transmitting** / **Stop Transmission**
  - Shows current GPS coordinates while transmitting

#### [NEW] `frontend/src/pages/parent/ParentDashboard.jsx`
- Two modes (tab or bottom-nav):
  - **Route Manager** tab
  - **Live Tracker** tab

#### [NEW] `frontend/src/pages/parent/RouteManager.jsx`
**Step-by-step wizard** (3 steps):

| Step | Action | Detail |
|------|---------|--------|
| 1 | Select School | Dropdown of all schools → school coordinates become the **destination** automatically |
| 2 | Select Vehicle | List of buses linked to that school → parent taps their child's bus |
| 3 | Set Home Location | Map pin drop OR GPS auto-detect → becomes the **origin** point |

- **Done** button saves to `PUT /api/parent/profile`
- Also shows notification preference selector (SMS / WhatsApp)

#### [NEW] `frontend/src/pages/parent/LiveTracker.jsx`
- Shows the map with:
  - 🏠 **Home pin** (origin — parent's coordinate)
  - 🏫 **School pin** (destination — auto-set)
  - 🚌 **Bus pin** (live, moving — from Socket.IO room `vehicle:<vehicle_id>`)
- Info panel (same as notes sketch):
  - Vehicle No. + Driver Name + 📞 call button
  - Current Status, Speed, Last Updated
- Subscribes to Socket.IO room for the chosen `vehicle_id` only
- **No fixed route polyline** — only the three points above are shown

#### [MODIFY] `frontend/src/App.jsx`
- Add React Router routes for all new pages
- Add a `ProtectedRoute` wrapper that reads JWT from `localStorage`, decodes role, and redirects unauthorized users

#### [NEW] `frontend/src/context/AuthContext.jsx`
- Global auth state: `user`, `token`, `role`
- `login()`, `logout()` helper functions
- Provides state to all components via React Context

#### [NEW] `frontend/src/services/api.js`
- Centralized Axios instance with base URL and auto-attach JWT header from `localStorage`

---

## User Flow Diagrams

### Operator Flow
```
Register/Login → Operator Dashboard
  ├── Add School (name, coordinates)
  ├── Add Vehicle (vehicle no. → auto slot)
  ├── View vehicle list → call driver / see on map / edit
  └── (future: assign drivers, view all routes)
```

### Driver Flow
```
Register/Login
  ├── If "Under Operator" → enter operator's vehicle no. to link
  └── If "Independent" → enter own vehicle no. (self-registered)
        ↓
Driver Dashboard → Transmitter Mode
  ├── Start Transmitting → GPS broadcasts to vehicle:<vehicle_id> room
  └── Stop Transmission
```

### Parent Flow
```
Register/Login → Parent Dashboard
  ├── Route Manager (Wizard)
  │     Step 1: Select School → destination auto-set
  │     Step 2: Select Bus for that school
  │     Step 3: Drop home pin / use GPS → origin auto-set
  │     Done → profile saved
  └── Live Tracker
        → Map shows: 🏠 Home | 🏫 School | 🚌 Live Bus
        → Bus position updates in real-time via Socket.IO
        → (Parent can update home coords anytime from Route Manager)
```

---

## Key Design Decisions

> [!IMPORTANT]
> **No Fixed Routes for Buses**: Buses do NOT have a predefined polyline route. Each parent creates their own private "route" (just home + school coordinates). The bus location is tracked live via GPS. This is intentional and correct per your design — if a new student joins, the bus just changes direction and all parents see the live bus position regardless.

> [!IMPORTANT]
> **Parent Route is Private**: The home+school+vehicle selection is stored per-parent and is only visible to that parent. No other user can see another parent's "route."

> [!NOTE]
> **Driver Registration Modes**:
> - *Under Operator*: Driver enters the vehicle number that the operator has already registered. The system links the driver to that vehicle.
> - *Independent (No Operator)*: Driver registers their own vehicle number (not pre-registered). This is for private vehicle operators.

> [!NOTE]
> **JWT Strategy**: Short-lived access tokens (24h) stored in `localStorage`. Role is embedded in the token payload so every API call automatically enforces role-based access without extra DB lookups.

---

## Open Questions

> [!IMPORTANT]
> **Q1**: For the **Operator's vehicle list**, can a single operator have vehicles linked to **multiple schools**? Or does one operator = one school? This affects the DB schema slightly.

> [!IMPORTANT]
> **Q2**: When a **Driver registers "Under Operator"**, they enter the vehicle number. Should the system **automatically link** them to that vehicle, or should the Operator need to **approve/confirm** the driver before they can transmit?

> [!IMPORTANT]
> **Q3**: For **Parent's Live Tracker** — should the map show a **straight line** between home and school (just for visual reference), or only the three individual pins with no connecting line?

> [!NOTE]
> **Q4**: Is there a preference for notification delivery (SMS/WhatsApp)? The existing system has an SMS socket — should the parent notification preference be wired up in Phase 1, or deferred to a later phase?

---

## Files Summary

| File | Status | Description |
|------|--------|-------------|
| `backend/config/db.js` | MODIFY | Add 5 new tables |
| `backend/middleware/auth.js` | NEW | JWT auth middleware |
| `backend/routes/authRoutes.js` | NEW | Register/Login/Me endpoints |
| `backend/controllers/authController.js` | NEW | Auth logic + bcrypt + JWT |
| `backend/routes/operatorRoutes.js` | NEW | Operator API endpoints |
| `backend/controllers/operatorController.js` | NEW | Operator logic |
| `backend/routes/parentRoutes.js` | NEW | Parent API endpoints |
| `backend/controllers/parentController.js` | NEW | Parent logic |
| `backend/routes/driverRoutes.js` | NEW | Driver API endpoints |
| `backend/controllers/driverController.js` | NEW | Driver logic |
| `backend/sockets/locationSocket.js` | MODIFY | Add vehicle-room broadcasting |
| `backend/server.js` | MODIFY | Mount new routes |
| `backend/package.json` | MODIFY | Add bcryptjs, jsonwebtoken, uuid |
| `frontend/src/pages/Login.jsx` | MODIFY | Add Register + role selector |
| `frontend/src/pages/operator/OperatorDashboard.jsx` | NEW | Operator vehicle list |
| `frontend/src/pages/operator/AddVehicleModal.jsx` | NEW | Add vehicle form |
| `frontend/src/pages/driver/DriverDashboard.jsx` | NEW | Transmitter mode UI |
| `frontend/src/pages/parent/ParentDashboard.jsx` | NEW | Parent layout container |
| `frontend/src/pages/parent/RouteManager.jsx` | NEW | 3-step route wizard |
| `frontend/src/pages/parent/LiveTracker.jsx` | NEW | Live map tracking |
| `frontend/src/context/AuthContext.jsx` | NEW | Global auth state |
| `frontend/src/services/api.js` | NEW | Axios instance with auth |
| `frontend/src/App.jsx` | MODIFY | Role-based routing |

---

## Verification Plan

### Automated
- Manual API testing via browser/Postman for each role's endpoints after implementation

### Manual Verification Steps
1. Register as Operator → add school → add vehicle → verify slot auto-generated
2. Register as Driver → link to operator's vehicle → go to dashboard → start transmitting
3. Register as Parent → select school → select vehicle → drop home pin → go to Live Tracker → verify bus moves in real-time
4. Verify Parent B cannot see Parent A's home location
5. Verify Driver cannot access Operator routes and vice versa
