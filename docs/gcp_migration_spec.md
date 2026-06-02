# Arachne — Azure to GCP Migration Spec

**Author:** Michael Brown, CEO
**Date:** 2026-04-28
**Status:** Planning
**Version:** 0.1

---

## 1. Overview

Migrate all Arachne infrastructure from Microsoft Azure to Google Cloud Platform. Synaptic Weave's Azure for Startups credits have lapsed; GCP is now the primary cloud provider via Google Cloud for Startups ($25K credits) and the Google Cloud Partner Program.

**Target GCP project:** TBD (create `arachne-prod` and `arachne-dev`)
**Target region:** `us-central1` (consistent with Calliope)
**Deadline:** Before Azure resources are suspended

---

## 2. Service Mapping

| Component | Azure (current) | GCP (target) |
|-----------|----------------|--------------|
| Container runtime | Azure Container Apps | Cloud Run |
| PostgreSQL database | Azure Database for PostgreSQL Flexible Server | Cloud SQL (PostgreSQL 16) |
| Secrets management | Azure Key Vault | Secret Manager |
| Observability | Azure Log Analytics + App Insights | Cloud Logging + Cloud Monitoring |
| Static site / CDN | Azure Static Web Apps | Firebase Hosting |
| Terraform state | Azure Blob Storage | GCS bucket |
| CI/CD identity | Azure AD service principal | Workload Identity Federation |
| Managed identity | Azure User-Assigned Managed Identity | GCP Service Account |
| DNS | Azure DNS Zones | Cloud DNS (or keep at current registrar) |
| Container registry | GHCR (unchanged) | GHCR (unchanged) |

---

## 3. Current Azure Architecture

### Resources (from Terraform)

**Compute:**
- Azure Container Apps environment
- Gateway container app (`arachne-gateway`)
- Portal container app (`arachne-portal`)
- Smoke runner sidecar

**Database:**
- PostgreSQL Flexible Server, v15, SKU: `B_Standard_B1ms`
- 32 GB storage
- Admin login: `arachneadmin`
- pgvector extension enabled

**Secrets (Key Vault):**
- `database-url` — full PostgreSQL connection string
- `master-key` — AES-256-GCM encryption master key (64-char hex)
- `jwt-secret` — Portal JWT signing secret
- `admin-jwt-secret` — Admin JWT signing secret
- `db-admin-password` — PostgreSQL admin password

**Networking:**
- DNS zones: `arachne-ai.com`, `arachne-ai.dev`
- CORS origin: `https://arachne-ai.com`
- Gateway and portal exposed via custom domains

**CI/CD:**
- Azure AD service principal with Contributor role
- GitHub Actions federated identity

**Observability:**
- Log Analytics workspace
- Linked to Container Apps environment

---

## 4. Target GCP Architecture

### 4.1 Compute — Cloud Run

Both gateway and portal run as Cloud Run services.

| Service | Image | Port | Auth |
|---------|-------|------|------|
| `arachne-gateway` | `ghcr.io/synaptic-weave/arachne-gateway:latest` | 3000 | Public (API key auth in app) |
| `arachne-portal` | `ghcr.io/synaptic-weave/arachne-portal:latest` | 3000 | Public |

**Cloud Run config per service:**
- Region: `us-central1`
- Min instances: 0 (dev), 1 (prod)
- Max instances: 10
- CPU: 1
- Memory: 512Mi (portal), 1Gi (gateway)
- Concurrency: 80
- Service account: `arachne-runtime@{project}.iam.gserviceaccount.com`

**GHCR auth:** Cloud Run pulls from GHCR using a GitHub PAT stored in Secret Manager, referenced at deploy time.

### 4.2 Database — Cloud SQL

| Setting | Value |
|---------|-------|
| Engine | PostgreSQL 16 |
| Instance tier | `db-f1-micro` (dev), `db-g1-small` (prod) |
| Region | `us-central1` |
| Storage | 32 GB SSD, auto-grow enabled |
| Backups | Daily automated, 7-day retention |
| Extensions | `pgvector` (enable via database flags) |
| Connectivity | Private IP via VPC connector (no public IP in prod) |
| SSL | Required |

**Database name:** `arachne`
**Admin user:** `arachneadmin`

### 4.3 Secrets — Secret Manager

| Secret Name | Value |
|-------------|-------|
| `arachne-database-url` | `postgresql://arachneadmin:{password}@{cloud-sql-ip}:5432/arachne?sslmode=require` |
| `arachne-master-key` | 64-char hex (regenerate or copy from Key Vault) |
| `arachne-portal-jwt-secret` | JWT signing secret |
| `arachne-admin-jwt-secret` | Admin JWT signing secret |
| `arachne-db-admin-password` | PostgreSQL admin password |
| `arachne-ghcr-token` | GitHub PAT for GHCR pulls |

Service account `arachne-runtime` granted `roles/secretmanager.secretAccessor`.

### 4.4 Networking — VPC + Serverless VPC Connector

```
VPC: arachne-vpc
  Subnet: arachne-subnet (10.0.0.0/24, us-central1)
  Serverless VPC Connector: arachne-connector
    → Connects Cloud Run to Cloud SQL private IP
    → Range: 10.8.0.0/28
```

Cloud SQL uses private IP only (prod). Cloud Run services access it via the VPC connector.

### 4.5 Observability — Cloud Logging + Monitoring

- Cloud Run logs automatically flow to Cloud Logging
- Create log-based metrics for error rates and latency
- Uptime checks for gateway and portal URLs
- Alert policies: error rate > 1%, p95 latency > 2s

### 4.6 Static Site — Firebase Hosting

Portal SPA served via Firebase Hosting:
- Custom domain: `arachne-ai.com` (gateway), `app.arachne-ai.com` (portal)
- Firebase Hosting handles SSL and CDN automatically
- Deploy via `firebase deploy` in CI/CD

Alternatively: Cloud Run with `@fastify/static` already serves the portal SPA — Firebase Hosting may be unnecessary if the portal container handles static serving.

**Decision:** Use Cloud Run for portal (already containerized, simpler). Firebase Hosting only if CDN performance becomes a concern.

### 4.7 CI/CD — Workload Identity Federation

Replace Azure AD service principal with GCP Workload Identity Federation for GitHub Actions.

```
GitHub Actions OIDC → GCP Workload Identity Pool
  → Service account: arachne-cicd@{project}.iam.gserviceaccount.com
  → Roles: Cloud Run Admin, Artifact Registry Reader, Secret Manager Accessor
```

No long-lived credentials stored in GitHub. Token is minted per workflow run.

### 4.8 Terraform State — GCS

```
Bucket: gs://arachne-tfstate-{project-id}
  Location: us-central1
  Versioning: enabled
  Uniform bucket-level access: enabled
```

---

## 5. Terraform Migration Plan

### 5.1 Module Replacements

| Current Azure Module | New GCP Module |
|---------------------|----------------|
| `modules/observability` (Log Analytics) | `modules/observability` (Cloud Logging metrics + alerts) |
| `modules/keyvault` | `modules/secrets` (Secret Manager) |
| `modules/database` (Azure PostgreSQL) | `modules/database` (Cloud SQL) |
| `modules/container_apps` | `modules/cloud_run` |
| `modules/static_site` (Azure Static Web Apps) | Remove (Cloud Run serves portal) |
| `modules/cicd` (Azure AD SP) | `modules/cicd` (Workload Identity Federation) |

### 5.2 New Root Providers

```hcl
terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }

  backend "gcs" {
    bucket = "arachne-tfstate-{project-id}"
    prefix = "terraform/state"
  }
}
```

### 5.3 New Variables

| Variable | Description |
|----------|-------------|
| `project_id` | GCP project ID (`arachne-prod` or `arachne-dev`) |
| `region` | GCP region (default: `us-central1`) |
| `environment` | `dev` or `prod` |
| `ghcr_owner` | GitHub org (unchanged: `synaptic-weave`) |
| `db_tier` | Cloud SQL tier |
| `allowed_origins` | CORS origins |

---

## 6. Database Migration

### 6.1 Export from Azure PostgreSQL

```bash
# On a machine with access to Azure PostgreSQL
pg_dump \
  --host={azure-fqdn} \
  --username=arachneadmin \
  --dbname=arachne \
  --format=custom \
  --no-owner \
  --no-acl \
  --file=arachne_dump.pgdump
```

### 6.2 Enable pgvector on Cloud SQL

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Add to Terraform database module:
```hcl
resource "google_sql_database" "arachne" {
  name     = "arachne"
  instance = google_sql_database_instance.main.name
}
```

Database flags:
```hcl
database_flags {
  name  = "cloudsql.enable_pgvector"
  value = "on"
}
```

### 6.3 Import to Cloud SQL

```bash
# Via Cloud SQL proxy
cloud-sql-proxy {project}:us-central1:arachne-db &

pg_restore \
  --host=127.0.0.1 \
  --port=5432 \
  --username=arachneadmin \
  --dbname=arachne \
  --no-owner \
  arachne_dump.pgdump
```

### 6.4 Verify

```bash
# Check row counts match
psql -c "SELECT schemaname, tablename, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;"

# Check pgvector is working
psql -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
```

---

## 7. DNS Migration

Current DNS zones on Azure: `arachne-ai.com`, `arachne-ai.dev`

**Options:**
1. **Keep at current registrar, update A records** — simplest, no zone migration needed
2. **Migrate zones to Cloud DNS** — cleaner long-term, manageable via Terraform

**Recommendation:** Migrate to Cloud DNS for Terraform-managed DNS. Export current zone records first.

### DNS Records (target)

| Record | Type | Value |
|--------|------|-------|
| `arachne-ai.com` | A | Cloud Run gateway IP (via load balancer) |
| `app.arachne-ai.com` | A | Cloud Run portal IP |
| `arachne-ai.dev` | A | Dev environment Cloud Run IP |

**Note:** Cloud Run services get a `*.run.app` URL by default. Custom domains require a Global Load Balancer + managed SSL cert or Firebase Hosting.

---

## 8. Secrets Migration

Secrets cannot be copied programmatically from Azure Key Vault to GCP Secret Manager (by design). Manual steps:

1. Read each secret value from Azure Key Vault (portal or `az keyvault secret show`)
2. Create corresponding secret in GCP Secret Manager
3. Do NOT regenerate `master-key` — existing encrypted data in the database requires the same key

**Critical:** The `master-key` must be copied exactly. Regenerating it will make all encrypted trace data and conversation messages unreadable.

```bash
# Read from Azure (while access still available)
az keyvault secret show --vault-name kv-arachne-prod --name master-key --query value -o tsv

# Write to GCP
echo -n "{value}" | gcloud secrets create arachne-master-key \
  --data-file=- \
  --replication-policy=automatic
```

---

## 9. CI/CD Migration

### Current (Azure)
GitHub Actions authenticates to Azure using a service principal with federated OIDC credentials.

### Target (GCP Workload Identity Federation)

```bash
# Create Workload Identity Pool
gcloud iam workload-identity-pools create github-pool \
  --location=global \
  --display-name="GitHub Actions Pool"

# Create provider
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global \
  --workload-identity-pool=github-pool \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository"

# Bind to service account
gcloud iam service-accounts add-iam-policy-binding \
  arachne-cicd@{project}.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/{project-number}/locations/global/workloadIdentityPools/github-pool/attribute.repository/synaptic-weave/arachne"
```

### GitHub Actions workflow changes

Replace `azure/login` action with `google-github-actions/auth`:

```yaml
- uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: projects/{number}/locations/global/workloadIdentityPools/github-pool/providers/github-provider
    service_account: arachne-cicd@{project}.iam.gserviceaccount.com
```

---

## 10. Migration Sequence

Execute in this order to minimize downtime:

### Phase 1: Foundations (no downtime)
- [ ] Create GCP projects (`arachne-prod`, `arachne-dev`)
- [ ] Enable required APIs (Cloud Run, Cloud SQL, Secret Manager, etc.)
- [ ] Create GCS bucket for Terraform state
- [ ] Write new Terraform modules (GCP)
- [ ] `terraform plan` — verify no errors

### Phase 2: Database (maintenance window)
- [ ] Export Azure PostgreSQL dump
- [ ] Provision Cloud SQL instance via Terraform
- [ ] Enable pgvector
- [ ] Import dump
- [ ] Verify row counts and pgvector functionality
- [ ] Update `DATABASE_URL` secret to point to Cloud SQL

### Phase 3: Secrets
- [ ] Read all secrets from Azure Key Vault
- [ ] Create all secrets in GCP Secret Manager
- [ ] Verify Cloud Run service account has `secretAccessor` role

### Phase 4: Compute
- [ ] Deploy Cloud Run services via Terraform
- [ ] Smoke test against `*.run.app` URLs
- [ ] Verify gateway → database connectivity
- [ ] Verify all secrets are injected correctly

### Phase 5: DNS Cutover (brief downtime ~5 min)
- [ ] Lower Azure DNS TTLs to 60s (do this 24h before cutover)
- [ ] Create Cloud DNS zones
- [ ] Update Cloud Run custom domain mappings
- [ ] Update nameservers at registrar
- [ ] Verify SSL certificates issued
- [ ] Monitor error rates

### Phase 6: CI/CD
- [ ] Set up Workload Identity Federation
- [ ] Update GitHub Actions workflows
- [ ] Run a full deploy pipeline end-to-end
- [ ] Verify smoke tests pass

### Phase 7: Decommission Azure
- [ ] Confirm all traffic is flowing through GCP
- [ ] Run Azure resources in parallel for 48 hours (rollback window)
- [ ] `terraform destroy` on Azure resources
- [ ] Cancel Azure subscription / remove Synaptic Weave tenant

---

## 11. Rollback Plan

If GCP migration fails after DNS cutover:

1. Revert nameservers to Azure DNS
2. Azure Container Apps are still running (do not destroy until Phase 7)
3. Azure PostgreSQL is still running with original data
4. DNS propagation: ~5 minutes (TTL was lowered to 60s)

---

## 12. Cost Estimate (GCP, monthly)

| Service | Tier | Est. Monthly Cost |
|---------|------|------------------|
| Cloud Run (gateway + portal) | ~500K requests/mo | ~$5-15 |
| Cloud SQL (db-g1-small) | 1 vCPU, 1.7GB RAM | ~$25-35 |
| Cloud SQL storage (32GB SSD) | — | ~$6 |
| Secret Manager | <10K accesses | ~$1 |
| Cloud Logging | First 50GB free | $0 |
| Cloud DNS | 1 zone | ~$1 |
| GCS (Terraform state) | Negligible | ~$0 |
| **Total** | | **~$38-58/mo** |

Well within the $25K startup credits. Credits provide ~18-24 months of runway at this burn rate.

---

## 13. References

- [Cloud Run docs](https://cloud.google.com/run/docs)
- [Cloud SQL for PostgreSQL](https://cloud.google.com/sql/docs/postgres)
- [Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation)
- [pgvector on Cloud SQL](https://cloud.google.com/sql/docs/postgres/extensions#vector)
- [Terraform Google provider](https://registry.terraform.io/providers/hashicorp/google/latest/docs)
