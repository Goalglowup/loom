### 2026-03-01: User directive — default tenant on user creation
**By:** Michael Brown (via Copilot)
**What:** When a user is created (via signup or invite acceptance), a default user-owned personal tenant must always be created. The User domain entity's factory method should encapsulate this rule — taking email and password hash, constructing the User, a Tenant, and a TenantMembership (owner) as a unit. This is a domain invariant, not a service-layer concern.
**Why:** User request — captured for team memory
