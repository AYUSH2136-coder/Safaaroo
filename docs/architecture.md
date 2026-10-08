# SafaaRoo Architecture

SafaaRoo is a full-stack, real-time location tracking system primarily designed for school transport tracking. 

## Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite (Development)
- **Real-Time Communication**: Socket.IO
- **Mobile Frontend**: Flutter, Dart (Provider state management)
- **Mapping**: Mapbox
- **Web Frontend**: React, Vite (Administrative interfaces)

## Core Architectural Principle

A fundamental design choice in SafaaRoo is that **a BUS (Vehicle) is an INDEPENDENT tracking asset**.

The bus must NOT be permanently bound to a route, a school, a parent, or a specific time slot. Instead, the architecture uses a dynamic assignment model.

### Key Concepts

1. **Vehicle (Bus):** A physical asset registered by an Operator.
2. **Service Slot:** A logical transport job (e.g., "Morning Slot 1"). Parents subscribe to Service Slots, NOT to physical buses.
3. **Trip / Transmission Session:** The ephemeral, active period when a Driver selects a Vehicle and starts transmitting GPS coordinates.
4. **Slot Assignment:** When a Driver starts a trip in a Vehicle that is scheduled for a Service Slot, the backend temporarily binds the physical Vehicle to the logical Service Slot for the duration of the trip.
5. **Parent-Defined Route:** Parents create custom UI representations of their child's journey (Start -> Pickup -> School). They subscribe their custom Route to a *Service Slot*.

### The Flow of Data

```text
Driver Mobile App
        ↓  (GPS Location Stream)
    Socket.IO
        ↓  (Backend)
SafaaRoo Server
        ↓  (Updates: `devices`, `transmission_sessions`)
Live Trip / Tracking State
        ↓  (Backend resolves the active Service Slot for the Vehicle)
    Socket.IO (Emits to `slot:{slot_no}` room)
        ↓
Authorized Parent
        ↓  (Receives socket data)
Parent Mobile App (Updates live marker on custom Journey Route)
```

## Modular Structure
- `/backend`: Node.js backend handling REST APIs, Auth (JWT), and Socket.IO.
- `/Safaaroo`: Flutter mobile application for Drivers (GPS transmission) and Parents (Live tracking UI).
- `/frontend`: React/Vite dashboard for external monitoring/management.
