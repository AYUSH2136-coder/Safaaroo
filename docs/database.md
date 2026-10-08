# Database Documentation

SafaaRoo currently uses **SQLite** as its relational database for development and prototyping. 
The database file is created dynamically at `backend/dev.db` when the server starts.

## Initialization & Schema

The database schema is defined and initialized inside `backend/config/db.js`. 
When the Node.js server starts (`npm start` or `node server.js`), it executes `db.js`, which connects to SQLite and automatically creates all required tables if they do not exist.

To recreate a fresh database for local development:
1. Stop the backend server.
2. Delete the file: `backend/dev.db`
3. Restart the server (`npm start`). A fresh `dev.db` will be instantiated with the default schema.

*Note: Never commit `dev.db` or any `*.sqlite` files to version control.*

## Core Entities and Relationships

The database architecture is designed with the principle that **a bus (vehicle) is an independent tracking asset** and is not rigidly bound to a single school, route, or parent. It operates through "Service Slots" and dynamic assignments.

### 1. Users & Roles
- **Table:** `users`
- **Purpose:** Centralized user management.
- **Roles:** `operator`, `driver`, `parent`
- **Fields:** `user_id`, `mobile`, `password` (hashed), `name`, `role`, `status`

### 2. Assets (Vehicles)
- **Table:** `vehicles`
- **Purpose:** Represents the physical bus.
- **Fields:** `vehicle_id`, `vehicle_name`, `operator_id`, `driver_id` (current driver claim), `status` (active/inactive)
- **Concept:** Vehicles belong to an Operator, but a Driver "claims" a vehicle when they begin a trip.

### 3. Service Slots
- **Table:** `service_slots`
- **Purpose:** Logical assignments for transportation (e.g. "Morning Shift 1").
- **Relationships:**
  - `service_slot_schools`: Maps a slot to multiple schools.
  - A slot has an optional, default `vehicle_id` (the usual bus that drives this slot).

### 4. Dynamic Tracking Sessions
These tables handle the live-tracking lifecycle:
- **Table:** `transmission_sessions`
  - Created when a driver starts transmitting. Maps `driver_id`, `vehicle_id`, and `slot_no`. Contains the `last_lat`, `last_lng`, and `status = 'ACTIVE'`.
- **Table:** `slot_assignments`
  - Binds a specific vehicle to a specific service slot dynamically during an active transmission session.

### 5. Parent Profiles & Routes
- **Table:** `parent_profiles`
  - Stores global tracking preferences for a parent user.
- **Table:** `parent_routes`
  - Defines the parent's custom journey map.
  - Links to a specific `slot_no` (Service Slot).
  - Contains personal coordinates (`home_lat`, `home_lng`, `pickup_name`) and optional custom school settings.

### 6. Legacy / Core Tracking
- **Table:** `devices`
  - Stores hardware-level tracking data (last latitude, longitude, `status = online/offline`, `is_transmitting`).

## Migration Strategy
If migrating to Production, this schema should be easily portable to PostgreSQL or MySQL, as the queries and constraints heavily rely on standard SQL relationships (FOREIGN KEYS) and basic data types.
