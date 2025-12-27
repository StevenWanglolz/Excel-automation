# Hands-On Learning Exercises

Practical exercises to help you understand your codebase by actually reading and tracing code.

---

## Exercise 1: Trace the Login Flow (30 minutes)

**Goal:** Understand how authentication works end-to-end

### Steps:

1. **Start with the UI**
   - Open `frontend/src/components/Auth/Login.tsx`
   - Find the form submission handler
   - What function is called when user clicks "Login"?

2. **Follow to the Store**
   - Open `frontend/src/store/authStore.ts`
   - Find the `login` function
   - What API function does it call?
   - What happens with the response?

3. **Check the API Client**
   - Open `frontend/src/api/auth.ts`
   - Find the `login` function
   - What endpoint does it call? (`POST /api/auth/login`)
   - What data does it send?

4. **Move to Backend**
   - Open `backend/app/api/routes/auth.py`
   - Find the login endpoint
   - What does it do with the credentials?
   - What does it return?

5. **Check Security**
   - Open `backend/app/core/security.py`
   - How are passwords verified?
   - How are tokens generated?

6. **Trace the Response Back**
   - How does the token get back to the frontend?
   - Where is it stored?
   - How does the UI know the user is logged in?

### Questions to Answer:
- [ ] What happens if the password is wrong?
- [ ] Where is the JWT token stored?
- [ ] How does the app know if you're logged in on page refresh?

---

## Exercise 2: Understand File Upload (45 minutes)

**Goal:** See how files move from browser to server to database

### Steps:

1. **Find the Upload Component**
   - Open `frontend/src/components/FileUpload/FileUploader.tsx`
   - How does it handle file selection?
   - What happens when user selects a file?

2. **Check the API Call**
   - Open `frontend/src/api/files.ts`
   - Find the `upload` function
   - What format is the file sent in? (FormData)
   - What endpoint does it hit?

3. **Backend Route**
   - Open `backend/app/api/routes/files.py`
   - Find the upload endpoint
   - What dependencies does it need? (user, database)
   - What service does it call?

4. **Service Layer**
   - Open `backend/app/services/file_service.py`
   - How is the file saved to disk?
   - What database record is created?

5. **Storage**
   - Open `backend/app/storage/local_storage.py`
   - Where are files actually stored?
   - How is the file path determined?

6. **Database Model**
   - Open `backend/app/models/file.py`
   - What information is stored about each file?
   - What's the relationship to users?

### Questions to Answer:
- [ ] Where on disk are files actually stored?
- [ ] How are files organized by user?
- [ ] What happens if two users upload a file with the same name?

---

## Exercise 3: Understand State Management (30 minutes)

**Goal:** Learn how Zustand stores work

### Steps:

1. **Examine authStore**
   - Open `frontend/src/store/authStore.ts`
   - What state variables are stored?
   - What functions can modify the state?

2. **See it in Action**
   - Open `frontend/src/components/Auth/Login.tsx`
   - How does it use `useAuthStore`?
   - What happens when login succeeds?

3. **Check Another Store**
   - Open `frontend/src/store/flowStore.ts`
   - How is it different from authStore?
   - What operations can you do on the flow?

4. **Find Usage**
   - Search for `useFlowStore` in the codebase
   - Where is it used?
   - How do components read and write to it?

### Questions to Answer:
- [ ] Why use stores instead of passing props?
- [ ] Can multiple components use the same store?
- [ ] How does state persist across page navigation?

---

## Exercise 4: Understand the Transform System (60 minutes)

**Goal:** Learn how data transformations work

### Steps:

1. **Base Transform**
   - Open `backend/app/transforms/base.py`
   - What methods must every transform implement?
   - What is the purpose of `validate` vs `execute`?

2. **Example Transform**
   - Open `backend/app/transforms/filters.py` or `rows.py`
   - Pick one transform class
   - How does it implement `validate`?
   - How does it implement `execute`?
   - What does it do to the DataFrame?

3. **Registry Pattern**
   - Open `backend/app/transforms/registry.py`
   - How are transforms registered?
   - How do you look up a transform by ID?

4. **Transform Service**
   - Open `backend/app/services/transform_service.py`
   - How does it execute a flow?
   - How are transforms chained together?

5. **Frontend Integration**
   - Open `frontend/src/components/FlowBuilder/FlowBuilder.tsx`
   - How does the flow get sent to the backend?
   - What happens with the result?

### Questions to Answer:
- [ ] How would you add a new transform type?
- [ ] What happens if a transform fails?
- [ ] How are transforms executed in order?

---

## Exercise 5: Understand the Flow Builder (90 minutes)

**Goal:** Learn the most complex feature

### Steps:

1. **Main Component**
   - Open `frontend/src/components/FlowBuilder/FlowBuilder.tsx`
   - What libraries does it use? (React Flow)
   - How are nodes and edges managed?

2. **Canvas**
   - Open `frontend/src/components/FlowBuilder/FlowCanvas.tsx`
   - How are nodes rendered?
   - How are connections (edges) created?

3. **Block Palette**
   - Open `frontend/src/components/FlowBuilder/BlockPalette.tsx`
   - What blocks are available?
   - How are they added to the canvas?

4. **Block Components**
   - Open `frontend/src/components/blocks/BaseBlock.tsx`
   - What is the base structure?
   - Look at a specific block (FilterBlock, TransformBlock)
   - How do they differ?

5. **Properties Panel**
   - Open `frontend/src/components/FlowBuilder/PropertiesPanel.tsx`
   - When is it shown?
   - How does it edit block configuration?

6. **Execution**
   - How does the flow get converted to JSON?
   - What format is sent to the backend?
   - How is the result displayed?

### Questions to Answer:
- [ ] How are nodes connected?
- [ ] Where is block configuration stored?
- [ ] How would you add a new block type?

---

## Exercise 6: Add a Console.log (15 minutes)

**Goal:** Make your first code change

### Task:
Add a console.log to see when a file is uploaded

1. Open `frontend/src/components/FileUpload/FileUploader.tsx`
2. Find where the file upload happens
3. Add: `console.log('File uploaded:', file.name)`
4. Save and test

### Then Try:
- Add a console.log in the backend route that receives the file
- Check both browser console and backend logs

---

## Exercise 7: Understand Database Models (30 minutes)

**Goal:** Learn how data is structured

### Steps:

1. **User Model**
   - Open `backend/app/models/user.py`
   - What fields does a user have?
   - What's the primary key?

2. **File Model**
   - Open `backend/app/models/file.py`
   - How is it related to User?
   - What information is stored?

3. **Flow Model**
   - Open `backend/app/models/flow.py`
   - How is flow data stored?
   - What's the relationship to users?

4. **Database Setup**
   - Open `backend/app/core/database.py`
   - How is the database connection created?
   - How are tables created?

### Questions to Answer:
- [ ] How would you add a new field to the User model?
- [ ] What happens when you add a new model?
- [ ] How are relationships defined?

---

## Exercise 8: Trace an API Request (20 minutes)

**Goal:** See the full request/response cycle

### Task:
Pick any API endpoint and trace it completely

1. **Frontend API Call**
   - Find the function in `frontend/src/api/`
   - What method? (GET, POST, etc.)
   - What URL?
   - What data is sent?

2. **Backend Route**
   - Find the route in `backend/app/api/routes/`
   - What does it do?
   - What does it return?

3. **Test It**
   - Use the browser DevTools Network tab
   - Make the request
   - See the request and response
   - Check backend logs

### Questions to Answer:
- [ ] What headers are sent?
- [ ] What's the response format?
- [ ] How are errors handled?

---

## Exercise 9: Understand Component Structure (30 minutes)

**Goal:** Learn React component patterns

### Steps:

1. **Simple Component**
   - Open `frontend/src/components/Auth/Login.tsx`
   - What hooks does it use?
   - How does it handle form submission?
   - How does it show errors?

2. **Complex Component**
   - Open `frontend/src/components/FlowBuilder/FlowBuilder.tsx`
   - How is state managed?
   - How are child components used?
   - What side effects are there? (useEffect)

3. **Reusable Component**
   - Open `frontend/src/components/blocks/BaseBlock.tsx`
   - How is it designed to be reused?
   - What props does it accept?

### Questions to Answer:
- [ ] When would you use useState vs a store?
- [ ] How do components communicate?
- [ ] What's the component lifecycle?

---

## Exercise 10: Make a Small Feature Change (60 minutes)

**Goal:** Apply what you've learned

### Task Options:

**Option A: Change a Label**
- Find a button or label in the UI
- Change the text
- See it update

**Option B: Add a Console Log**
- Add logging to understand when something happens
- Check both frontend and backend logs

**Option C: Add a Simple Validation**
- Add validation to a form
- Show an error message

**Option D: Change a Color/Style**
- Modify CSS/Tailwind classes
- See visual changes

### Steps:
1. Find the relevant file
2. Make the change
3. Test it
4. Understand what you changed

---

## Daily Practice Routine

### Day 1: Basics
- [ ] Exercise 1: Login Flow
- [ ] Exercise 6: Add Console.log
- [ ] Read CODEBASE_LEARNING_GUIDE.md sections 1-2

### Day 2: Core Features
- [ ] Exercise 2: File Upload
- [ ] Exercise 7: Database Models
- [ ] Read CODEBASE_LEARNING_GUIDE.md sections 3-4

### Day 3: State & API
- [ ] Exercise 3: State Management
- [ ] Exercise 8: Trace API Request
- [ ] Read CODEBASE_LEARNING_GUIDE.md section 5

### Day 4: Advanced
- [ ] Exercise 4: Transform System
- [ ] Exercise 9: Component Structure
- [ ] Read CODEBASE_LEARNING_GUIDE.md section 6

### Day 5: Complex Features
- [ ] Exercise 5: Flow Builder
- [ ] Exercise 10: Make a Change
- [ ] Review CODEBASE_LEARNING_GUIDE.md

---

## Tips for Learning

1. **Don't try to understand everything at once**
   - Focus on one feature at a time
   - It's okay to skip details initially

2. **Use the debugger**
   - Set breakpoints in browser DevTools
   - Step through code execution
   - See variable values

3. **Add console.logs liberally**
   - See what data looks like
   - Understand execution flow
   - Remove them later

4. **Read error messages carefully**
   - They tell you exactly what's wrong
   - Stack traces show you where the error occurred

5. **Ask questions**
   - "What does this function do?"
   - "Why is this structured this way?"
   - "How does this connect to that?"

6. **Make small changes**
   - Change a label
   - Add a log
   - Modify a color
   - See what happens

---

## Checklist: Do You Understand?

After completing exercises, can you:

- [ ] Explain how a user logs in (frontend → backend → database)
- [ ] Explain how a file is uploaded and stored
- [ ] Explain how state is managed in the frontend
- [ ] Explain how a transform is executed
- [ ] Explain how the flow builder works
- [ ] Find any file in the codebase
- [ ] Make a small change and test it
- [ ] Add a console.log to debug something
- [ ] Understand what an API endpoint does
- [ ] Explain the database structure

If you can check all of these, you understand your codebase! 🎉

