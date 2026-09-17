# Architecture Report: `src/script.js`

## 1. Global and module-scope state

| Name | Type | Initial Value | Read By | Written By |
| --- | --- | --- | --- | --- |
| `state` | Object | `{ currentView: 'library', books: [], ... }` | Almost all render and logic functions | API callbacks, navigation handlers, UI toggles |
| `state.currentView` | String | `'library'` | `navigateTo`, `updateScrollProgress` | `navigateTo` |
| `state.books` | Array | `[]` | `renderLibrary`, `renderBookDetailsHero` | `loadBooks`, `api.getBooks` |
| `state.activeBook` | Object | `null` | `renderBookDetailsHero`, `openChapter`, etc. | `openBookDetails`, `openChapter`, `executeDeleteBook` |
| `state.chapters` | Array | `[]` | `renderChaptersList`, `navigateChapter` | `openBookDetails`, `openChapter`, `handleAddChapterSubmit` |
| `state.activeChapter` | Object | `null` | `renderReaderView`, `triggerChapterSummary` | `openChapter` |
| `state.activeRepresentation` | Object | `null` | `renderActiveRepresentationCanvas` | `openChapter`, `triggerChapterSummary` |
| `state.selectedWebSources` | Set | `new Set()` | `updateWebSelectionBar`, `handleImportSelectedMulti` | `handleToggleWebSource`, `clearWebSelection` |
| `state.importedBookResult` | Object | `null` | `handleOpenImportedBook` | `handleAddBookSubmit`, `runWebIngestionPipeline` |
| `state.currentOutline` | Object | `null` | `renderEditorialChaptersList`, `handleSynthesizeActiveChapter` | `loadOrGenerateOutline`, `handleRegenerateOutline` |
| `state.currentResearchBookIds` | Array | `[]` | `openResearchCollection`, `renderCollectionSources` | `openResearchCollection` |
| `pendingInitialAIMode` | String | `'cloud'` | `confirmInitialAIChoice` | `selectInitialAIMode` |

## 2. API client surface

### Books & Ingestion
| Function Name | Endpoint | Method | Request Shape | Response Shape | Called From |
| --- | --- | --- | --- | --- | --- |
| `getBooks` | `/api/books` | GET | None | `{ books: [...] }` | `loadBooks` |
| `getBook` | `/api/books/:id` | GET | None | `{ book: {...} }` | `openBookDetails`, `openChapter` |
| `importBook` | `/api/books/import` | POST | `FormData` (file or text) | `{ book: {...}, chapters: [...], ... }` | `handleAddBookSubmit` |
| `deleteBook` | `/api/books/:id` | DELETE | None | Success message | `executeDeleteBook` |
| `resetDevData` | `/api/dev/reset` | POST | None | Success message | `handleDevReset`, `seedSampleLibrary` |

### Chapters & Content
| Function Name | Endpoint | Method | Request Shape | Response Shape | Called From |
| --- | --- | --- | --- | --- | --- |
| `getChapters` | `/api/books/:id/chapters` | GET | None | `{ chapters: [...] }` | `openBookDetails`, `openChapter` |
| `getChapter` | `/api/chapters/:id` | GET | None | `{ chapter, representations }` | `openChapter` |
| `addChapter` | `/api/books/:id/chapters` | POST | `{ number, title, content }` | `{ chapter }` | `handleAddChapterSubmit` |
| `updateChapter` | `/api/chapters/:id` | PATCH | `{ status }` | `{ chapter }` | `toggleChapterReadStatus` |

### Web Acquisition & Research
| Function Name | Endpoint | Method | Request Shape | Response Shape | Called From |
| --- | --- | --- | --- | --- | --- |
| `searchWeb` | `/api/web/search` | GET | `?q=&category=&limit=` | `{ results: [...] }` | `handleRunWebSearch`, `handleRunSupportingSearch` |
| `previewWeb` | `/api/web/preview` | GET | `?url=` | `{ previewData }` | `handlePreviewWebSource` |
| `importWeb` | `/api/web/import` | POST | `{ url }` | Ingestion result | `runWebIngestionPipeline` |
| `importWebMulti` | `/api/web/import-multi` | POST | `{ sources, title, contentType }` | Ingestion result | `handleImportSelectedMulti` |
| `getSupportingMaterials` | `/api/books/:id/supporting` | GET | None | `[...]` | `openBookDetails`, `handleAttachSupportingSource` |
| `attachSupportingMaterial` | `/api/books/:id/supporting` | POST | `{ url, title, snippet, sourceSite }` | Success | `handleAttachSupportingSource` |
| `deleteSupportingMaterial` | `/api/supporting/:id` | DELETE | None | Success | `handleDeleteSupportingMaterial` |

### AI, Semantic & Synthesis
| Function Name | Endpoint | Method | Request Shape | Response Shape | Called From |
| --- | --- | --- | --- | --- | --- |
| `getAIStatus` | `/api/ai/status` | GET | None | `{ providers: { gemini, ollama } }` | `checkAIStatus` |
| `setAIProvider` | `/api/ai/provider` | POST | `{ provider }` | Success | `handleSelectProcessingMode` |
| `summarizeChapter` | `/api/chapters/:id/summarize` | POST | `{ mode, provider }` | `{ representation }` | `triggerChapterSummary` |
| `generateSynopsis` | `/api/books/:id/synopsis` | POST | None | `{ synopsis, representation }` | `handleGenerateSynopsis`, `handleGenerateSynopsisClick` |
| `getBookSummary` | `/api/books/:id/summary` | GET | None | `{ representation }` | `renderSemanticIntelligence` |
| `generateBookSummary` | `/api/books/:id/summary` | POST | None | `{ summary, representation }` | `handleGenerateBookSummaryClick` |
| `getSemanticStatus` | `/api/books/:id/semantic/status` | GET | None | `{ chunkCount, dimensions }` | `renderSemanticIntelligence` |
| `askBook` | `/api/books/:id/ask` | POST | `{ query }` | `{ answer, sources, metadata }` | `handleAskBookQuestion` |

### Editorial & Smart Reading
| Function Name | Endpoint | Method | Request Shape | Response Shape | Called From |
| --- | --- | --- | --- | --- | --- |
| `getBookEditorial` | `/api/books/:id/editorial` | GET | None | `{ status, outline }` | `checkBookEditorialStatus` |
| `generateBookEditorial` | `/api/books/:id/editorial` | POST | None | `{ outline }` | `triggerGenerateBookEditorial` |
| `synthesizeBookEditorialChapter` | `/api/books/:id/editorial/chapters/:chapterId/synthesize` | POST | None | `{ representation }` | `handleReaderSynthesizeActiveChapter` |
| `generateOutline` | `/api/editorial/outline` | POST | `{ bookIds, topic, fast }` | `{ outline }` | `loadOrGenerateOutline` |
| `getSynthesis` | `/api/editorial/outline/:outlineId/chapters/:chapterId` | GET | None | `{ representation }` | `selectEditorialChapter` |
| `synthesizeChapter` | `/api/editorial/outline/:outlineId/chapters/:chapterId/synthesize` | POST | `{ fast }` | `{ representation }` | `handleSynthesizeActiveChapter`, `selectEditorialChapter` |
| `regenerateOutline` | `/api/editorial/outline/:outlineId/regenerate` | POST | `{ bookIds, fast }` | `{ outline }` | `handleRegenerateOutline` |
| `queryCrossSource` | `/api/editorial/query` | POST | `{ bookIds, query, fast }` | `{ canonicalBlocks, answer }` | `handleCompareSourcesQuery` |

### System
| Function Name | Endpoint | Method | Request Shape | Response Shape | Called From |
| --- | --- | --- | --- | --- | --- |
| `getJobs` | `/api/jobs` | GET | None | `[...]` | `fetchJobs` |

## 3. DOM manipulation patterns

### 3a. Element queries
| Query Strategy | Usage Frequency | Examples |
| --- | --- | --- |
| `document.getElementById` | High (>100) | `document.getElementById('chapters-list')` |
| `document.querySelectorAll` | Low (~5) | `document.querySelectorAll('.modal-tab-btn')` |
| `document.querySelector` | Low (~2) | `document.querySelector('.modal-footer')` |

### 3b. Mutations
| Mutation Type | Usage Frequency | Examples |
| --- | --- | --- |
| `.innerHTML` | High | Rebuilding lists (`renderChaptersList`), views (`renderReaderView`) |
| `.textContent` | High | Updating badges, titles, statuses |
| `.style.display` | High | Toggling visibility (`'none'` vs `'block'`/`'flex'`) |
| `.classList.add`/`.remove` | Medium | Toggling `.hidden` on modals, `.active` on tabs/buttons |
| `className = ...` | Low | Applying themes (`document.body.className = theme-light`) |

### 3c. Event listeners
| Listener Type | Usage Frequency | Examples |
| --- | --- | --- |
| Inline attributes | Very High | `<button onclick="openChapter(...)">`, `onchange`, `onsubmit` |
| `addEventListener('DOMContentLoaded')` | Low (1) | Initializing app state on boot |
| `addEventListener('scroll')` | Low (1) | `setupScrollProgress()` |
| `addEventListener('dragenter/drop')`| Low (1) | `setupDragAndDrop()` |

## 4. Top 10 user flows
1. **App Init:** DOMContentLoaded -> Load preferences from localStorage -> `loadBooks()` -> `renderLibrary()` -> Set view to 'library'.
2. **Add Book (File):** `openAddBookModal()` -> user drops file -> `handleAddBookSubmit()` -> `api.importBook(FormData)` -> Update ingestion steps (setTimeout mocks) -> display result -> `loadBooks()`.
3. **Web Search & Acquire:** `handleRunWebSearch()` -> `api.searchWeb()` -> `renderWebSearchResults()` -> select sources -> `handleImportSelectedMulti()` -> `api.importWebMulti()` -> ingest pipeline -> success.
4. **Open Book Details:** `openBookDetails(id)` -> `api.getBook()` -> `api.getChapters()` -> `renderBookDetailsHero()` & `renderChaptersList()` -> check semantic/editorial status -> toggle view to 'book-details'.
5. **Read Chapter:** `openChapter(id)` -> fetch chapter & representations -> set active representation mode to 'original' -> `renderReaderView()` -> `renderActiveRepresentationCanvas()`.
6. **Synthesize Summary:** `triggerChapterSummary()` -> show processing canvas -> `api.summarizeChapter()` -> `state.activeRepresentation = res` -> render canonical blocks via `renderActiveRepresentationCanvas()`.
7. **Ask Semantic Question:** `handleAskBookQuestion()` -> `api.askBook()` -> render grounded response & sources list.
8. **Generate Smart Reading Outline:** `triggerGenerateBookEditorial()` -> show processing spinner -> `api.generateBookEditorial()` -> render outline in Smart Reading canvas.
9. **Multi-Book Research:** `toggleBookSelection(id)` -> Select >= 2 books -> `openResearchCollection()` -> `api.generateOutline({ bookIds })` -> `renderEditorialChaptersList()` -> `selectEditorialChapter()`.
10. **Change Settings:** `openSettings()` -> toggle AI mode/theme -> update localStorage -> `applyTypography()` / `setTheme()`.

## 5. Utilities vs. business logic

**Pure Utilities:**
- `escapeHtml(str)`: Sanitizes strings for DOM injection.
- `showToast(msg, type)`: Displays ephemeral UI alerts.
- `capitalizeStr(str)`: Capitalizes first letter.
- `formatInlineMarkdownHtml(str)`: Converts basic markdown to safe HTML.
- `parseMarkdownToCanonicalBlocks(rawText)`: Parses string text into structured canonical objects.
- `renderCanonicalBlocks(item)`: Transforms canonical JSON structures into styled HTML fragments.
- `parseTableRow(line)`, `parseTableAlign(sepLine, count)`: Helper parsers for markdown tables.
- `copyCodeBlock(btn)`, `copyCommand(cmd)`: Clipboard wrappers.

**Stateful Business Logic:**
- `navigateTo(viewName)`: Manages top-level SPA visibility.
- `requestApi(endpoint, options)`: Wrapper around `fetch` with error parsing.
- `runWebIngestionPipeline(importFn)`: Orchestrates the simulated multi-step ingestion UI while awaiting backend calls.
- `checkAIStatus()`: Polls backend for local/cloud AI health.
- `handleSelectProcessingMode(mode)`: Modifies global AI routing preference.

## 6. Dead / unused / suspicious code
- **Legacy Functions:** `startReading()` and `generateSummary()` are explicitly marked as legacy/preserved for backwards compatibility.
- **Unused Branching:** Several `try/catch` blocks swallow errors silently (e.g., `api.setAIProvider(state.selectedAIProvider).catch(() => {});` and `try { ... } catch (e) { console.warn('Failed to load synopsis:', e); }` in `renderSemanticIntelligence`).
- **Simulated Delays:** `runWebIngestionPipeline` and `handleAddBookSubmit` use `setTimeout(..., 450/950/1450)` to animate UI ingestion steps while the actual API request is in flight. This is a suspicious "fake progress" pattern that could race with actual API completion.
- **Polling Missing:** `fetchJobs()` is called occasionally (like after import), but there is no active polling loop set up for background jobs, meaning the Jobs modal only updates when explicitly opened or triggered by another action.

## 7. Structural observations for React migration
- **Global State -> Context/Zustand:** The single `state` object maps perfectly to a global store (e.g., Zustand or Redux) or a root React Context provider.
- **Componentization:**
  - `renderCanonicalBlocks` is a prime candidate for a recursive React component `<CanonicalBlock block={block} />`.
  - The Modals (Add Book, Settings, Jobs, Delete) should be extracted into isolated components with their own local visibility state (or triggered via a global ModalProvider).
  - The Reader canvas relies heavily on imperative DOM manipulation (`bodyEl.innerHTML = ...`). In React, this will become declarative (`if (state.activeRepresentationMode === 'summary') return <SummaryCanvas />`).
- **Data Fetching:** The `api` wrapper functions can be migrated to React Query (`useQuery`, `useMutation`) to automatically handle loading states, caching, and the `.catch` logic that is currently scattered.
- **Inline Events:** Hundreds of inline `onclick="func()"` will convert directly to `onClick={func}` bindings. No complex event delegation is used.
- **Blockers:** The drag-and-drop implementation (`setupDragAndDrop`) attaches global/element listeners that will need to be refactored into React `onDragEnter`/`onDrop` props, likely using a hook or a wrapper component.

## 8. Top 10 things to know for migration
1. **Centralized State:** A single mutable `let state = {}` object drives the entire application and should be the first thing ported to a global store (e.g., Zustand).
2. **Custom Fetch Wrapper:** All networking runs through an `api` object that wraps `fetch`, manually handles JSON parsing, and throws standard Error objects.
3. **Manual DOM Routing:** "Routing" is accomplished by toggling `display: block/none` on top-level `div`s via the `navigateTo(viewName)` function.
4. **HTML String Injection:** Almost all UI updates rely on generating template strings and setting `.innerHTML`, which will translate well to JSX.
5. **Canonical Blocks Engine:** The app heavily uses a custom parser (`parseMarkdownToCanonicalBlocks`) and renderer (`renderCanonicalBlocks`) to display reading content; porting this to a React component tree is critical.
6. **Fake Loading UI:** Ingestion progress (file and web) uses hardcoded `setTimeout` sequences to simulate progress steps alongside the real API call.
7. **No Real Templating:** There are no `<template>` tags; all dynamic HTML (like list rows and search results) is hardcoded inside `.map().join('')` blocks in `script.js`.
8. **Modals Use Classes:** Modals are toggled by adding/removing a `.hidden` CSS class, unlike main views which use inline `style.display`.
9. **Multi-mode Reader:** The reader view has complex interlocking states (`original` vs `summary` representation, `canonical` vs `source` view mode, and single-book vs smart-editorial modes).
10. **LocalStorage Persistence:** The app relies on `localStorage` for theme, AI provider preference, and last-read book/chapter, which must be preserved in the new app's initialization logic.

