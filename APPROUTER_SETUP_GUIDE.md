# SAP Approuter Setup Guide

## What is the Approuter?

The **SAP Application Router** (`@sap/approuter`) is a Node.js-based reverse proxy that acts as the **single entry point** for your application. It handles:

- **Authentication** via XSUAA (OAuth 2.0 / JWT tokens)
- **Routing** requests to multiple backend services (microservices, CAP, etc.)
- **Serving static content** (HTML, JS, CSS) from a `webapp/` folder
- **CSRF protection** for write operations

```
                 ┌──────────────────────────────────────┐
                 │          SAP Approuter (:5000)        │
                 │                                       │
  Browser ──────►│  /api/*        ──► Node Microservice  │──► localhost:4040
                 │  /animaladoption/* ──► CAP Server     │──► localhost:4004
                 │  /odata/*      ──► CAP Server         │──► localhost:4004
                 │  /sap/*        ──► CAP Server         │──► localhost:4004
                 │  /*            ──► Local webapp/       │
                 └──────────────────────────────────────┘
```

---

## Project Structure

```
deepappRouter/
├── manifest.yaml              # CF deployment descriptor (cf push)
├── mta.yaml                   # MTA deployment descriptor (alternative)
├── xs-security.json           # XSUAA service config
│
├── approuter/                 # SAP Approuter module
│   ├── package.json
│   ├── xs-app.json            # Routing rules
│   ├── default-env.json       # Local environment (destinations, etc.)
│   └── webapp/
│       └── index.html         # Landing page
│
├── node_micro_service/        # Express.js backend
│   ├── package.json
│   ├── server.js
│   └── webapp/
│       ├── data.json
│       └── index.html
│
└── CAP_annotation_based_Application_local/   # CAP application
    ├── package.json
    ├── db/
    ├── srv/
    └── app/
```

---

## File-by-File Explanation

### 1. `approuter/package.json`

```json
{
  "name": "approuter",
  "version": "1.0.0",
  "scripts": {
    "start": "node node_modules/@sap/approuter/approuter.js"
  },
  "dependencies": {
    "@sap/approuter": "^21.3.0"
  }
}
```

- The start script runs the official SAP approuter binary
- `@sap/approuter` is the **only required dependency**

---

### 2. `approuter/xs-app.json` — Routing Rules

This is the **heart of the approuter**. Routes are matched **top-to-bottom** (first match wins).

#### For LOCAL testing (authenticationMethod: `none`):

```json
{
  "welcomeFile": "/index.html",
  "authenticationMethod": "none",
  "routes": [
    {
      "source": "^/api/(.*)$",
      "target": "/$1",
      "destination": "microservice_api",
      "authenticationType": "none",
      "csrfProtection": false
    },
    {
      "source": "^/odata/(.*)$",
      "target": "/odata/$1",
      "destination": "cap_api",
      "authenticationType": "none"
    },
    {
      "source": "^/animaladoption/(.*)$",
      "target": "/$1",
      "destination": "cap_api",
      "authenticationType": "none"
    },
    {
      "source": "^/sap/(.*)$",
      "target": "/sap/$1",
      "destination": "cap_api",
      "authenticationType": "none"
    },
    {
      "source": "^(.*)$",
      "target": "$1",
      "localDir": "webapp",
      "authenticationType": "none"
    }
  ]
}
```

#### For CLOUD deployment (authenticationMethod: `route`):

```json
{
  "welcomeFile": "/index.html",
  "authenticationMethod": "route",
  "routes": [
    {
      "source": "^/api/(.*)$",
      "target": "/$1",
      "destination": "microservice_api",
      "authenticationType": "xsuaa",
      "csrfProtection": true
    },
    {
      "source": "^/odata/(.*)$",
      "target": "/odata/$1",
      "destination": "cap_api",
      "authenticationType": "xsuaa",
      "csrfProtection": true
    },
    {
      "source": "^/animaladoption/(.*)$",
      "target": "/$1",
      "destination": "cap_api",
      "authenticationType": "xsuaa"
    },
    {
      "source": "^/sap/(.*)$",
      "target": "/sap/$1",
      "destination": "cap_api",
      "authenticationType": "xsuaa"
    },
    {
      "source": "^(.*)$",
      "target": "$1",
      "localDir": "webapp",
      "authenticationType": "xsuaa"
    }
  ]
}
```

#### Route Explanation:

| Route | What it does |
|-------|-------------|
| `^/api/(.*)$` → `/$1` | Strips `/api` prefix, forwards to Node microservice. `/api/data.json` → `localhost:4040/data.json` |
| `^/odata/(.*)$` → `/odata/$1` | Forwards OData requests directly to CAP. `/odata/v4/adoptor/Animals` → `localhost:4004/odata/v4/adoptor/Animals` |
| `^/animaladoption/(.*)$` → `/$1` | Strips `/animaladoption` prefix, forwards to CAP. `/animaladoption/odata/v4/adoptor/` → `localhost:4004/odata/v4/adoptor/` |
| `^/sap/(.*)$` → `/sap/$1` | Forwards SAP Fiori Flexibility/LREP requests to CAP |
| `^(.*)$` → `$1` (localDir) | **Catch-all**: serves static files from `webapp/` folder |

> **Important**: The catch-all route must always be **LAST**. Routes are evaluated top-to-bottom.

---

### 3. `xs-security.json` — XSUAA Configuration

```json
{
  "xsappname": "deep-approuter-app",
  "tenant-mode": "dedicated",
  "scopes": [
    {
      "name": "$XSAPPNAME.Display",
      "description": "Display access"
    }
  ],
  "role-templates": [
    {
      "name": "Viewer",
      "description": "View data",
      "scope-references": [
        "$XSAPPNAME.Display"
      ]
    }
  ],
  "role-collections": [
    {
      "name": "DeepAppViewer",
      "description": "Deep App Viewer",
      "role-template-references": [
        "$XSAPPNAME.Viewer"
      ]
    }
  ]
}
```

| Field | Purpose |
|-------|---------|
| `xsappname` | Unique app name on the BTP subaccount |
| `tenant-mode` | `dedicated` = single tenant, `shared` = multi-tenant |
| `scopes` | Permissions your app defines |
| `role-templates` | Bundles of scopes |
| `role-collections` | Assignable to users in BTP Cockpit |

---

## Local Development Setup

### Step 1: Install dependencies

```bash
cd approuter
npm install

cd ../node_micro_service
npm install

cd ../CAP_annotation_based_Application_local
npm install
```

### Step 2: Create `approuter/default-env.json`

This file simulates Cloud Foundry environment variables locally:

```json
{
  "destinations": [
    {
      "name": "microservice_api",
      "url": "http://localhost:4040",
      "forwardAuthToken": false
    },
    {
      "name": "cap_api",
      "url": "http://localhost:4004",
      "forwardAuthToken": false
    }
  ]
}
```

> **Note**: `forwardAuthToken: false` because locally there is no JWT token.
> The destination `name` must match the `destination` value in `xs-app.json` routes.

### Step 3: Set `xs-app.json` to local mode

Set `authenticationMethod` to `"none"` and all `authenticationType` to `"none"` (see the local version above).

### Step 4: Start all 3 services (3 separate terminals)

```bash
# Terminal 1 — Node Microservice (port 4040)
cd node_micro_service
npm start

# Terminal 2 — CAP Application (port 4004)
cd CAP_annotation_based_Application_local
cds watch

# Terminal 3 — Approuter (port 5000)
cd approuter
npm start
```

### Step 5: Access via browser

| URL | Description |
|-----|-------------|
| `http://localhost:5000` | Approuter landing page |
| `http://localhost:5000/api/` | Node microservice root |
| `http://localhost:5000/api/data.json` | Microservice data |
| `http://localhost:5000/animaladoption/odata/v4/adoptor/` | CAP OData via prefix |
| `http://localhost:5000/odata/v4/adoptor/Animals` | CAP OData direct |

---

## Cloud Deployment — Option 1: `manifest.yaml` (cf push)

### `manifest.yaml`

```yaml
---
applications:
  # ---- Backend Microservice ----
  - name: deep-microservice
    path: node_micro_service
    memory: 256M
    instances: 1
    buildpacks:
      - nodejs_buildpack
    command: npm start
    random-route: true

  # ---- SAP Approuter ----
  - name: deep-approuter
    path: approuter
    memory: 256M
    instances: 1
    buildpacks:
      - nodejs_buildpack
    env:
      destinations: >
        [
          {
            "name": "microservice_api",
            "url": "https://deep-microservice.cfapps.<YOUR_CF_LANDSCAPE>.hana.ondemand.com",
            "forwardAuthToken": true
          },
          {
            "name": "cap_api",
            "url": "https://deep-cap-srv.cfapps.<YOUR_CF_LANDSCAPE>.hana.ondemand.com",
            "forwardAuthToken": true
          }
        ]
    services:
      - deep-xsuaa-service
    random-route: true
```

### Deployment Steps

```bash
# 1. Login to CF
cf login -a https://api.cf.<YOUR_CF_LANDSCAPE>.hana.ondemand.com

# 2. Create XSUAA service instance
cf create-service xsuaa application deep-xsuaa-service -c xs-security.json

# 3. Switch xs-app.json to production mode (authenticationMethod: "route")

# 4. Deploy all apps
cf push

# 5. Check the actual routes assigned
cf apps

# 6. Update manifest.yaml destinations with the real URLs from step 5
#    Then redeploy the approuter only
cf push deep-approuter

# 7. Assign role collection to your user in BTP Cockpit
#    Cockpit → Security → Role Collections → DeepAppViewer → Add user
```

### Limitations of `manifest.yaml`
- Destinations are hardcoded as environment variables (fragile)
- No automatic service creation (manual `cf create-service`)
- No dependency management between modules
- Need to redeploy approuter after getting backend URLs

---

## Cloud Deployment — Option 2: `mta.yaml` (Recommended)

The **MTA (Multi-Target Application)** approach is the recommended way for SAP BTP. It handles service creation, bindings, and inter-module dependencies automatically.

### `mta.yaml`

```yaml
_schema-version: "3.1"
ID: deep-approuter-app
version: 1.0.0
description: Deep Approuter Multi-Target Application

parameters:
  enable-parallel-deployments: true

modules:
  # ---- Backend Microservice ----
  - name: deep-microservice
    type: nodejs
    path: node_micro_service
    parameters:
      memory: 256M
      instances: 1
      buildpack: nodejs_buildpack
    provides:
      - name: microservice-api
        properties:
          srv-url: ${default-url}

  # ---- CAP Application (srv module) ----
  - name: deep-cap-srv
    type: nodejs
    path: CAP_annotation_based_Application_local
    parameters:
      memory: 256M
      instances: 1
      buildpack: nodejs_buildpack
    requires:
      - name: deep-xsuaa-service
    provides:
      - name: cap-api
        properties:
          srv-url: ${default-url}

  # ---- SAP Approuter ----
  - name: deep-approuter
    type: approuter.nodejs
    path: approuter
    parameters:
      memory: 256M
      instances: 1
    requires:
      - name: deep-xsuaa-service
      - name: microservice-api
        group: destinations
        properties:
          name: microservice_api
          url: ~{srv-url}
          forwardAuthToken: true
      - name: cap-api
        group: destinations
        properties:
          name: cap_api
          url: ~{srv-url}
          forwardAuthToken: true

resources:
  # ---- XSUAA Service ----
  - name: deep-xsuaa-service
    type: org.cloudfoundry.managed-service
    parameters:
      service: xsuaa
      service-plan: application
      path: xs-security.json
```

### Key Differences from `manifest.yaml`

| Feature | manifest.yaml | mta.yaml |
|---------|--------------|----------|
| Destinations | Hardcoded URLs in env | **Auto-resolved** via `provides`/`requires` |
| Service creation | Manual `cf create-service` | **Automatic** via `resources` section |
| Dependencies | None | `requires` ensures **deploy order** |
| Deploy command | `cf push` | `mbt build && cf deploy` |
| URL management | Manual copy-paste | **Dynamic** `~{srv-url}` = `${default-url}` |

### MTA Deployment Steps

```bash
# 1. Install MTA Build Tool (one-time)
npm install -g mbt

# 2. Login to CF
cf login -a https://api.cf.<YOUR_CF_LANDSCAPE>.hana.ondemand.com

# 3. Install CF MTA plugin (one-time)
cf install-plugin multiapps

# 4. Switch xs-app.json to production mode (authenticationMethod: "route")

# 5. Build the MTA archive
mbt build

# 6. Deploy to CF
cf deploy mta_archives/deep-approuter-app_1.0.0.mtar

# 7. Assign role collection in BTP Cockpit
```

### How `provides` / `requires` Work

```
deep-microservice                deep-approuter
┌─────────────────┐             ┌────────────────────────────┐
│ provides:       │             │ requires:                  │
│   microservice- │────────────►│   microservice-api         │
│   api           │   auto-     │     group: destinations    │
│   srv-url =     │   wired     │     name: microservice_api │
│   <actual url>  │             │     url: ~{srv-url}        │
└─────────────────┘             └────────────────────────────┘
```

The MTA deployer:
1. Deploys `deep-microservice` first
2. Captures its URL as `${default-url}`
3. Injects it into the approuter's `destinations` env variable automatically

---

## Quick Reference: Switching Between Local and Cloud

### Before Local Testing:
```json
// xs-app.json
"authenticationMethod": "none"
// All routes:
"authenticationType": "none"
```

### Before Cloud Deployment:
```json
// xs-app.json
"authenticationMethod": "route"
// All routes:
"authenticationType": "xsuaa"
```

### Pro Tip: Use Environment Variable for Dynamic Switching

You can keep `xs-app.json` in cloud mode and override locally by adding to `default-env.json`:

```json
{
  "destinations": [ ... ],
  "VCAP_SERVICES": {}
}
```

The approuter falls back to `"none"` auth when no XSUAA binding is found in `VCAP_SERVICES`.

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `404 ENOENT /sap/bc/lrep/...` | SAP Fiori Flexibility requests hitting local `webapp/` catch-all | Add `/sap/*` route **before** the catch-all |
| `504 Timeout on $batch` | CAP mocked auth expects Basic Auth credentials | Add `httpHeaders.Authorization` in `default-env.json` destination |
| `Cannot find module @sap/approuter` | Dependencies not installed | Run `npm install` in `approuter/` |
| `Port 5000 already in use` | Another process on port 5000 | Set `PORT=5001` env var or kill the process |
| `No authentication will be used` | `authenticationMethod: "none"` | Expected for local dev; switch to `"route"` for cloud |

---

## Summary

1. **Approuter** = single entry point, reverse proxy + auth
2. **xs-app.json** = routing rules (which URL goes where)
3. **default-env.json** = local-only destinations (simulates CF env)
4. **xs-security.json** = XSUAA scopes/roles config
5. **manifest.yaml** = simple CF deployment (manual destinations)
6. **mta.yaml** = recommended CF deployment (auto-wired destinations)
