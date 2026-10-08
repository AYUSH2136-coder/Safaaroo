# SafaaRoo API Documentation

All API requests (except public ones like Login/Register) must include a valid JWT token in the `Authorization` header:
`Authorization: Bearer <token>`

---

## Auth API (`/api/auth`)

### `POST /api/auth/register`
**Purpose:** Register a new user.
**Request Body:** `name`, `mobile`, `password`, `role` (parent, driver, operator).
**Response:** Success message and `user_id`.

### `POST /api/auth/login`
**Purpose:** Authenticate a user and receive a JWT.
**Request Body:** `mobile`, `password`, `role`.
**Response:** `token`, `user` object.

---

## Parent API (`/api/parent`)

### `GET /api/parent/schools`
**Purpose:** Retrieve a list of registered schools for route setup.
**Response:** Array of `schools`.

### `GET /api/parent/vehicles`
**Purpose:** Fetch vehicles/slots attached to a specific school.
**Query Params:** `school_id`
**Response:** Array of `vehicles`/`slots`.

### `POST /api/parent/routes`
**Purpose:** Create a new custom route for the parent.
**Request Body:** `route_name`, `slot_no`, `school_id` (optional), custom coordinates, etc.
**Response:** Success message and `route_id`.

### `GET /api/parent/routes`
**Purpose:** Retrieve all routes belonging to the authenticated parent.
**Response:** Array of `routes`.

### `GET /api/parent/routes/:routeId`
**Purpose:** Fetch details for a specific route.
**Response:** Single `route` object.

### `DELETE /api/parent/routes/:routeId`
**Purpose:** Delete a custom route.
**Response:** Success message.

---

## Driver API (`/api/driver`)

### `GET /api/driver/profile`
**Purpose:** Retrieve driver profile information including currently active vehicle.
**Response:** `profile` object.

### `GET /api/driver/vehicles`
**Purpose:** Retrieve the driver's historical list of driven vehicles.
**Response:** Array of `vehicles`.

### `POST /api/driver/vehicles`
**Purpose:** Add a vehicle to the driver's list by ID.
**Request Body:** `vehicle_id`
**Response:** Success message.

### `DELETE /api/driver/vehicles/:vehicleId`
**Purpose:** Remove a vehicle from the driver's list.
**Response:** Success message.

### `POST /api/driver/start-transmission`
**Purpose:** Claim a vehicle and begin an active trip/transmission session.
**Request Body:** `vehicle_id`
**Response:** `vehicle_id`, `session_id`, `slot_no` (if applicable).

### `POST /api/driver/stop-transmission`
**Purpose:** End the active trip and release the vehicle claim.
**Response:** Success message.

---

## Operator API (`/api/operator`)
*(Restricted to Operator role users)*

### `GET /api/operator/dashboard`
**Purpose:** Get summary statistics for operator's fleet.
**Response:** Count of drivers, buses, schools.

### `GET /api/operator/vehicles`
**Purpose:** List all vehicles managed by the operator.
**Response:** Array of `vehicles`.

### `POST /api/operator/vehicles`
**Purpose:** Register a new vehicle.
**Request Body:** `vehicle_id`, `vehicle_name`.
**Response:** Success message.

### `GET /api/operator/slots`
**Purpose:** Fetch all service slots for the operator.
**Response:** Array of `slots`.

### `POST /api/operator/slots`
**Purpose:** Create a new service slot.
**Request Body:** `slot_name`, `vehicle_id` (optional).
**Response:** `slot_no`.
