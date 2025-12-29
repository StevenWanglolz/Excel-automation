# Learning Resources

Resources for understanding and working with the SheetPilot codebase.

## Quick Start

1. **Read the README** - Setup and basic usage
2. **Review ARCHITECTURE.md** - Understand system structure
3. **Check DATA_FLOW.md** - See how data moves through the system
4. **Read STATE.md** - Understand frontend state management
5. **Reference API.md** - API endpoint documentation

## Codebase Structure

### Entry Points

**Frontend:**

- `frontend/src/main.tsx` - React app entry point
- `frontend/src/App.tsx` - Main app component with routing

**Backend:**

- `backend/app/main.py` - FastAPI app creation and route registration

### Key Files to Understand

**Backend:**

1. `backend/app/core/database.py` - Database connection setup
2. `backend/app/core/security.py` - Authentication and password hashing
3. `backend/app/api/dependencies.py` - Authentication dependency
4. `backend/app/services/file_service.py` - File operations
5. `backend/app/services/transform_service.py` - Flow execution
6. `backend/app/transforms/base.py` - Transform base class

**Frontend:**

1. `frontend/src/api/client.ts` - API client with interceptors
2. `frontend/src/store/authStore.ts` - Authentication state
3. `frontend/src/store/flowStore.ts` - Flow builder state
4. `frontend/src/components/FlowBuilder/FlowBuilder.tsx` - Main flow builder

## Learning Path

### Week 1: Basics

- [ ] Understand project structure
- [ ] Set up development environment
- [ ] Run the application locally
- [ ] Trace authentication flow end-to-end
- [ ] Understand how frontend and backend communicate

### Week 2: Core Features

- [ ] Understand file upload flow
- [ ] Learn how database models work
- [ ] Understand services pattern
- [ ] Learn how API client works
- [ ] Understand state management (stores)

### Week 3: Advanced

- [ ] Understand flow builder architecture
- [ ] Learn transform system
- [ ] Understand how transforms are executed
- [ ] Learn how to add new transforms
- [ ] Understand file cleanup logic

### Week 4: Mastery

- [ ] Be able to add new API endpoints
- [ ] Be able to add new UI components
- [ ] Be able to add new transforms
- [ ] Understand the full stack flow
- [ ] Be able to debug issues

## Key Concepts

### Backend Concepts

**Dependency Injection:**

- FastAPI uses `Depends()` to inject dependencies
- `get_db()` provides database session
- `get_current_user()` provides authenticated user
- Dependencies are automatically cleaned up

**Service Layer:**

- Routes delegate to services
- Services contain business logic
- Services can be tested independently
- Services coordinate between models and storage

**Registry Pattern:**

- Transforms registered with `@register_transform` decorator
- Looked up dynamically by name/ID
- Allows adding transforms without modifying core code

**Database Models:**

- SQLAlchemy ORM maps Python classes to database tables
- Relationships defined with `relationship()` and `ForeignKey`
- Models inherit from `Base` (declarative base)

### Frontend Concepts

**Zustand Stores:**

- Global state management
- Simple hook-based API: `const { data } = useStore()`
- Updates trigger automatic re-renders
- No providers or context needed

**React Flow:**

- Node-based editor library
- Nodes represent blocks, edges represent connections
- Custom node types for different block types
- Handles drag, drop, connect, pan, zoom

**API Client:**

- Axios instance with base URL
- Interceptors for auth token and error handling
- Type-safe API functions in `src/api/`

**Protected Routes:**

- `ProtectedRoute` component checks authentication
- Redirects to login if not authenticated
- Wraps routes that require authentication

## Common Tasks

### Adding a New API Endpoint

1. **Backend:**

   - Add route in `backend/app/api/routes/[module].py`
   - Add service function in `backend/app/services/[module]_service.py`
   - Test at `http://localhost:8000/docs`
2. **Frontend:**

   - Add function in `frontend/src/api/[module].ts`
   - Use in component

### Adding a New Transform

1. **Backend:**

   - Create class in `backend/app/transforms/[name].py`
   - Inherit from `BaseTransform`
   - Implement `validate()` and `execute()`
   - Register with `@register_transform("id")`
   - Import in `backend/app/main.py`
2. **Frontend:**

   - Create block component in `frontend/src/components/blocks/`
   - Add to `BlockPalette.tsx`
   - Register in `FlowCanvas.tsx` nodeTypes

### Adding a New Component

1. Create file in `frontend/src/components/`
2. Export component
3. Import and use in parent component

### Debugging

**Frontend:**

- Use browser DevTools (Console, Network tabs)
- Add `console.log()` statements
- Use React DevTools to inspect components
- Check Network tab for API calls

**Backend:**

- Check logs: `docker-compose logs -f backend`
- Use FastAPI docs: `http://localhost:8000/docs`
- Add `print()` statements
- Use debugger in IDE

## Troubleshooting

### Common Issues

**"Token invalid" errors:**

- Token expired (30 minutes)
- Token not in localStorage
- Backend SECRET_KEY changed

**File upload fails:**

- Check file size (max 50MB)
- Check file type (.xlsx, .xls, .csv only)
- Check disk space

**Flow execution fails:**

- Check transform config is valid
- Check file exists and is readable
- Check transform is registered

**Database connection errors:**

- Check PostgreSQL is running
- Check DATABASE_URL in .env
- Check database exists

## External Resources

### Technologies Used

- **FastAPI:** https://fastapi.tiangolo.com/
- **React:** https://react.dev/
- **Zustand:** https://zustand-demo.pmnd.rs/
- **React Flow:** https://reactflow.dev/
- **Pandas:** https://pandas.pydata.org/
- **SQLAlchemy:** https://www.sqlalchemy.org/

### Learning Resources

- **TypeScript Handbook:** https://www.typescriptlang.org/docs/
- **React Docs:** https://react.dev/learn
- **FastAPI Tutorial:** https://fastapi.tiangolo.com/tutorial/
- **Pandas Tutorial:** https://pandas.pydata.org/docs/getting_started/

## Code Reading Tips

1. **Start with entry points** - `main.tsx`, `main.py`
2. **Follow the data flow** - User action → API call → Backend → Response
3. **Read comments** - Code has comments explaining why, not just what
4. **Use IDE features** - Go to definition, find references
5. **Check types** - TypeScript types show what data looks like

## Getting Help

1. **Check documentation** - README, ARCHITECTURE.md, etc.
2. **Read code comments** - Explain why code exists
3. **Check API docs** - `http://localhost:8000/docs`
4. **Review similar code** - See how other features are implemented
5. **Ask questions** - Document unclear areas for future reference
