# Quick Start Guide

## Get Started in 3 Steps

### Step 1: Install Dependencies (Already Done!)
The dependencies are already installed. If you need to reinstall:
```bash
bun install
```

### Step 2: Configure Your API

You need to update the API endpoints to match your Swagger documentation.

**Quick Configuration Checklist:**

1. **Update Login Endpoint** - `src/context/AuthContext.tsx`
   ```javascript
   const response = await api.post('/api/auth/login', credentials);
   ```

2. **Update Cluster Endpoints** - `src/services/clusterService.ts`
   - Replace `/api/clusters` with your actual endpoint

3. **Update Business Unit Endpoints** - `src/services/businessUnitService.ts`
   - Replace `/api/business-units` with your actual endpoint

4. **Update User Endpoints** - `src/services/userService.ts`
   - Replace `/api/users` with your actual endpoint

**Need detailed instructions?** See `API_CONFIGURATION.md`

### Step 3: Start the App

```bash
bun start
```

The app will open at `http://localhost:3000`

## What You'll See

1. **Landing Page** - Public page with feature highlights and "Get Started" button
2. **Login Page** - Enter your credentials (click "Get Started" or "Login")
3. **Dashboard** - Three cards for Cluster, Business Unit, and User management
4. **Management Pages** - Click any card or use the top navigation

## Testing the Application

### Test Landing Page
1. Go to `http://localhost:3000`
2. You'll see the landing page with feature cards
3. Click "Get Started" to go to login

### Test Authentication
1. Click "Get Started" or "Login" on the landing page
2. Enter your credentials on `/login`
3. If successful, redirects to `/dashboard`
4. If failed, see error message
5. Click "Back to home" to return to the landing page

**Tip:** Open browser DevTools (F12) and Network tab to see API requests

### Test Data Loading
1. Click on "Clusters" (or any management section)
2. Check if data loads from your API
3. If you see errors, check the browser console

### Test CRUD Operations

**Create:**
1. Click "Add [Item]" button
2. Fill in the form
3. Click "Create"
4. Item should appear in the table

**Read:**
- Data loads automatically when you open a management page

**Update:**
1. Click "Edit" on any item
2. Modify the data
3. Click "Update"
4. Changes should be reflected in the table

**Delete:**
1. Click "Delete" on any item
2. Confirm the deletion
3. Item should be removed from the table

## Common First-Time Issues

### Issue: "Network Error" or "CORS Error"

**Solution:**
- Your API needs to allow requests from `http://localhost:3000`
- Contact your backend team to configure CORS

### Issue: "SSL Certificate Error"

**Solution:**
- Already handled in development mode (see `src/services/api.ts`)
- The app ignores SSL errors in development

### Issue: "401 Unauthorized" after login

**Possible causes:**
1. Wrong endpoint in `AuthContext.tsx`
2. Wrong credentials
3. API response format doesn't match expected format

**Solution:**
- Check browser console and Network tab
- Verify login endpoint in Swagger
- Check API response format

### Issue: Data doesn't load

**Possible causes:**
1. Wrong API endpoints in service files
2. Authentication token not being sent
3. API response format is different

**Solution:**
- Open DevTools and Network tab
- Check the actual API calls being made
- Verify endpoints match Swagger documentation
- Check response format

## Understanding the File Structure

**Only need to modify these files:**

- `src/context/AuthContext.tsx` - Login endpoint and auth logic
- `src/services/clusterService.ts` - Cluster API calls
- `src/services/businessUnitService.ts` - Business unit API calls
- `src/services/userService.ts` - User API calls

**Everything else works automatically!**

## Development Workflow

```
1. bun start                    -> Start dev server
2. Open http://localhost:3000   -> Landing page
3. Click "Get Started"          -> Login page
4. Login                        -> Dashboard
5. Make code changes            -> App auto-reloads
6. Check browser console        -> See errors/logs
7. Check Network tab            -> See API calls
```

## Build for Production

When you're ready to deploy:

```bash
bun run build
```

This creates a `build/` folder with optimized files ready for deployment. The build date is automatically displayed in the landing page footer.

## Quick Reference: File Locations

| What to Change | File Location |
|----------------|---------------|
| Login API endpoint | `src/context/AuthContext.tsx` |
| Cluster endpoints | `src/services/clusterService.ts` |
| Business Unit endpoints | `src/services/businessUnitService.ts` |
| User endpoints | `src/services/userService.ts` |
| API base URL | `src/services/api.ts` |
| Landing page | `src/pages/Landing.tsx` |
| Routes | `src/App.tsx` |

## Getting Help

1. **Product Requirements:** Check `PRD.md`
2. **API Issues:** Check `API_CONFIGURATION.md`
3. **General Info:** Check `README.md`
4. **Project Overview:** Check `PROJECT_SUMMARY.md`
5. **Swagger Docs:** `https://dev.blueledgers.com:4001/swagger`

---

**You're all set!** Start with `bun start` and begin configuring your API endpoints.

design by @carmensoftware 2025
