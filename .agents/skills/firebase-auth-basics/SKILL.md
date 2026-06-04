---
name: firebase-auth-basics
description: Guide for setting up and using Firebase Authentication. Use this skill when the user's app requires user sign-in, user management, or secure data access using auth rules.
compatibility: This skill is best used with the Firebase CLI, but does not require it. Firebase CLI can be accessed through `npx -y firebase-tools@latest`.
---

## Prerequisites

- **Firebase Project**: Created via `npx -y firebase-tools@latest projects:create`.
- **Firebase CLI**: Installed and logged in.

## Core Concepts

Firebase Authentication provides backend services, easy-to-use SDKs, and ready-made UI libraries to authenticate users to your app.

### Users

A user is an entity that can sign in to your app. Each user is identified by a unique ID (`uid`) which is guaranteed to be unique across all providers.

### Identity Providers

Firebase Auth supports multiple ways to sign in:
- **Email/Password**: Basic email and password authentication.
- **Federated Identity Providers**: Google, Facebook, Twitter, GitHub, Microsoft, Apple, etc.
- **Phone Number**: SMS-based authentication.
- **Anonymous**: Temporary guest accounts.
- **Custom Auth**: Integrate with your existing auth system.

## Workflow

### 1. Provisioning

#### Option 1. Enabling Authentication via CLI

Configure Firebase Authentication in `firebase.json` by adding an 'auth' block.

**CRITICAL**: After configuring `firebase.json`, you MUST deploy the auth configuration:
```bash
npx -y firebase-tools@latest deploy --only auth
```

#### Option 2. Enabling Authentication in Console

Enable other providers in the Firebase Console.

### 2. Client Setup & Usage

Refer to the standard Firebase Web Modular API for client-side implementation.

### 3. Security Rules

Secure your data using `request.auth` in Firestore/Storage rules.
