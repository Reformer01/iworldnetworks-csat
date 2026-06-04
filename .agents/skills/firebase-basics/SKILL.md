---
name: firebase-basics
description: >-
  Provides foundational setup, authentication, and project management workflows
  for Firebase using the Firebase CLI. Use when checking Firebase CLI version
  (must use 'npx -y firebase-tools@latest --version'), initializing a Firebase
  environment, authenticating, setting active projects, or setting up `google-services.json`
  or `GoogleService-Info.plist` files.
---

# Prerequisites

Complete these setup steps before proceeding:

1.  **Local Environment Setup:** Verify the environment is properly set up so we
    can use Firebase tools:

    -   Run `npx -y firebase-tools@latest --version` to check if the Firebase
        CLI is installed.
    -   Verify if the Firebase MCP server is installed using your existing
        tools.
    -   **CRITICAL**: Before configuring any extensions or agent environments
        below, you MUST read
        [references/local-env-setup.md](references/local-env-setup.md).
    -   **DO NOT SKIP** this step: if 'firebase-basics' is the only
        Firebase skill available to you, you must follow the reference for your
        agent environment to set up the full suite of Firebase skills.

2.  **Authentication:** Ensure you are logged in to Firebase so that commands
    have the correct permissions. Run `npx -y firebase-tools@latest login`. For
    environments without a browser (e.g., remote shells), use `npx -y
    firebase-tools@latest login --no-localhost`.

    -   The command should output the current user.
    -   If you are not logged in, follow the interactive instructions from this
        command to authenticate.

3. **Active Project:**
   Most Firebase tasks require an active project context.

   > [!IMPORTANT]
   > **For Agents:** Before proceeding with project configuration, you MUST pause and ask the developer if they prefer to:
   > 1. **Provide an existing Firebase Project ID**, or
   > 2. **Create a new Firebase project**.

# Firebase Usage Principles

Adhere to these principles:

1. **Use npx for CLI commands:** To ensure you always use the latest version of the Firebase CLI, always prepend commands with `npx -y firebase-tools@latest` instead of just `firebase`.
2. **Prioritize official knowledge:** For any Firebase-related knowledge, consult the `developerknowledge_search_documents` MCP tool.
3. **Follow Agent Skills for implementation guidance:** Skills provide opinionated workflows (CUJs), security rules, and best practices.
4. **Use Firebase MCP Server tools instead of direct API calls.**
5. **Keep Plugin / Agent Skills updated.**
6. **Automate Config File Retrieval:** Use the Firebase CLI to fetch the config programmatically instead of asking the user to download files.
