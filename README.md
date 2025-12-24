# Maximo AI Agent Type A (Restart from original HTML)

This repository restarts the implementation from the original standalone HTML and reintroduces the missing content/context, while converting the UI to **IBM Carbon React** and making it deployable to **OpenShift**.

## What’s included

- Left navigation pane (Carbon UI Shell): **Agent**, **REST Builder & Trace**, **Settings**, **Help**
- Agent opens directly to chat, including prompt + predefined prompts as **chips** grouped by:
  - AI prompts
  - Maximo prompts
  - Create prompts
- Header shows current **mode** (AI/Maximo)
- Provider **model selection** using `/api/models`
- Settings includes:
  - Maximo Manage URL + API Key
  - Provider keys/base URLs
  - Avatar URLs with Set button + icon preview (per provider and user)
- Trace includes 3 separate tabs: build, preview, response

## Local install & run (start to finish)

### Prereqs
- Node 20+
- npm 9+

### Install
```bash
npm install
```

### Development
```bash
npm run dev
```

### Production build
```bash
npm run build
npm start
```

## OpenShift deployment

The YAML in `openshift/` is **plain** (no Kustomization CRD).

1) Create project:
```bash
oc new-project maximo-ai-agent || oc project maximo-ai-agent
```

2) Create secret (edit values first):
```bash
oc apply -f openshift/secret-example.yaml
```

3) Apply objects (edit repo URL and namespace placeholders first):
```bash
oc apply -f openshift/
```

4) Start build:
```bash
oc start-build maximo-ai-agent-type-a --follow
```

