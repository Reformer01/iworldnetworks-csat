---
name: firebase-firestore
description: >-
  Sets up, manages, and executes queries against Cloud Firestore database
  instances. Use when listing or creating Firestore databases,
  configuring security rules, designing data models, or checking indexes.
---

# Cloud Firestore Database and Operations

Before setting up dependencies, writing data models, or configuring security
rules, you MUST always identify the Firestore instance edition.

## 1. Instance Selection and Edition Detection

Run the following command to list current Firestore databases: `npx -y firebase-tools@latest firestore:databases:list`

1.  Inspect edition: `npx -y firebase-tools@latest firestore:databases:get <database-id>`
2.  Target established instance or create new.
    -   If **`edition`** is `STANDARD`, follow standard guides.
    -   If **`edition`** is `ENTERPRISE` or native mode, follow enterprise guides.

## 2. Security Rules

Always ensure security rules are deployed and aligned with your `backend.json` definitions.

## 3. Client Usage

Use the `@firebase/firestore` package. Ensure all components use the client-side SDK and handle permission errors using the central error emitter pattern.
