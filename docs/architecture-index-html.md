# Smart Reader Architecture Report

## 1. Top-level views / panels / modals

| Name | Purpose | Line Range | How Shown/Hidden | State it Depends On |
| --- | --- | --- | --- | --- |
| `view-library` | Main library view showing book collection | 87-205 | `display: none` / `.active` class toggle | Books collection, active filters, search query |
| `view-book-details` | Single book details, chapters, intelligent summaries | 208-381 | `display: none` | Selected book, Semantic index status |
| `view-reader` | The reading interface (original or smart mode) | 384-597 | `display: none` | Selected book, active chapter, reader view modes |
| `view-research-collection` | Multi-source research collection comparison view | 600-715 | `display: none` | Selected books for research |
| `addBookModal` | Import/Add book modal (web, file, paste) | 721-1002 | `.hidden` class toggle | Active tab, ingestion progress state |
| `addChapterModal` | Add a chapter manually | 1005-1037 | `.hidden` class toggle | Form input state |
| `jobsModal` | Background processing jobs queue | 1040-1063 | `.hidden` class toggle | Background job list |
| `aboutModal` | About dialog | 1066-1089 | `.hidden` class toggle | None |
| `settingsModal` | Settings & preferences | 1092-1201 | `.hidden` class toggle | Active theme, AI provider mode |
| `deleteBookModal` | Confirmation for book deletion | 1204-1238 | `.hidden` class toggle | Selected book to delete |
| `aiSelectionModal` | First-time AI mode selection | 1241-1303 | `.hidden` class toggle | Initial setup state |
| `aiStatusModal` | AI status & intelligence explainer | 1306-1345 | `.hidden` class toggle | Network/AI status |
| `supportingMaterialModal` | Search/attach supporting materials | 1348-1396 | `.hidden` class toggle | Active book, search results |
| `viewSupportingMaterialModal` | Reading interface for supporting material | 1399-1423 | `.hidden` class toggle | Selected supporting material |
| `comingSoonModal` | "Coming soon" feature stub | 1426-1459 | `.hidden` class toggle | None |

## 2. DOM IDs and data-* attributes

| Attribute | Purpose | Notes |
| --- | --- | --- |
| `data-type` | Content type filter chips (Library) | Used in `#content-type-filters` for filtering |
| `data-cat` | Web search category filter chips | Used in `#web-category-chips` |
| `app-main` | Main viewport wrapper | Holds the 4 main views |
| `books-grid` | Mount point for book cards | Empty div populated via JS `innerHTML` |
| `chapters-list` | Mount point for chapter items | Empty div populated via JS |
| `reader-content-body` | Mount point for reading canvas text | Empty div populated via JS |
| `toast-container` | Mount point for toast notifications | Appended to dynamically |

## 3. Inline event handlers

| Element | Event | Handler Function |
| --- | --- | --- |
| `button.nav-btn` | `onclick` | `navigateTo(...)`, `openJobsModal()` |
| `input#library-search-input` | `oninput` | `handleSearch(this.value)` |
| `button.filter-chip` | `onclick` | `filterByContentType(...)` |
| `select#reader-chapter-select` | `onchange` | `handleChapterSelect(this.value)` |
| `input#semantic-question-input` | `onkeydown` | `handleSemanticQuestionKey(event)` |
| `form#form-add-book` | `onsubmit` | `handleAddBookSubmit(event)` |
| `input#book-file-input` | `onchange` | `handleFileSelected(this.files)` |
| `button.theme-btn` | `onclick` | `setTheme(...)` |
| `button.provider-mode-btn` | `onclick` | `handleSelectProcessingMode(...)` |
| `button.view-mode-btn` | `onclick` | `setReaderViewMode(...)` |

## 4. Template fragments

None.

*(Note: There are no `<template>` tags in the DOM. Dynamic UI components are constructed via JS string interpolation and injected into empty container divs.)*

## 5. External resources

| Tag | URL/Path | Purpose |
| --- | --- | --- |
| `<link>` | `https://fonts.googleapis.com` | Google Fonts preconnect |
| `<link>` | `https://fonts.gstatic.com` | Google Fonts preconnect |
| `<link>` | `https://fonts.googleapis.com/css2?family=Cinzel...` | Loads Cinzel, Lora, and Plus Jakarta Sans fonts |
| `<link>` | `style.css` | Main application stylesheet |
| `<script>` | `script.js` | Main application logic (defer) |

## 6. Structural observations for React migration

- **Display vs. Stateful**: The UI is highly stateful. The `header` relies on job counts and AI status. The main viewport requires a router to manage mutually exclusive views (Library, Details, Reader, Research).
- **Repeated Blocks**: 
  - The modal structure (backdrop, header with close button, body, footer) is repeated 11 times and should be extracted into a `<Modal>` component.
  - SVG icons are aggressively duplicated inline; these should be extracted into reusable icon components.
  - Filter chips and status badges share identical structures and should become `<Chip>` and `<Badge>` components.
- **DOM Dependencies**: 
  - Application view state and modal visibility are currently managed by toggling `.active` / `.hidden` classes and `display: none` inline styles. This must be refactored to React conditional rendering.
  - Deep reliance on `document.getElementById` to read inputs and write outputs means all forms and dynamic lists must be controlled via React state.
- **Routing Needs**: The app is currently a single-page app managing views manually. It requires a client-side router with routes like `/library`, `/book/:id`, `/read/:bookId/:chapterId`, and `/research`.

## 7. Top 10 things to know for migration

1. The app acts as an SPA using manual DOM manipulation (`display: none` / `.active`) to switch between 4 primary views.
2. A client-side router (like React Router) is strictly required to manage these main views gracefully.
3. State is deeply coupled with the DOM (via IDs and `innerHTML`); it needs to be lifted into a React state management solution.
4. There are 11 distinct modals sharing a common HTML structure, making a reusable `<Modal>` wrapper component essential.
5. Widespread use of inline event handlers (`onclick="..."`) must be converted to React synthetic events.
6. Dynamic lists (books, chapters, sources, jobs) are injected as HTML strings and must be converted to array `.map()` rendering.
7. SVG icons are duplicated inline throughout the markup and should be abstracted into a reusable `<Icon>` component library.
8. The Reader view contains complex nested state (Original vs Smart mode, Canonical vs Source view) that needs careful local state management.
9. Global UI theming is currently handled by updating classes on the `<body>` element, requiring a global theme provider in React.
10. The UI is completely devoid of `<template>` tags; JS string templating is used exclusively, meaning HTML provides no component blueprints, only mount points.

