---
name: firebase-data-connect
description: Builds and deploys Firebase SQL Connect (aka Firebase Data Connect) backends with PostgreSQL securely. Use when designing schemas with tables and relations, writing authorized queries and mutations, or generating type-safe SDKs.
---

# Firebase SQL Connect

Firebase SQL Connect is a relational database service using Cloud SQL for PostgreSQL with GraphQL schema, auto-generated queries/mutations, and type-safe SDKs.

## Project Structure

```text
dataconnect/
├── dataconnect.yaml      # Service configuration
├── schema/
│   └── schema.gql        # Data model (types with @table)
└── connector/
    ├── connector.yaml    # Connector config + SDK generation
    ├── queries.gql       # Queries
    └── mutations.gql     # Mutations
```

## Operation Strategies: GraphQL vs. Native SQL

Always default to **Native GraphQL**. **Native SQL lacks type safety**. Only use **Native SQL** for advanced database features like PostGIS or complex window functions.

## Development Workflow

1.  **Define Data Model** (`schema/schema.gql`).
2.  **Define Authorized Operations** (`connector/queries.gql`, `connector/mutations.gql`).
3.  **Generate type-safe SDKs** using `npx -y firebase-tools@latest dataconnect:sdk:generate`.
