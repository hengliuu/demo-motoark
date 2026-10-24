---
name: typescript-conventions
description: Team-wide TypeScript and JavaScript conventions for how the code itself is written (typing, naming, control flow, function design, errors, performance, dates, React hooks and forms, refactoring safety). Use whenever writing, reviewing, or refactoring any TypeScript or JavaScript in any framework (React, Next.js, Vite, Node, Hono, NestJS, scripts, tests), even for a single function, a one-line fix, or a code review comment. Load this BEFORE a framework pattern skill such as web-frontend-patterns. The pattern skill decides where a file goes, this skill decides how the code inside it reads.
---

# TypeScript Conventions

Rules for how TypeScript is written, independent of framework. A project's own `AGENTS.md`
or `CLAUDE.md` wins where it conflicts. When editing existing code, match the file's current
style instead of rewriting it to these rules. Keep changes surgical: these rules govern the
code you add, not the code you happen to pass by.

Where things live (features, modules, layers, files) belongs to the framework pattern skill.
If a rule here seems to say where a file goes, it doesn't. Check the pattern skill.

## Typing

- **No `any`.** Use `unknown` and narrow, a generic, or a precise union. `any` switches the
  compiler off for everything it touches, and the next reader inherits the bug.
- **No `as` to silence the compiler.** A cast is a claim the compiler cannot check. Narrow
  with a type guard or parse with a schema. `as const` and `satisfies` are fine, they add
  checking instead of removing it.
- **`satisfies` for config objects and lookup tables.** `const routes = {...} satisfies
  Record<string, Route>` checks every entry and keeps the literal keys for autocomplete.
- **Explicit return types on exported functions.** Inference is fine inside a module. At a
  boundary the signature is documentation and a contract.
- **Object shapes are `interface`s. Schema-backed shapes are `z.infer<typeof schema>`.**
  Never write both for the same shape, two definitions drift apart.
- **Model states as discriminated unions** (`{ status: "loading" } | { status: "ok"; data: T }`)
  instead of a bag of optional fields. Impossible states then cannot be written.
- **Don't change an existing signature, return shape, or API response** unless the task asks
  for it. A changed shape silently breaks every caller. Refactor the inside, keep the outside.
- **Treat data from outside (API, storage, URL, env) as untrusted.** Parse it with a schema at
  the boundary, then trust the parsed value everywhere else.
- **`import type` for type-only imports.** It keeps runtime bundles and import cycles honest.

## Modern syntax

- `const` by default, `let` only when reassigned, never `var`.
- `??` for defaults, not `||`. `||` swallows `0`, `""` and `false`, which are often valid.
- Optional chaining `?.` instead of chained `&&` guards.
- Destructuring and template literals over property-by-property copies and `+`.
- Defaults plus overrides: spread defaults first, then the real values, so the real values
  win: `{ ...defaults, ...actual }`.
- Pick the array method that says what you mean: `map` transforms, `filter` selects, `find`
  takes the first match, `some` and `every` answer yes or no (and stop early), `includes`
  checks membership. A `forEach` that pushes into an array is a `map` in disguise.

## Control flow

- Guard clauses and early returns. Nesting past two levels is a signal to extract.
- No `else` after a `return`.
- Union types or enums over magic numbers and strings. `status === 0` tells the reader
  nothing, `status === "pending"` does.
- Make a `switch` over a union exhaustive with a `never` check in `default`, so adding a new
  member is a compile error at every switch that forgot it:

```ts
default: {
  const unreachable: never = status;
  throw new Error(`Unhandled status: ${unreachable}`);
}
```

## Naming

| Thing | Convention | Example |
|---|---|---|
| Variables, functions, methods | `camelCase` | `getUserById` |
| Types, interfaces, classes, components | `PascalCase` | `UserProfile` |
| Module-level constants | `SCREAMING_SNAKE_CASE` | `MAX_RETRY_COUNT` |
| Booleans | `is`, `has`, `can`, `should` or `will` prefix | `isVisible`, `hasAccess` |
| Collections | plural, single value singular | `users` vs `user` |
| Helpers that throw | `assert*` throws, `check*` returns boolean, `ensure*` creates or throws | `assertPermission()` |

- Names reveal intent: `getUserById` over `getData`. No `Custom`, `My` or `Base` prefixes
  unless the word means something.
- Don't lie in a name: a `Record` is not `accountList`. Don't encode the type (`strName`,
  `iCount`), the editor already knows it.
- Numeric literals with separators: `86_400_000`, not `86400000`.
- Searchable over short: a bare `7` in a loop cannot be grepped, `MAX_CLASSES_PER_STUDENT` can.

## Functions

- One thing, one level of abstraction. If a block inside an `if` or loop is more than a line
  or two, it wants a name.
- Zero or one argument is ideal. Two is fine when they form one concept (`x, y`). Three or
  more become an options object, because positional triads make every call site a guess.
- No boolean flag arguments. A flag means the function does two things, so split it.
- Arguments are inputs, return values are outputs. Don't mutate what was passed in, return
  the new value.
- A function either changes state or answers a question, not both. Its name is a promise:
  `checkPassword` must not also start a session.

## Performance

- **Never `find` inside `map`** over two lists. Build a lookup first:
  `new Map(roles.map((r) => [r.id, r]))`. Not `reduce((acc, r) => ({ ...acc, [r.id]: r }), {})`,
  because the spread copies the object on every step and is itself O(n²).
- **Never query a database or call an API inside a loop.** Fetch the batch (`WHERE id IN (...)`,
  a bulk endpoint), index it in memory, then merge.
- Load only what the screen or caller needs: paginate, select fields, lazy-load.
- Pre-compute derived data that is read far more often than it changes.
- Profile before optimizing anything else. `useMemo` and `useCallback` are for measured cost,
  not decoration.

## Dates and time

- The backend sends UTC in ISO 8601 (`2024-01-15T10:30:00Z`).
- The frontend detects the viewer's zone with
  `Intl.DateTimeFormat().resolvedOptions().timeZone` and lets the date library convert.
- **Never hardcode an offset** (`add(7, "hours")` for WIB). It is right for exactly one
  timezone, wrong for every other user, and it breaks silently.

## Error handling

- Throw errors, don't return error codes. Codes force nested checks at every caller.
- Keep the `try` body small by extracting it into a named function, so the flow reads as
  logic and the `catch` reads as policy.
- Catch at boundaries (route handler, event handler, job runner), not in every helper.
- A query function or service call that fails must throw. Swallowing an error and returning
  `undefined` hides the failure from the caller and from monitoring.
- Throw `Error` instances (or subclasses), never strings, so the stack trace survives. Pass
  the original as `cause`: `new Error("Failed to load order", { cause: err })`.

## React (only when the file is a component or hook)

- Server state lives in TanStack Query. Handle `isPending`, `isError` and `isSuccess`. The
  query key includes every parameter the request depends on.
- Debounce search inputs that hit an API. Without it every keystroke is a request, and the
  responses race each other.
- Forms use react-hook-form as the single source of truth, never a `useState` per field. Type
  form props as `UseFormReturn<T>`. Setting three or more fields at once is
  `form.reset({...})`, not repeated `setValue`.
- `useEffect` is for synchronising with something outside React. Not for derived values
  (compute them, or `useMemo`) and not for reacting to a user action (handle it in the
  handler). Dependency arrays are complete.
- Group related state: three `useState` booleans for three modals is one object or one
  custom hook.
- Zustand: read with selectors (`useStore((s) => s.count)`) and take actions from the hook at
  the top of the component rather than `getState()` inline.
- Conditional render (`{open && <Form />}`) resets the child's state, CSS `hidden` preserves
  it. Choose deliberately: reset for one-shot modals, preserve for forms and tabs the user is
  filling in.
- Extract business logic out of components into hooks or plain functions. Components render.

## Refactoring and cleanup

- Copying more than ten lines is the signal to extract, not the second copy.
- An object literal you cannot read in five seconds gets built in named steps. Two levels of
  nesting is the ceiling.
- Remove the imports, variables and `console.log`s your change made unused. Leave
  pre-existing dead code alone unless asked (mention it instead).
- Do not fork a function into `fooV2` to avoid touching it. That leaves two versions to
  maintain and no test that says which one is live. Change it and let the tests prove it.
- Comments say *why*, in English. Commented-out code, author tags and change logs get
  deleted, version control remembers them.
- Prettier and ESLint own formatting and lint. Run them, never hand-argue quotes or indentation.

## Verify before done

Type-check and lint must pass (`pnpm type-check` and `pnpm lint`, or the project's
equivalent from `package.json`). "Should compile" is not done. If a check cannot run (no
dependencies installed, no script), say so in the handoff instead of implying it passed.

## References

- [references/examples.md](references/examples.md): longer before and after pairs for the
  rules that are easiest to get wrong (lookup map vs `find` in `map`, timezones, debounced
  search, spaghetti object literals, preserving a return shape, `useEffect` misuse, exhaustive
  switches). Read the section you need, not the whole file.
