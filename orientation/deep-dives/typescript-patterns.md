# Deep Dive — TypeScript Patterns You'll See and Use

> Companion to `orientation/README.md §5 TypeScript Patterns`.
> Code to read: `tsconfig.json` (root + each package), `shared/src/types/`, `api/src/types/`.

## Why this matters for the audit

The Type Safety category isn't about counting `any`s — it's about whether the
type system is doing real work. The brief is explicit:

> "Replacing `any` with `unknown` without proper type narrowing is **not** an
> improvement. Each fix must include correct, meaningful types that reflect
> the actual data."

So the audit work is: find a violation, *understand the data shape*, and
introduce a type that captures it. You can't do that fluently without the
four pattern families below.

## 1. Strict mode and friends — read the config first

Before counting violations, know which rules are on. The headline flag is
`"strict": true` in `tsconfig.json`, which enables 8+ sub-flags. The two
extra rules that catch the most real bugs but are *not* part of `strict`:

- `noUncheckedIndexedAccess` — makes `arr[i]` return `T | undefined`. Without
  it, `arr[i]` is `T`, which lies about reality.
- `exactOptionalPropertyTypes` — distinguishes `{ x?: string }` (key may be
  absent) from `{ x: string | undefined }` (key present, value may be
  undefined). Almost always you want the first.

**Audit move:** before measuring, record which of these are on. If
`noUncheckedIndexedAccess` is off, that's a one-flag-flip fix that *creates*
hundreds of errors — useful for understanding the codebase, not necessarily
for the audit count.

## 2. Generics — the workhorse

Generics let a function or type be parameterized by another type. The two
shapes you'll meet:

```ts
// Generic function — caller picks T
function findById<T extends { id: string }>(items: T[], id: string): T | undefined {
  return items.find(i => i.id === id);
}

// Generic type — used to describe a relationship between input and output
type ApiResponse<T> = { data: T; error: null } | { data: null; error: string };
```

**Why this matters during the audit:** the API client and the OpenAPI types
are almost certainly generic. A type like `ApiResponse<T>` is *only* useful
if `T` is concrete at every call site. If you find `ApiResponse<any>` in
practice, that's a violation worth fixing — the generic is doing no work.

**Constraint syntax:** `<T extends Foo>` says "T must be assignable to Foo."
Use it to narrow what generic parameters you'll accept.

## 3. Discriminated unions — the unified-document-model in TypeScript

A discriminated union is a union of object types that share a literal field.
The compiler narrows the type based on the discriminator:

```ts
type Document =
  | { type: "wiki";    title: string; content: string }
  | { type: "issue";   title: string; status: "open" | "closed"; priority: 1 | 2 | 3 }
  | { type: "project"; title: string; startDate: string; endDate: string };

function render(doc: Document) {
  switch (doc.type) {
    case "issue":
      doc.status; // typed: "open" | "closed"
      doc.priority; // typed: 1 | 2 | 3
      // doc.content would be a type error here
      return; 
    case "wiki":
      doc.content; // typed: string
      return;
    case "project":
      doc.startDate;
      return;
  }
}
```

**This is almost certainly how `document_type` is modeled in `shared/src/types/`.**
Confirm by reading it. If it's modeled as `type Document = { type: string; ... }`
with no narrowing, that's a finding — it means the type system isn't
enforcing the contract that "an issue has a status."

**Exhaustiveness check.** A bulletproof switch over a discriminated union
ends with:

```ts
default: {
  const _exhaustive: never = doc;
  throw new Error(`Unhandled type: ${(doc as Document).type}`);
}
```

If a new document type is added and a switch isn't updated, this turns into a
compile error. Grep for `: never` in the codebase to see if this pattern is
used.

## 4. Utility types — Partial / Pick / Omit / Required / Readonly

These are pre-built generic types in the standard lib. The four you'll meet
most:

```ts
type User = { id: string; name: string; email: string; createdAt: Date };

type CreateUserInput = Omit<User, "id" | "createdAt">; // { name, email }
type UserUpdate     = Partial<User>;                    // every field optional
type UserSummary    = Pick<User, "id" | "name">;        // { id, name }
type UserCard       = Readonly<UserSummary>;            // can't mutate fields
```

**Why this matters during the audit:** the cleanest fix for a function that
takes `any` is often "it actually takes `Partial<Foo>` because not all fields
are guaranteed." Look for object-spread patterns (`{ ...defaults, ...input }`)
— those almost always want `Partial`.

A common anti-pattern: declaring a separate `CreateUserInput`, `UpdateUserInput`,
`UserSummary` etc. by hand instead of using utility types. When they diverge,
bugs follow. Replacing hand-rolled duplicates with utility types is a
legitimate type-safety improvement.

## 5. Type guards — narrowing `unknown` safely

`unknown` is the safe version of `any` — you can't do anything with it
until you've narrowed it. Type guards are how:

```ts
type Issue = { type: "issue"; status: string };

function isIssue(x: unknown): x is Issue {
  return typeof x === "object"
      && x !== null
      && "type" in x
      && (x as { type: unknown }).type === "issue";
}

function handle(payload: unknown) {
  if (isIssue(payload)) {
    payload.status; // safely typed
  }
}
```

The `x is Issue` return type is the magic — it tells the compiler "if this
returns true, treat x as Issue going forward."

**Stronger alternative: schema validators.** Zod, Valibot, and similar
libraries take a schema and produce *both* a runtime validator *and* a
TypeScript type. If the codebase uses one already, the fix for a
hand-rolled type guard is often "use the existing schema." If it doesn't,
introducing one at API boundaries (parsing request bodies, parsing third-party
responses) is a legitimate type-safety improvement.

## 6. `as` and `!` — what the audit is counting

The audit counts type assertions (`as`) and non-null assertions (`!`) as
violations. Both *override* the compiler:

- `value as Foo` says "trust me, this is Foo." No runtime check.
- `value!` says "trust me, this is not null/undefined." No runtime check.

These are *sometimes* the right tool — e.g., when you have a runtime
invariant the compiler can't see — but most uses in real codebases are
laziness. Replace with a type guard plus a real check.

**`as const`** is a different beast — it narrows a value to its literal
type. Not a violation. Counted differently.

```ts
const colors = ["red", "green", "blue"] as const;
// colors is readonly ["red", "green", "blue"], not string[]
```

## 7. `@ts-ignore` vs `@ts-expect-error`

Both suppress the next line's type errors. The difference:

- `@ts-ignore` — silently suppresses. If the underlying code becomes
  type-correct, the directive stays, eventually rots.
- `@ts-expect-error` — suppresses *and asserts that there is an error to
  suppress*. If the error goes away, the directive errors instead. Auto-rots
  in the right direction.

**Audit move:** every `@ts-ignore` you can convert to `@ts-expect-error`
without changing behavior is a type-safety improvement, full stop. It costs
nothing and turns a silent escape hatch into a self-cleaning one.

## 8. Implicit `any` from missing return types

`strict` doesn't require explicit return types. A function can have its
return inferred as `any` when it transitively touches an `any`. Counting
*implicit* `any` is harder than counting explicit ones — `tsc --noEmit`
with `noImplicitAny` (part of `strict`) will flag them.

**Audit move:** the brief includes "implicit `any` from missing return
types" in the type-safety scope. Run `tsc --noEmit` and grep the output for
`implicitly has an 'any' type` to count separately from the explicit ones.

## 9. The exhaustiveness pattern — why it matters here

Repeat from §3 because it's so important in this codebase: when you add a
new `document_type`, the compiler should refuse to let you forget any of the
places that switch on it. The `never`-based exhaustiveness check is the
cheapest way to make the type system enforce this. Look for it. If it's
missing, *adding it* is a high-leverage audit improvement — it doesn't
remove any `any`s, but it prevents whole classes of future bugs and is the
kind of fix the rubric's "technical depth" criterion rewards.

## Quick reference — where to look in Ship

| To find an example of... | Look in |
|---|---|
| Discriminated union over document types | `shared/src/types/` |
| Generic API client | `web/src/services/` or the OpenAPI client |
| Utility types in repository layer | `api/src/routes/` (Pick/Omit for request DTOs) |
| Type guard | grep for `: x is ` across `api/src` and `web/src` |
| `as` assertion | `rg "\\bas [A-Z]" --type ts` |
| `!` non-null | `rg "[^!=]![^=]" --type ts` (noisy — refine) |
| `@ts-ignore` / `@ts-expect-error` | `rg "@ts-(ignore\|expect-error)"` |

## Cross-references

- The `document_type` discriminator in TypeScript mirrors the SQL column —
  see `unified-document-model.md`.
- Request/response DTOs at the API boundary live in `api/src/types/` and
  `shared/src/types/`. Hand-rolled vs OpenAPI-generated is a frequent source
  of duplication — see `request-flow-and-auth.md` §DTO Layer.
