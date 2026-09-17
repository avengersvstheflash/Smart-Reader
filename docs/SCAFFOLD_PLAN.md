# Scaffold Plan: Frontend React Migration

## 1. `frontend/` File Tree

```
frontend/
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── index.html
├── postcss.config.js
├── tailwind.config.js
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── vite-env.d.ts
│   ├── types/
│   │   └── domain.ts
│   ├── store/
│   │   ├── useReaderStore.ts
│   │   ├── useThemeStore.ts
│   │   ├── useModalStore.ts
│   │   └── useLibraryStore.ts
│   ├── styles/
│   │   ├── index.css
│   │   └── canonical.css
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Layout.tsx
│   │   │   ├── Header.tsx
│   │   │   ├── Nav.tsx
│   │   │   └── ThemeToggle.tsx
│   │   ├── library/
│   │   │   ├── BookCard.tsx
│   │   │   ├── BookGrid.tsx
│   │   │   └── FilterChips.tsx
│   │   ├── reader/
│   │   │   ├── ReaderView.tsx
│   │   │   ├── ChapterNav.tsx
│   │   │   ├── ScrollProgress.tsx
│   │   │   ├── SmartChapterList.tsx
│   │   │   ├── GenerateMoreButtons.tsx
│   │   │   └── ProvenanceLink.tsx
│   │   ├── shared/
│   │   │   ├── Modal.tsx
│   │   │   ├── SearchField.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   └── ToastRegion.tsx
│   │   └── import/
│   │       └── ImportDropzone.tsx
│   └── routes/
│       ├── LibraryRoute.tsx
│       ├── BookDetailsRoute.tsx
│       ├── ReaderRoute.tsx
│       ├── ImportRoute.tsx
│       └── ResearchRoute.tsx
```

## 2. Dependency Versions

Pinned strictly (no carets `^`) to prevent drift and adhere to constraints:

**dependencies:**
- `react`: `18.3.1`
- `react-dom`: `18.3.1`
- `react-router-dom`: `6.22.3`
- `zustand`: `4.5.2`
- `@tanstack/react-query`: `5.28.4`
- `lucide-react`: `0.359.0`

**devDependencies:**
- `vite`: `5.1.6`
- `@vitejs/plugin-react`: `4.2.1`
- `typescript`: `5.3.3` (Constraint: Strict TS)
- `tailwindcss`: `3.4.1` (Constraint: Tailwind v3.4, not v4)
- `postcss`: `8.4.35`
- `autoprefixer`: `10.4.18`
- `@tailwindcss/typography`: `0.5.10`
- `@types/react`: `18.2.66`
- `@types/react-dom`: `18.2.22`
- `@types/node`: `22.5.0` (Constraint: Node 22 pinned)

## 3. `package.json` Scripts

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0"
  }
```

## 4. `vite.config.ts` + `tsconfig.json` Shape

**vite.config.ts**:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});
```

**tsconfig.json**:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    
    /* Strict Type-Checking Options */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

## 5. Verification Steps

```bash
# 1. Enter the isolated workspace
cd frontend

# 2. Install dependencies (ensures exact versions)
npm install

# 3. Verify the production build pipeline
npm run build

# 4. Verify root repository integrity remains untouched
cd ..
npm test
```
**Expected:** The Vite build succeeds without TypeScript compilation errors, and the root `npm test` continues to report 13/13 passing tests.

## 6. Risk List

- **Risk 1: Accidental Hoisting to Root `node_modules`.**
  Running `npm install` inside `frontend/` could potentially hoist dependencies or alter the root `package.json` if npm detects a parent workspace configuration. 
  *Prevention:* Ensure the `frontend` directory is fully isolated, or explicitly configure `"workspaces"` in root `package.json` if a monorepo setup is desired. Given the constraint "Root package.json untouched", we must ensure no root-level linkage is automatically assumed by `npm` (e.g., bypassing workspace resolution if necessary).
- **Risk 2: Node Version Mismatch.**
  Vite or other toolchains running on older Node versions might fail or produce different lockfile formats.
  *Prevention:* Add `"engines": { "node": "22.x" }` to `frontend/package.json` to strictly enforce the Node 22 constraint required by `.nvmrc`.
- **Risk 3: Tailwind v4 Accidental Upgrade.**
  Running `npm install tailwindcss` without a specific version flag will install v4, breaking the v3.4 configuration structure outlined in the spec.
  *Prevention:* Explicitly pin `"tailwindcss": "3.4.1"` in `package.json` as detailed in the dependencies section above.
- **Risk 4: Backend Proxy Collisions.**
  The frontend and backend might compete for port `3000` if Vite's default port gets modified.
  *Prevention:* Explicitly configure `vite.config.ts` to run on `5173` and strictly proxy `/api` to `http://localhost:3000`.

