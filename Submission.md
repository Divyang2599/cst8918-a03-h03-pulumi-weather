# CST8918 - Lab A03 / Hybrid H03 Submission

**Students:** Divyang (loda0002) & Diniz  
**Branch (Part 1):** lab-a03  
**Branch (Part 2):** hybrid-h03  
**Due:** June 1, 2026

---

## What We Built

A weather application deployed to Azure using Pulumi (Infrastructure as Code).  
The app uses a shared Redis cache to reduce redundant OpenWeather API calls.

### Architecture
OpenWeather API
↑
Azure Container Instance (ACI)
↓
Azure Cache for Redis (shared cache)
↑
Azure Container Registry (ACR) — stores Docker image

---

## Part 1 - Lab A03

**Goal:** Deploy the weather app to Azure using Pulumi.

### Resources Provisioned
- Azure Resource Group
- Azure Container Registry (ACR) — private Docker image storage
- Docker image built and pushed to ACR
- Azure Container Instance (ACI) — running the app publicly

### Key Commands
```bash
pulumi up       # deploy infrastructure
pulumi destroy  # tear down all resources
```

### What We Learned
- Infrastructure as Code means your cloud setup lives in version-controlled files
- Pulumi lets you use TypeScript instead of learning a new DSL
- ACR is a private Docker Hub hosted in your Azure subscription
- ACI runs containers without managing servers or Kubernetes

---

## Part 2 - Hybrid H03

**Goal:** Add Redis caching and proper secret management.

### Changes Made
- Encrypted OpenWeather API key using `pulumi config set --secret`
- Added Azure Cache for Redis (managed Redis service)
- Created `app/data-access/redis-connection.ts` — Redis client
- Updated `app/data-access/open-weather-service.ts` — uses Redis instead of in-memory cache
- Injected `REDIS_URL` as environment variable into the container

### Why Redis over In-Memory Cache?
In-memory cache only works for a single container instance. When you scale to multiple containers, each has its own cache — they don't share data. Redis is a separate service all containers connect to, so the cache is shared across all instances.

### Deployment URL
http://cst8918-a03-loda0002.canadacentral.azurecontainer.io:80

---

## Commit History

| Commit | Author | Description |
|--------|--------|-------------|
| feat(infrastructure): complete Part 1 | Divyang + Diniz | Pulumi config, ACR, ACI deployment |
| feat(infrastructure): add Redis cache and encrypt API key | Divyang | Azure Cache for Redis, secret config |
| feat(app): add Redis client and update weather service | Diniz | redis-connection.ts, open-weather-service.ts |
| chore: install redis npm package | Divyang | npm install redis |
| feat(infrastructure): complete Part 2 deployment | Divyang + Diniz | v0.3.0 with Redis |

---

## Screenshots
- `lab-a03.png` — browser showing deployed app (Part 1)
- `Lab-h03.png` — terminal output of final `pulumi up` (Part 2)
