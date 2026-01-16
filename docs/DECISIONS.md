# Architectural Decisions

This document records important architectural decisions and their rationale. Each entry explains why a choice was made and when to revisit it.

## Technology Choices

### 2024-12-27 – Chose FastAPI over Flask/Django

**Reason:** Automatic API docs, built-in async, type hints with Pydantic, less boilerplate than Flask, lighter than Django for API-only app.

**Revisit if:** Need Django admin panel or complex ORM features.

### 2024-12-27 – Chose Zustand over Redux/Context

**Reason:** Minimal boilerplate, small bundle size, simple API, TypeScript support. Redux has too much boilerplate, Context API has performance issues.

**Revisit if:** Need time-travel debugging or complex middleware requirements.

### 2024-12-27 – Chose React Flow for flow builder

**Reason:** Built for node-based editors, handles drag/connect/pan/zoom, well-maintained, TypeScript support. Building custom would be too much work.

**Revisit if:** Need features React Flow doesn't support or performance becomes an issue.

### 2025-12-30 – Chose @dnd-kit for drag and drop

**Reason:** Native HTML5 drag and drop was clunky and lacked animation. @dnd-kit provides a modern, accessible, and smooth sorting experience with minimal boilerplate.

**Revisit if:** Bundle size becomes a major concern (though it is relatively lightweight).

### 2025-02-14 – Switched to sequential pipeline UI

**Reason:** Backend execution is strictly sequential (order-based), so a linear pipeline with drag-and-drop reorder and per-step previews matches user expectations and prevents graph/edge confusion.

**Revisit if:** We add true branching/merging execution (topological sort + multi-input nodes).

### 2025-02-20 – Added per-step file/sheet targeting + output block mapping

**Reason:** Users need to apply operations to specific file/sheet tables and export multi-sheet outputs without abandoning the sequential pipeline model.

**Revisit if:** We introduce true branching graphs or want to support explicit dataset nodes.

### 2024-12-27 – Chose PostgreSQL over SQLite/MySQL

**Reason:** Production-ready, better concurrency, rich features (JSON columns), Docker setup easy. SQLite not suitable for production, MySQL has weaker JSON support.

**Revisit if:** Need embedded database or specific MySQL features.

## Architecture Decisions

### 2026-01-03 – Added file groups + group-backed exports

**Reason:** Users need to group related uploads and reuse them across flows, and group-backed exports keep generated outputs organized and reusable.

**Revisit if:** Group selection becomes too rigid or we need more granular per-file inclusion controls.

### 2026-01-04 – Added mapping input blocks, removed mapping modes

**Reason:** Lookup tables are easier to manage as dedicated mapping inputs instead of per-step ad-hoc uploads, and a single, predictable source/destination rule avoids confusing mapping mode choices.

**Revisit if:** Users need explicit many-to-many mapping controls that cannot be expressed with the default fan-out/append rules.

### 2024-12-27 – Registry pattern for transforms

**Reason:** Allows adding new transforms without modifying core code, dynamic lookup, easy to test. Hardcoded if/else would require core changes for each transform.

**Revisit if:** Need compile-time type checking or transform dependencies.

### 2024-12-27 – Service layer pattern

**Reason:** Routes handle HTTP, services handle business logic. Services testable independently, reusable. Business logic in routes would be harder to test.

**Revisit if:** App becomes very small (might be overkill) or need different abstraction.

### 2024-12-27 – File storage on disk, not in database

**Reason:** Database would bloat with binary data, files can be large (50MB), easier to manage separately, can move to cloud storage later.

**Revisit if:** Need multi-server deployment (requires shared storage like S3) or want automatic database backups to include files.

### 2024-12-27 – File size validation enforced (50MB limit)

**Reason:** Prevents disk space issues, ensures reasonable processing times, protects against accidental large uploads. Validation happens before saving to disk (efficient) with a secondary check after saving (safety net).

**Implementation:** File size checked in `local_storage.py` before saving, and again in `file_service.py` after saving. Files exceeding limit return HTTP 413 error and are not saved.

**Revisit if:** Need to support larger files (would require chunked processing, streaming, or background jobs).

### 2024-12-27 – Periodic cleanup of orphaned files

**Reason:** Automatically free up disk space, prevent orphaned files from accumulating, improve storage efficiency. APScheduler runs cleanup every 6 hours.

**Implementation:** `app/core/scheduler.py` manages background jobs. Cleanup job queries all users, finds files not referenced by flows, and deletes them from disk and database. Starts on app launch, shuts down gracefully on app stop.

**Revisit if:** Cleanup interval needs adjustment (change `hours=6` in scheduler.py) or need to move cleanup to external job queue (Celery).

### 2024-12-27 – JWT token authentication

**Reason:** Stateless, scalable across servers, standard for REST APIs, token contains user ID. Session-based would require shared storage.

**Revisit if:** Need token revocation (would need token blacklist) or refresh tokens for better UX.

### 2024-12-27 – Sequential transform execution

**Reason:** Each transform depends on previous output, simpler to understand/debug, matches user's mental model. Parallel execution would be faster but more complex.

**Revisit if:** Need to optimize for large files or have independent transforms that could run in parallel.

### 2024-12-27 – Pandas for data processing

**Reason:** Industry standard, handles Excel/CSV natively, rich API, well-documented. Custom parsing would be too much work.

**Revisit if:** Need better performance for simple operations or lower memory usage for very large files.

### 2025-03-10 – In-memory preview cache (no Redis yet)

**Reason:** Fastest path to reduce repeated preview recomputation without adding infrastructure. Cache is per-process LRU+TTL, warmed via `/transform/precompute`.

**Revisit if:** Previews need to persist across app restarts, multi-instance deployments are added, or cache hit rate is too low.

## Code Organization Decisions

### 2024-12-27 – Separate API client from components

**Reason:** Reusable, centralized error handling, type-safe, easy to mock. Structure: Component → API Function → apiClient → Backend.

**Revisit if:** App becomes very small (might be overkill).

### 2024-12-27 – Store pattern for global state

**Reason:** Avoid prop drilling, single source of truth, easy access from any component. Use stores for shared state (auth, flow), useState for local state (forms, modals).

**Revisit if:** Need more complex state management features.

### 2024-12-27 – TypeScript for frontend

**Reason:** Catch errors at compile time, better IDE support, self-documenting, easier to maintain. Slightly more verbose but worth it.

**Revisit if:** Team doesn't know TypeScript (but should learn it).

## Security Decisions

### 2024-12-27 – bcrypt for password hashing

**Reason:** Industry standard, slow by design (prevents brute force), handles salting automatically. SHA-256 too fast, Argon2 newer but less established.

**Revisit if:** Need even stronger hashing (Argon2) or performance becomes issue.

### 2024-12-27 – Token expiration: 30 minutes

**Reason:** Balance security and UX, limits damage if compromised. Users login more frequently but it's acceptable.

**Revisit if:** Users complain about frequent logins (could add refresh tokens).

### 2024-12-27 – Per-user file directories

**Reason:** Prevents cross-user access, easy cleanup, clear organization. Backend validates ownership before serving.

**Revisit if:** Need different access patterns (shared files, etc.).


### 2026-01-05 – Adopted Stream-Centric Architecture

**Reason:** Complex flows (branching, merging) created ambiguity about which "Source" was being used (Original vs Modified).
**Decision:**
- **Graph Topology as Truth:** Availability is determined by edges.
- **Visual Grouping:** Properties Panel groups inputs by "Parent Node".
- **Source-Dest Pairs:** Manual destinations now strictly pair a Source Stream to an Output.
- **Merged Logic:** Implicit "Virtual Streams" replaced confusing "Source/Destination" naming.

**Reference:** See [STREAM_ARCHITECTURE.md](./STREAM_ARCHITECTURE.md) for full design.

### 2026-01-13 – Groups-to-Merge (G2M) Mode

**Reason:** Users need to choose between processing batch files individually (1:1) or merging them into a single output (N:1).

**Decision:** Added `destinationMode` to node data.
- **separate:** (Default) Output 1 processing result per input source (1:1).
- **merge:** Output a single workbook containing data from all sources (N:1). Backend strategy: Row-wise concatenation aligned by column name. Missing columns in some sources are filled with NaNs.

**Migration Note:** Existing flows without `destinationMode` default to 'separate'. No migration required, but users can opt-in to 'merge'.

**Future Considerations:**
- **Merge Options:** 
  - `preserve_sheets`: Maintain original spreadsheet/tab structure when merging (keep inputs as separate tabs).
  - `custom_mapping`: User-defined field-to-field mapping rules for disparate schemas.
- **Partial Merges:** Support merging N sources into M destinations with configurable routing/filters.
- **Append:** Append to existing external files.

## Performance Decisions

### 2024-12-27 – No caching layer initially

**Reason:** Keep architecture simple, not needed for MVP. Can add Redis later for file previews, flow results, user data.

**Revisit if:** Performance becomes bottleneck or need to scale.

### 2024-12-27 – In-memory DataFrame processing

**Reason:** Simpler implementation, pandas works best with full DataFrames, files limited to 50MB (enforced by validation). Higher memory usage but acceptable.

**Revisit if:** Need to handle files larger than 50MB (would need chunking, streaming, or background processing).

## Future Considerations

### Decisions to Revisit

- **File Storage:** Move to S3/cloud storage for multi-server deployments
- **Caching:** Add Redis for frequently accessed data
- **Background Jobs:** Use Celery for long-running transformations
- **Database Migrations:** Switch from `create_all` to Alembic migrations
- **Rate Limiting:** Add to prevent abuse
- **Refresh Tokens:** Improve UX for long sessions

### Scalability Path

1. **Phase 1 (Current):** Single server, local file storage
2. **Phase 2:** Add cloud file storage (S3)
3. **Phase 3:** Add caching layer (Redis)
