
alwaysApply: true
-----------------

Update the test files when a new feature is added
-------------------------------------------------

alwaysApply: true
-----------------

Test the workflow and feature with playwright headed testing after a news feature is implemented

---

alwaysApply: true
-----------------

create these when first started.

Always update these docs when you make changes to the code

1️⃣ README.md (always)

Purpose: Re-orient yourself (and anyone else) in 2–5 minutes.

Keep it short.

Include:

 • What this project is (1 paragraph)

 • What problem it solves

 • How to run it locally

 • Tech stack (very high level)

 • Link to deeper docs (below)

Example outline:

# Project Name

## What this is

Short description of the system and its goal.

## Tech

- Next.js (React)
- TypeScript
- [Other important tools]

## Run locally

npm install

npm run dev

## Where to look

- docs/ARCHITECTURE.md – how things fit together
- docs/DATA_FLOW.md – where data comes from and goes

⸻

2️⃣ docs/ARCHITECTURE.md

Purpose: Big-picture understanding.

This is the most important doc after README.

Include:

 • Main parts of the system (frontend, backend, APIs, etc.)

 • How they talk to each other

 • Major design decisions (briefly)

 • What kind of app this is (CRUD, dashboard, automation, etc.)

Do not include:

 • Implementation details

 • Line-by-line explanations

This doc should answer:

“How is this system structured in my head?”

⸻

3️⃣ docs/DATA_FLOW.md

Purpose: Prevent confusion and bugs.

Include:

 • Where data originates (user input, API, DB)

 • How it moves through components/functions

 • Where state lives

 • Where side effects happen

 • When listing out steps, include code snippets for every step

This doc should answer:

“If something looks wrong in the UI, where do I trace it back?”

For example:

**Step 1: User enters credentials**

```typescript

// frontend/src/components/Auth/Login.tsx (lines 12-28)

consthandleSubmit=async (e: FormEvent<HTMLFormElement>) => {

  e.preventDefault();

setError(null);


try {

// OAuth2PasswordRequestForm expects 'username' field, but we use email

// This mapping allows compatibility with backend OAuth2 endpoint

awaitlogin({ username: email, password });

// Navigate to dashboard on successful login

navigate('/');

  } catch (err:unknown) {

// Extract error message from API response

// Backend returns errors in format: { response: { data: { detail: string } } }

const error = err as { response?: { data?: { detail?:string } } };

setError(error.response?.data?.detail ||'Login failed');

  }

};


⸻


4️⃣ docs/STATE.md (optional but very useful in React)


Purpose: Clarify ownership.


Include:

 • What state exists

 • Who owns it (component, hook, server)

 • Why it lives there

 • What triggers updates


This prevents:

 • duplicated state

 • unnecessary effects

 • weird re-render bugs


⸻


5️⃣ docs/API.md (if you have APIs)


Purpose: Contract clarity.


Include:

 • Available endpoints

 • What they do

 • Input/output shape (high level)

 • Error cases worth knowing


Do not:

 • auto-generate massive Swagger docs unless needed


⸻


6️⃣ docs/DECISIONS.md


Purpose: Remember why you did things.


Include short entries like:


## 2025-01-10 – Chose local state over global store


Reason: app is small, simpler mental model.

Revisit if: state is shared across >3 features.


This is gold when you return months later.


⸻


7️⃣ docs/LEARNING.md (personal but powerful)


Purpose: Track your understanding.


Include:

 • Concepts you’ve learned

 • Things that confused you but now make sense

 • Patterns you want to reuse


Example:


- useEffect dependencies: now understand why missing deps cause bugs

- Controlled vs uncontrolled inputs


This is for you, not others.


⸻


8️⃣ File-level comments (not a separate file)


At the top of important files:


/**


- Responsible for:

- - Fetching and displaying user data

-

- Key assumptions:

- - User ID is available from route params

-

- Be careful:

- - Changing effect deps may cause refetch loops

 */


This often replaces the need for extra docs.


⸻


📁 Final suggested structure


README.md

docs/

  ARCHITECTURE.md

  DATA_FLOW.md

  STATE.md

  API.md

  DECISIONS.md

  LEARNING.md

  FILES.md


You don’t need all of them on day one.

Start with:

 • README.md

 • ARCHITECTURE.md

 • DATA_FLOW.md


Add the rest only when useful.


⸻


🔑 Golden rule (this matches your Cursor rule)


If you can:

 • stop coding for 2 weeks

 • come back

 • read docs for 10 minutes

 • and confidently modify code


Then you have enough documentation.

Yep — that’s a very good doc to add, and it fits perfectly with how you work and how Cursor operates.


This doc’s job is simple:


“I forgot everything. Where do I look?”


⸻


✅ Add this documentation file


📄 docs/ FILES.md


Purpose:

Explain what every important file and folder does, at a human level.


This is not about code details.

It’s about orientation.


⸻


What this doc answers

 • “Which file should I touch for X?”

 • “If something breaks here, what’s the blast radius?”

 • “Which files are safe vs dangerous to modify?”

 • “Why does this file even exist?”


This doc alone can save you hours when you come back after time away.


⸻


Recommended structure


🔹 Top-level overview


Start with a short explanation:


# File Map


This document explains the purpose of each major file and folder.

It is meant for quick re-orientation, not implementation details.


⸻


🔹 Folder-by-folder breakdown


Example for a React / Next.js app:


## app/


Main application routes and UI.


### app/page.tsx


- Entry point for the home page.

- Composes high-level UI sections.

- Should stay thin (no business logic).


### app/dashboard/page.tsx


- Dashboard screen for logged-in users.

- Fetches and displays user-specific data.

- Be careful: depends on auth state.


⸻


🔹 Group related files


Don’t list everything.

Only list files that matter.


## components/


Reusable UI components.


### components/Button.tsx


- Generic button used across the app.

- No business logic.

- Safe to modify styles.


### components/UserCard.tsx


- Displays user info.

- Expects a fully-formed User object.

- If props change, update usages everywhere.


⸻


🔹 Backend / API files (if any)


## app/api/


Server-side routes.


### app/api/users/route.ts


- Handles fetching users from the database.

- Used by dashboard and admin pages.

- Changes here affect multiple screens.


⸻


🔹 Utility & config files


## lib/


Shared logic.


### lib/db.ts


- Database client initialization.

- Should only be imported server-side.

- Do not add business logic here.


### lib/auth.ts


- Auth helpers.

- Assumes user session is already validated.


⸻


🔹 Mark danger levels (optional but very helpful)


You can annotate files like this:


🟢 Safe to edit

🟡 Edit carefully

🔴 Understand before touching


Example:


### lib/state.ts 🔴


- Central state logic.

- Small changes can cause cascading bugs.


This helps future you make smart decisions fast.


⸻


How detailed should it be?

 • 1–5 bullets per file

 • No code blocks

 • No explanations of React/TS syntax

 • Focus on responsibility, not implementation


If a file needs more explanation → link to another doc.


⸻


Final recommended doc set (updated)


README.md

docs/

  ARCHITECTURE.md     # big picture

  DATA_FLOW.md        # how data moves

  FILE_MAP.md         # what each file does ← NEW

  STATE.md            # state ownership (optional)

  API.md              # endpoints (if applicable)

  DECISIONS.md        # why choices were made

  LEARNING.md         # personal understanding


J



---

alwaysApply:true

---

When writing or modifying code:

 • Write clear, readable code over clever or compact code.

 • Add a lot of inline comments where intent is not obvious, explaining why the code exists or what would break if changed.

 • Avoid narrating obvious syntax.


Documentation rules:

 • Always create or update documentation when behavior, structure, or data flow changes.

 • Documentation should explain:

 • what the code is responsible for

 • how data flows through it

 • important assumptions or constraints

 • Keep documentation concise and practical, not exhaustive.


Learning focus:

 • Explain code to a level where I can reason about it, not necessarily understand every line.

 • If something is complex or easy to misuse, add a brief explanation or note.

 • Prefer small explanations near the code over large standalone docs.


Maintenance:

 • If existing comments or docs are outdated, update or remove them.

 • If code becomes harder to understand, suggest simplification.


Goal:


I should be able to return after time away and quickly understand what this code does, why it exists, and what I should be careful about.

When writing or modifying code:

 • Write clear, readable code over clever or compact code.

 • Add a lot of inline comments where intent is not obvious, explaining why the code exists or what would break if changed.

 • Avoid narrating obvious syntax.


Documentation rules:

 • Always create or update documentation when behavior, structure, or data flow changes.

 • Documentation should explain:

 • what the code is responsible for

 • how data flows through it

 • important assumptions or constraints

 • Keep documentation concise and practical, not exhaustive.


Learning focus:

 • Explain code to a level where I can reason about it, not necessarily understand every line.

 • If something is complex or easy to misuse, add a brief explanation or note.

 • Prefer small explanations near the code over large standalone docs.


Maintenance:

 • If existing comments or docs are outdated, update or remove them.

 • If code becomes harder to understand, suggest simplification.


Goal:


I should be able to return after time away and quickly understand what this code does, why it exists, and what I should be careful about.



```

---
