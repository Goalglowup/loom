# Legacy Service Audit: PortalService & AdminService vs Domain Layer

**Date:** 2026-02-27  
**Auditor:** Keaton  
**Requested by:** Michael Brown

## Executive Summary

This audit compares the legacy services (PortalService, AdminService) against the new domain-layer services (UserManagementService, TenantManagementService, TenantService) to identify custom logic that exists in legacy but is missing from the domain layer.

**Key Finding:** The domain-layer services are missing **critical infrastructure** that exists in legacy services, primarily around:
1. **Default agent creation** on tenant signup
2. **Cache invalidation** after state-mutating operations
3. **Provider cache eviction** after config changes
4. **JWT token signing** (exists in UserManagementService but isolated)
5. **Business rules** for last-owner protection and role validations
6. **Invite validation logic** (partially present)
7. **Multi-tenant switching** and profile enrichment

---

## Method-by-Method Gap Analysis

### PortalService Methods

#### 1. `signup(email, password, tenantName)`

**Domain Equivalent:** `UserManagementService.createUser(dto)`

**Gaps:**

| Missing Logic | Complexity | Details |
|--------------|------------|---------|
| Default agent creation | **Moderate** | PortalService creates a default agent (`INSERT INTO agents (tenant_id, name) VALUES (?, 'Default')`) during signup transaction. UserManagementService does NOT create any agent. This breaks API key creation later (API keys require an agent). |
| Transaction boundary | **Trivial** | PortalService uses Knex transaction for tenant→user→membership→agent creation. UserManagementService uses ORM flush but has the same atomic semantics. |
| Email case normalization | **Trivial** | Both do `.toLowerCase()` on email. No gap. |
| Email uniqueness check with 409 | **Trivial** | PortalService pre-checks email and throws 409. UserManagementService relies on database constraint (throws generic error). Need explicit check. |
| Tenant name trimming | **Trivial** | PortalService trims tenant name. UserManagementService uses raw `dto.tenantName ?? '{email}'s Workspace'`. Need trim. |

**Critical Gap:** Default agent creation. Without it, subsequent API key creation will fail because `createApiKey` requires an agent.

---

#### 2. `signupWithInvite(email, password, inviteToken)`

**Domain Equivalent:** `UserManagementService.acceptInvite(dto)`

**Gaps:**

| Missing Logic | Complexity | Details |
|--------------|------------|---------|
| Tenant status check in invite query | **Trivial** | PortalService joins tenants and checks `t.status = 'active'` in the invite validation query. UserManagementService checks invite expiry, revocation, and max_uses, but does NOT check tenant status. Could accept invite for inactive tenant. |
| Duplicate membership check with 409 | **Moderate** | PortalService checks if user is already a member and throws 409 "Already a member of this tenant". UserManagementService checks `existingMembership` but does NOT throw — it just skips creating a new membership. Silent failure vs. explicit error. |
| Use count increment | **Trivial** | Both increment `invite.useCount`. No gap. |
| Transaction boundary | **Trivial** | Both have atomic semantics. No gap. |

**Critical Gap:** Silent failure on duplicate membership invite acceptance.

---

#### 3. `login(email, password)`

**Domain Equivalent:** `UserManagementService.login(dto)`

**Gaps:**

| Missing Logic | Complexity | Details |
|--------------|------------|---------|
| Active tenant filtering | **Moderate** | PortalService returns only active tenants in `tenants` list (`WHERE t.status = 'active'`). UserManagementService does NOT filter by tenant status. Could return deactivated tenants in multi-tenant list. |
| All tenants list in response | **Moderate** | PortalService returns `tenants: [{id, name, role}, ...]` array for tenant switcher. UserManagementService returns only `tenantId, tenantName` for the first membership. Missing multi-tenant context. |
| Last login timestamp update | **Trivial** | Both update `user.lastLogin`. No gap. |
| No active memberships → 403 | **Trivial** | PortalService throws 403 if no active tenants. UserManagementService returns first membership even if tenant is inactive (allows login to inactive tenant). |

**Critical Gaps:**
1. No tenant status filtering
2. No multi-tenant list in response

---

#### 4. `switchTenant(userId, newTenantId)`

**Domain Equivalent:** **NONE** — no equivalent in domain services.

**Gaps:**

| Missing Logic | Complexity | Details |
|--------------|------------|---------|
| Entire method | **Complex** | PortalService validates membership, checks tenant status, re-signs JWT with new tenantId, and returns full context (user, tenants list). UserManagementService has no equivalent. Multi-tenant switching is entirely missing from domain layer. |

**Critical Gap:** Entire tenant-switching capability missing.

---

#### 5. `getMe(userId, tenantId)`

**Domain Equivalent:** **NONE** — no equivalent in domain services.

**Gaps:**

| Missing Logic | Complexity | Details |
|--------------|------------|---------|
| Entire method | **Moderate** | PortalService returns user profile + role + tenant details + provider config + agents list + subtenants list + all user tenants. This is a composite "dashboard bootstrap" query. No domain service provides this. TenantManagementService.getContext returns context for internal use, not for API response. |

**Critical Gap:** Profile/dashboard bootstrap query missing.

---

#### 6. `updateProviderSettings(tenantId, providerConfig, availableModels)`

**Domain Equivalent:** `TenantManagementService.updateSettings(tenantId, dto)`

**Gaps:**

| Missing Logic | Complexity | Details |
|--------------|------------|---------|
| Provider cache eviction | **Trivial** | PortalService calls `evictProvider(tenantId)` after updating provider config. TenantManagementService does NOT. This means updated provider config won't take effect until cache expires (stale provider). |
| JSON serialization | **Trivial** | PortalService explicitly serializes providerConfig with `JSON.stringify()`. TenantManagementService assigns object directly (ORM handles serialization). Functionally equivalent if ORM is configured correctly. |

**Critical Gap:** Cache eviction missing. Updated provider config will not take effect immediately.

---

#### 7. `createApiKey(tenantId, agentId, name)`

**Domain Equivalent:** `TenantManagementService.createApiKey(tenantId, agentId, dto)`

**Gaps:**

| Missing Logic | Complexity | Details |
|--------------|------------|---------|
| Agent existence validation | **Trivial** | PortalService pre-checks agent existence (`SELECT id FROM agents WHERE id = $1 AND tenant_id = $2`) and returns null if not found. TenantManagementService uses `findOneOrFail` which throws 404. Different error handling but similar security. |
| Raw key return | **Trivial** | Both return raw key. No gap. |
| Key prefix length | **Trivial** | PortalService uses 15 chars (`rawKey.slice(0, 15)`). Agent.createApiKey uses 12 chars (`rawKey.slice(0, 12)`). Inconsistent but trivial. |

**Gap:** Key prefix length inconsistency (15 vs 12).

---

#### 8. `revokeApiKey(tenantId, keyId)`

**Domain Equivalent:** `TenantManagementService.revokeApiKey(tenantId, keyId)`

**Gaps:**

| Missing Logic | Complexity | Details |
|--------------|------------|---------|
| Cache invalidation | **MODERATE** | PortalService returns `key_hash` for cache invalidation. Route handler calls `invalidateCachedKey(keyHash)`. TenantManagementService does NOT return key_hash and has no cache invalidation. Revoked key remains cached until TTL expires (60s window of vulnerability). |

**Critical Gap:** Revoked API keys remain cached and usable for up to 60 seconds after revocation.

---

#### 9. `listApiKeys(tenantId)`, `listTraces(...)`, `listInvites(...)`, `listMembers(...)`, etc.

**Domain Equivalent:** Similar methods exist in TenantManagementService.

**Gaps:**

| Missing Logic | Complexity | Details |
|--------------|------------|---------|
| JSONB deserialization | **Trivial** | PortalService relies on Knex auto-deserialization of JSON columns. Domain services rely on ORM. No gap if ORM is configured correctly. |
| Ordering | **Trivial** | PortalService explicitly orders results (`ORDER BY created_at DESC`, etc.). Domain services may not. Needs verification. |

**Gap:** Minor — result ordering may differ.

---

#### 10. `createInvite(tenantId, userId, maxUses, expiresInHours)`

**Domain Equivalent:** `TenantManagementService.inviteUser(tenantId, createdByUserId, dto)`

**Gaps:**

| Missing Logic | Complexity | Details |
|--------------|------------|---------|
| Token generation | **Trivial** | PortalService generates 32-byte base64url token. Tenant.createInvite does the same. No gap. |
| Expiry calculation | **Trivial** | PortalService uses hours, domain uses days. Both correct. No gap. |

**Gap:** None.

---

#### 11. `revokeInvite(tenantId, inviteId)`

**Domain Equivalent:** **NONE** — TenantManagementService does not have revokeInvite.

**Gaps:**

| Missing Logic | Complexity | Details |
|--------------|------------|---------|
| Entire method | **Trivial** | PortalService has `UPDATE invites SET revoked_at = now() WHERE id = $1 AND tenant_id = $2`. Domain layer has no equivalent. |

**Critical Gap:** Invite revocation missing from domain layer.

---

#### 12. `updateMemberRole(tenantId, targetUserId, role)`

**Domain Equivalent:** **NONE** — TenantManagementService does not have updateMemberRole.

**Gaps:**

| Missing Logic | Complexity | Details |
|--------------|------------|---------|
| Last-owner protection | **Moderate** | PortalService checks owner count before demotion (`SELECT COUNT(*) ... WHERE role = 'owner'`) and throws 400 if demoting last owner. Domain layer has no equivalent. |
| Entire method | **Moderate** | No domain equivalent. |

**Critical Gap:** Member role updates missing from domain layer.

---

#### 13. `removeMember(tenantId, targetUserId, requestingUserId)`

**Domain Equivalent:** **NONE** — TenantManagementService does not have removeMember.

**Gaps:**

| Missing Logic | Complexity | Details |
|--------------|------------|---------|
| Self-removal check | **Trivial** | PortalService prevents self-removal ("use leave instead"). Domain layer has no equivalent. |
| Last-owner protection | **Moderate** | Same as updateMemberRole — prevents removing last owner. Domain layer has no equivalent. |
| Entire method | **Moderate** | No domain equivalent. |

**Critical Gap:** Member removal missing from domain layer.

---

#### 14. `leaveTenant(userId, targetTenantId, currentTenantId)`

**Domain Equivalent:** **NONE** — TenantManagementService does not have leaveTenant.

**Gaps:**

| Missing Logic | Complexity | Details |
|--------------|------------|---------|
| Active tenant check | **Trivial** | PortalService prevents leaving currently active tenant ("switch tenant before leaving"). Domain layer has no equivalent. |
| Last-owner protection | **Moderate** | Same as above. |
| Entire method | **Moderate** | No domain equivalent. |

**Critical Gap:** Leave tenant capability missing from domain layer.

---

#### 15. `listSubtenants(tenantId)`, `createSubtenant(parentTenantId, userId, name)`

**Domain Equivalent:** `TenantManagementService.createSubtenant(parentTenantId, dto)`

**Gaps:**

| Missing Logic | Complexity | Details |
|--------------|------------|---------|
| Membership creation for creator | **Trivial** | PortalService creates owner membership for the creator. Tenant.createSubtenant does NOT create membership. Subtenant would be orphaned (no members). |

**Critical Gap:** Subtenant creator is not added as owner.

---

#### 16. Agent CRUD methods

**Domain Equivalent:** `TenantManagementService` has createAgent, updateAgent, deleteAgent.

**Gaps:**

| Missing Logic | Complexity | Details |
|--------------|------------|---------|
| Cache eviction after agent updates | **Trivial** | PortalService does NOT call evictProvider after agent updates. Neither does TenantManagementService. Both have this gap. Agent config changes (e.g., provider_config) won't take effect until cache expires. |
| Merge policies default | **Trivial** | PortalService uses `{ system_prompt: 'prepend', skills: 'merge', mcp_endpoints: 'merge' }`. Agent.createAgent uses `{ system_prompt: 'prepend', skills: 'merge', mcp_endpoints: 'merge' }`. Same. No gap. |

**Gap:** Agent cache eviction missing (shared gap).

---

#### 17. `getAgentResolved(agentId, userId)`, `getAgentForChat(agentId, userId)`

**Domain Equivalent:** **NONE** — no equivalent in domain services.

**Gaps:**

| Missing Logic | Complexity | Details |
|--------------|------------|---------|
| Recursive tenant chain resolution | **Complex** | PortalService uses recursive CTE to walk parent chain and resolve inherited config. TenantService.loadByApiKey does this for gateway auth, but no domain service exposes it for portal. |
| Entire method | **Complex** | No domain equivalent for resolved agent view. |

**Critical Gap:** Resolved agent view missing (needed for agent preview in portal).

---

#### 18. Partition and Conversation CRUD

**Domain Equivalent:** **NONE** — no domain services for conversations/partitions.

**Gaps:**

| Missing Logic | Complexity | Details |
|--------------|------------|---------|
| All partition/conversation methods | **Complex** | PortalService has full CRUD for partitions and conversations (listPartitions, createPartition, updatePartition, deletePartition, listConversations, getConversation). Domain layer has zero conversation management. Entire feature missing. |

**Critical Gap:** Conversation/partition management entirely missing from domain layer.

---

### AdminService Methods

#### 1. `validateAdminLogin(username, password)`

**Domain Equivalent:** **NONE** — no equivalent in domain services.

**Gaps:**

| Missing Logic | Complexity | Details |
|--------------|------------|---------|
| Scrypt password verification | **Trivial** | AdminService uses scrypt with timing-safe comparison. No domain equivalent. Admin auth is isolated to AdminService. |
| Entire method | **Trivial** | Admin login not in domain layer (by design — admin auth is separate from user auth). |

**Gap:** Not applicable — admin auth is intentionally separate.

---

#### 2. `updateAdminLastLogin(id)`

**Domain Equivalent:** **NONE** — no equivalent.

**Gap:** Not applicable.

---

#### 3. `createTenant(name)`, `listTenants(filters)`, `getTenant(id)`, `updateTenant(id, fields)`, `deleteTenant(id)`

**Domain Equivalent:** **NONE** — TenantManagementService does NOT have admin-level tenant CRUD (only owner-level updateSettings).

**Gaps:**

| Missing Logic | Complexity | Details |
|--------------|------------|---------|
| Admin-level tenant creation | **Trivial** | AdminService can create tenants without users. Domain layer cannot. |
| Tenant listing with filters | **Moderate** | AdminService supports pagination and status filters. Domain layer has no equivalent. |
| Tenant detail with API key count | **Trivial** | AdminService joins api_keys and returns count. Domain layer does not. |
| Hard tenant deletion | **Moderate** | AdminService can hard-delete tenants. Domain layer only supports soft updates. |
| Cache/provider eviction on delete | **Moderate** | AdminService calls `invalidateAllKeysForTenant()` and `evictProvider()` before deletion. Domain layer has no equivalent. |

**Critical Gap:** Admin tenant management missing from domain layer.

---

#### 4. `setProviderConfig(id, providerConfig)`, `clearProviderConfig(id)`

**Domain Equivalent:** `TenantManagementService.updateSettings` (partial).

**Gaps:**

| Missing Logic | Complexity | Details |
|--------------|------------|---------|
| Provider cache eviction | **Trivial** | AdminService route calls `evictProvider(id)` after config update. TenantManagementService does NOT. Same gap as PortalService. |

**Critical Gap:** Cache eviction missing.

---

#### 5. `createApiKey(tenantId, name, rawKey, keyPrefix, keyHash)`

**Domain Equivalent:** **NONE** — TenantManagementService.createApiKey requires agentId. AdminService bypasses agent requirement.

**Gaps:**

| Missing Logic | Complexity | Details |
|--------------|------------|---------|
| Direct API key creation | **Moderate** | AdminService creates API keys without agent association (legacy pattern). Domain layer requires agent. Different design. |

**Gap:** By design — domain layer enforces agent requirement.

---

#### 6. `revokeApiKey(keyId, tenantId)`, `hardDeleteApiKey(keyId, tenantId)`

**Domain Equivalent:** `TenantManagementService.revokeApiKey` (soft revoke only).

**Gaps:**

| Missing Logic | Complexity | Details |
|--------------|------------|---------|
| Hard delete | **Trivial** | AdminService supports permanent deletion. Domain layer does not. |
| Cache invalidation | **Moderate** | AdminService returns key_hash for cache invalidation. Route handler calls `invalidateCachedKey(keyHash)`. Domain layer does NOT. Same gap as PortalService. |

**Critical Gap:** Cache invalidation missing.

---

#### 7. `listTraces(filters)`

**Domain Equivalent:** **NONE** — no domain service for trace listing.

**Gap:** Trace listing is an admin/analytics feature, not domain logic. Not applicable.

---

## Summary of Critical Gaps

### **MUST-FIX (breaks functionality):**

1. **Default agent creation on signup** (Moderate)
   - Without this, API key creation fails.
   - **Fix:** UserManagementService.createUser must create a default agent.

2. **Cache invalidation after API key revocation** (Moderate)
   - Revoked keys remain usable for 60s.
   - **Fix:** TenantManagementService.revokeApiKey must return key_hash and route must call invalidateCachedKey.

3. **Provider cache eviction after config updates** (Trivial)
   - Updated provider config doesn't take effect until cache expires.
   - **Fix:** TenantManagementService.updateSettings must call evictProvider after providerConfig change.

4. **Subtenant creator membership** (Trivial)
   - Subtenant creator is not added as owner.
   - **Fix:** TenantManagementService.createSubtenant must add creator as owner.

5. **Invite revocation** (Trivial)
   - No way to revoke invites in domain layer.
   - **Fix:** Add revokeInvite method to TenantManagementService.

6. **Member role updates** (Moderate)
   - No way to change roles in domain layer.
   - **Fix:** Add updateMemberRole method to TenantManagementService with last-owner protection.

7. **Member removal** (Moderate)
   - No way to remove members in domain layer.
   - **Fix:** Add removeMember method to TenantManagementService with last-owner protection.

8. **Leave tenant** (Moderate)
   - No way for users to leave tenants in domain layer.
   - **Fix:** Add leaveTenant method to UserManagementService with last-owner protection.

9. **Tenant switching** (Complex)
   - Entire multi-tenant switching flow missing.
   - **Fix:** Add switchTenant method to UserManagementService.

10. **Login: active tenant filtering** (Moderate)
    - Login returns inactive tenants in multi-tenant list.
    - **Fix:** UserManagementService.login must filter by `t.status = 'active'`.

11. **Login: multi-tenant list in response** (Moderate)
    - Login returns only primary tenant, not all tenants.
    - **Fix:** UserManagementService.login must return `tenants: [{id, name, role}, ...]`.

12. **Invite acceptance: tenant status check** (Trivial)
    - Can accept invite for inactive tenant.
    - **Fix:** UserManagementService.acceptInvite must check `tenant.status = 'active'`.

13. **Invite acceptance: duplicate membership error** (Moderate)
    - Silent failure vs. explicit 409 error.
    - **Fix:** UserManagementService.acceptInvite must throw if already a member.

### **NICE-TO-HAVE (feature parity):**

14. **Profile/dashboard bootstrap query** (Moderate)
    - getMe composite query missing.
    - **Fix:** Add getProfile method to UserManagementService or create separate ProfileService.

15. **Resolved agent view** (Complex)
    - getAgentResolved with recursive tenant chain missing.
    - **Fix:** Add getAgentResolved method to TenantManagementService.

16. **Conversation/partition management** (Complex)
    - Entire conversation CRUD missing.
    - **Fix:** Create ConversationManagementService.

17. **Admin tenant management** (Moderate-Complex)
    - Admin-level tenant CRUD missing.
    - **Fix:** Create AdminTenantManagementService or add admin methods to TenantManagementService.

18. **Agent cache eviction after updates** (Trivial)
    - Agent config changes don't invalidate cache.
    - **Fix:** TenantManagementService.updateAgent must call evictProvider if providerConfig changes.

19. **Email uniqueness check with 409** (Trivial)
    - UserManagementService relies on DB constraint instead of pre-check.
    - **Fix:** Add explicit check before creating user.

20. **Tenant name trimming** (Trivial)
    - UserManagementService doesn't trim tenant name.
    - **Fix:** Add `.trim()` in createUser.

---

## Recommendations

### Phase 1: Fix Blocking Issues (Must-Fix 1-13)
- These break functionality or create security gaps.
- Estimated effort: **3-5 days** (1 backend engineer).

### Phase 2: Feature Parity (Nice-to-Have 14-20)
- These add missing features but don't break existing flows.
- Estimated effort: **5-7 days** (1 backend engineer).

### Migration Strategy

**Option A: Enhance Domain Services**
- Add missing methods to UserManagementService and TenantManagementService.
- Pros: Cleaner architecture, ORM-based, testable.
- Cons: Requires significant additions to domain layer.

**Option B: Keep Legacy Services**
- Continue using PortalService and AdminService.
- Pros: No migration cost, proven stable.
- Cons: Technical debt, inconsistent patterns.

**Recommendation:** **Option A** — migrate to domain services over 2 sprints, fixing must-fix issues in Sprint 1 and nice-to-have in Sprint 2.

---

## Appendix: Side-by-Side Comparison Table

| Feature | PortalService | AdminService | UserManagementService | TenantManagementService | TenantService | Gap? |
|---------|--------------|--------------|----------------------|------------------------|---------------|------|
| Signup | ✅ | ❌ | ✅ | ❌ | ❌ | Default agent missing |
| Signup with invite | ✅ | ❌ | ✅ | ❌ | ❌ | Tenant status check missing |
| Login | ✅ | ❌ | ✅ | ❌ | ❌ | Active tenant filter + multi-tenant list missing |
| Switch tenant | ✅ | ❌ | ❌ | ❌ | ❌ | **Entire feature missing** |
| Get profile | ✅ | ❌ | ❌ | ❌ | ❌ | **Entire feature missing** |
| Update provider settings | ✅ | ✅ | ❌ | ✅ | ❌ | Cache eviction missing |
| Create API key | ✅ | ✅ | ❌ | ✅ | ❌ | Key prefix length inconsistency |
| Revoke API key | ✅ | ✅ | ❌ | ✅ | ❌ | **Cache invalidation missing** |
| List API keys | ✅ | ✅ | ❌ | ✅ | ❌ | None |
| Create invite | ✅ | ❌ | ❌ | ✅ | ❌ | None |
| Revoke invite | ✅ | ❌ | ❌ | ❌ | ❌ | **Entire feature missing** |
| List invites | ✅ | ❌ | ❌ | ❌ | ❌ | **Entire feature missing** |
| List members | ✅ | ❌ | ❌ | ✅ | ❌ | None |
| Update member role | ✅ | ❌ | ❌ | ❌ | ❌ | **Entire feature missing** |
| Remove member | ✅ | ❌ | ❌ | ❌ | ❌ | **Entire feature missing** |
| Leave tenant | ✅ | ❌ | ❌ | ❌ | ❌ | **Entire feature missing** |
| List subtenants | ✅ | ❌ | ❌ | ❌ | ❌ | **Entire feature missing** |
| Create subtenant | ✅ | ❌ | ❌ | ✅ | ❌ | Creator membership missing |
| Create agent | ✅ | ❌ | ❌ | ✅ | ❌ | None |
| Update agent | ✅ | ❌ | ❌ | ✅ | ❌ | Cache eviction missing |
| Delete agent | ✅ | ❌ | ❌ | ✅ | ❌ | None |
| Get agent resolved | ✅ | ❌ | ❌ | ❌ | ❌ | **Entire feature missing** |
| Partitions CRUD | ✅ | ❌ | ❌ | ❌ | ❌ | **Entire feature missing** |
| Conversations CRUD | ✅ | ❌ | ❌ | ❌ | ❌ | **Entire feature missing** |
| Admin tenant CRUD | ❌ | ✅ | ❌ | ❌ | ❌ | **Entire feature missing** |
| Admin login | ❌ | ✅ | ❌ | ❌ | ❌ | N/A (by design) |

---

**End of Audit**
