# Carmen Platform Documentation

Welcome to the Carmen Platform documentation. This folder contains all the guides and references you need to work with the platform.

## Documentation Index

### AI & Coding Conventions

0. **[CLAUDE.md](../CLAUDE.md)** (root)
   - AI style guide and coding conventions
   - Component usage patterns
   - Form, table, filter, and debug sheet patterns
   - Service layer and type conventions
   - Styling rules (colors, spacing, responsive)
   - **Read this first before making code changes**

### Product

1. **[PRD](PRD.md)**
   - Product Requirements Document
   - Feature specifications with all routes
   - Data models (Cluster, Business Unit, User, User-BU assignment)
   - API endpoints and query parameters
   - UI/UX requirements

### Getting Started

2. **[Quick Start Guide](QUICK_START.md)**
   - Get started in 3 steps
   - Testing each feature
   - Common first-time issues
   - Key files reference

3. **[API Configuration](API_CONFIGURATION.md)**
   - All API endpoints with HTTP methods
   - Query parameter documentation
   - Response format examples
   - Service layer pattern
   - Advanced filter examples

### Development Guides

4. **[Project Summary](PROJECT_SUMMARY.md)**
   - Complete project overview
   - Full project structure with descriptions
   - Feature list with implementation details
   - Technologies used

5. **[Authentication Flow](AUTHENTICATION_FLOW.md)**
   - Login process and token management
   - Role-based access control (7 platform roles)
   - PrivateRoute with allowedRoles
   - Route access matrix
   - User journey scenarios

6. **[Layout Features](LAYOUT_FEATURES.md)**
   - Glassmorphism header
   - Navigation (desktop + mobile)
   - User profile dropdown
   - Active route detection
   - Responsive behavior

### Technology Guides

7. **[Why Bun?](WHY_BUN.md)**
   - Benefits of using Bun
   - Performance improvements
   - Command reference

8. **[Bun Migration](BUN_MIGRATION.md)**
   - npm to Bun migration details
   - Command changes
   - Rollback instructions

## Quick Links

**New to the project?** Start here:
1. [CLAUDE.md](../CLAUDE.md) - Coding conventions
2. [PRD](PRD.md) - Understand the product
3. [Quick Start](QUICK_START.md) - Setup in 3 steps

**Need help with API?**
- [API Configuration](API_CONFIGURATION.md) - All endpoints and response formats

**Need help with authentication?**
- [Authentication Flow](AUTHENTICATION_FLOW.md) - Complete auth and role guide

**Understanding the codebase?**
- [Project Summary](PROJECT_SUMMARY.md) - Full structure and features

## Documentation Structure

```
docs/
├── README.md                   # This file
├── PRD.md                      # Product Requirements Document
├── QUICK_START.md              # Quick start guide
├── API_CONFIGURATION.md        # API setup guide
├── AUTHENTICATION_FLOW.md      # Auth documentation
├── PROJECT_SUMMARY.md          # Project overview
├── LAYOUT_FEATURES.md          # Layout documentation
├── WHY_BUN.md                  # Bun benefits
└── BUN_MIGRATION.md            # Bun migration

Root:
├── CLAUDE.md                   # AI style guide (read before coding)
└── README.md                   # Main project README
```

## Need More Help?

1. Check the relevant documentation above
2. Review the main [README](../README.md)
3. Check [CLAUDE.md](../CLAUDE.md) for coding patterns
4. Check the Swagger API docs: `https://dev.blueledgers.com:4001/swagger`

---

design by @carmensoftware 2025
