---
name: software-design
description: A named-diagnostics checklist derived from Ousterhout's *A Philosophy of Software Design*, for judging whether a design is deep or shallow. Use when designing or reviewing any module, service, workflow, abstraction, or data model — not as a restatement of general software-engineering advice.
---

Complexity is what a reader experiences in the moment. It is not a function of size or feature count. It accumulates from many small decisions, and each decision is defensible alone. Two counters exist: **eliminate** (simplify) and **encapsulate** (deep modules, information hiding). Every diagnostic below comes from those two.

Name the flag out loud in review or in a design doc. The name is half the diagnosis. cf0 bans comments in source (`no-comments` in `base.rules.yaml`, zero tolerance). When a diagnostic below points at "write a comment", the cf0 fix is different. Put the information in a name, a type, a narrowing guard, or the feature's `feature-map.md`. See Comments, below.

## The 14 red flags

| # | Flag | What it looks like |
|---|------|--------------------|
| 1 | **Shallow Module** | Interface complexity ≈ implementation complexity. The wrapper costs more to learn than it saves. |
| 2 | **Information Leakage** | Two or more modules encode the same design decision. This is the master red flag. When you see it, merge the modules, or move the shared knowledge into one module with a simple interface. |
| 3 | **Temporal Decomposition** | Execution order ("read, then parse, then write") divides the modules, not knowledge. The same knowledge then lives in many stages. |
| 4 | **Overexposure** | The common-path API forces users to learn features that they rarely use. |
| 5 | **Pass-Through Method** | A method that only forwards args to another method with the same signature. |
| 6 | **Repetition** | Non-trivial code occurs more than once. An abstraction is missing. |
| 7 | **Special-General Mixture** | Special-purpose code sits inside a general-purpose mechanism and leaks the use case into it. |
| 8 | **Conjoined Methods** | Two methods that you cannot understand without reading both. |
| 9 | **Comment Repeats Code** | A comment that a reader could write without understanding the code. It often reuses the name of the entity. In cf0 this means that the name does too little work. |
| 10 | **Implementation Contaminates Interface** | The interface description tells how, not what. It leaks internal data structures, RPC names or private constants. |
| 11 | **Vague Name** | `count`, `result`, `time`, `data`. Each is broad enough to mean many things. |
| 12 | **Hard to Pick Name** | If you cannot name it cleanly, the concept is muddled. Often it is two things in one. |
| 13 | **Hard to Describe** | If a complete and simple one-sentence description is hard to write, the design is bad. This is the master diagnostic. |
| 14 | **Nonobvious Code** | A first-time reader cannot understand it on a quick read. |

## Diagnostic vocabulary

Three symptoms, worst first:

- **Unknown unknowns.** Readers cannot tell what they must know. The only fix is to read everything, and that does not scale.
- **Cognitive load.** Readers must hold a lot in their head to change something safely.
- **Change amplification.** A simple change touches many places.

Two causes:

- **Dependencies.** Code that you cannot understand or change in isolation. Make the remaining dependencies explicit and compiler-checked, not convention-checked.
- **Obscurity.** Important information is not visible: generic names, undocumented invariants, side-table lookups.

Dependencies cause change amplification and cognitive load. Obscurity causes unknown unknowns and cognitive load.

## Applying it

**Deep vs. shallow.** The benefit of a module is its functionality. Its cost is its interface. Length is rarely a reason to split something. A long function with a simple signature and clear blocks is deep. Many small shallow wrappers add their interfaces into system-wide complexity ("classitis"). That is worse than one deep module.

`private` does not hide anything by itself. The question is whether the information escapes the module, not whether it has an access modifier. Watch for **back-door leakage**: modules share knowledge that appears in no interface. It is more dangerous than interface leakage because nobody can see it.

**General-purpose beats special-purpose**, even with one caller today. It isolates the concept of the caller from the concept of the module. Ask these questions:

- What is the simplest interface that covers current needs?
- In how many situations will this be used? One situation is a red flag.
- Is it easy to use, or is there glue at every call site?

**Pull complexity downward.** Most modules have more users than developers. So the module absorbs the complexity that the caller should not carry. Before you export a configuration parameter, ask a question. Can the caller find a better value than the code can? If not, compute the value. Do not expose a knob.

**Layering.** When adjacent layers expose similar concepts, you have one of two problems:

- A pass-through method. Fix: expose the lower layer directly, redistribute, or merge.
- A pass-through variable. Fix: use a context object. Do not add another parameter that goes through every layer that does not use it.

Before you add a decorator, ask where the functionality belongs: in the underlying class, the call site, an existing decorator, or a stand-alone class.

**Errors**, in order of preference:

1. Define the error out of existence. Redesign the operation so that the error is a normal case.
2. Mask the error at a low level, so callers see a reliable interface.
3. Aggregate many handlers into one, high in the call chain.
4. Crash, for conditions that are truly unrecoverable.

The same logic applies to special cases in general. Design them out. Do not branch on their existence. "Throwing catches bugs" is the wrong tradeoff. A simpler API with fewer error paths produces fewer bugs overall than a defensive API full of error paths. Do not define an error away when the caller needs the information to act.

## Comments

Here, Ousterhout's comment advice is a design test, not something to write. cf0 bans comments in source. When a diagnostic above points at a comment, apply these rules:

- **Hard to Describe** (the master diagnostic) still applies. If you cannot state the interface of a module in one complete, simple sentence, the design is bad. Write that sentence while you design. Then put what it says into a name, a type, or the feature's `feature-map.md`. Never put it into a comment.
- **Precision** (units, boundary inclusivity, null semantics, invariants) belongs in branded types, literal unions, and narrowing guards that the compiler checks.
- **Intuition** belongs in names and structure. If a block needs a sentence before a reader understands it, extract it into a function. The name of that function is the sentence.
- Durable decisions go in `docs/decisions/`. Product knowledge goes in the feature's `feature-map.md`. Neither belongs in a commit message or a comment.

## Names

A name has two qualities:

- **Precise.** A reader who sees the name in isolation can guess what it refers to. `count` of what? `numTasks` is better.
- **Consistent.** One name for each kind of thing. Use it everywhere for that purpose. Never reuse it for another purpose.

The **Hard to Pick Name** diagnostic: if you cannot name something cleanly, the concept is probably muddled. Often it is secretly two things. Split it, and each part gets a name that comes naturally. Name length should scale with the distance between declaration and use.

## Changing existing code

Leave the design as it would be if you knew about this change from the start. Refactoring is part of the change, not a separate step. "Smallest possible change" is tactical, and it produces incremental complexity. When a deadline forces a quick fix, do one of these:

- Find an alternative that is nearly as clean and still fits.
- Schedule the proper refactor immediately after.

## Consistency

This applies to names, style, interfaces with multiple implementations and invariants:

- Document them where developers will see them.
- Enforce them with a mechanical check where possible.
- Match local style before you introduce a new style ("when in Rome").

Consistency means that similar things are done similarly *and* dissimilar things are done differently. If you force dissimilar things into the same shape, you produce false confidence. False confidence is worse than inconsistency.

## Obvious code

The test: a reader can read the code quickly without much thought, and the first guess about its behavior is right. Three ways get you there, best first:

1. **Reduce the information needed** (better abstraction, fewer special cases).
2. **Reuse information that readers already have** (follow conventions).
3. **Present what is needed** (precise names, precise types).

Three things make code less obvious: event-driven control flow, generic containers (`Pair<X,Y>`), and a declared type that differs from the allocated type. The fixes:

- Name the handler for when it fires.
- Define a small named type instead of a generic pair.
- Match the declared type to the allocated type.

## Performance

Clean code is usually faster. Deep modules mean fewer layer crossings. When you define special cases away, you also remove the conditionals that check for them. When you must optimize, follow these steps:

1. Measure first. Intuition about performance is unreliable.
2. Find the critical path.
3. Design back from the ideal minimal-cost version.
4. Measure again. Remove any change that did not measurably help, unless it also simplified the design.

## Code review checklist

1. Is it obvious to a first-time reader? If the reviewer is confused, fix the code, not the reviewer.
2. Are the interfaces deep? Does the signature alone carry enough to use the module without reading the body?
3. Is the same knowledge encoded in two places?
4. Are there pass-through methods, pass-through variables, or shallow decorators between adjacent layers?
5. Is anything special-cased that you can normalize away?
6. Do exceptions earn their keep? Or can you redefine the operation so that there is no error to throw?
7. Does a configuration parameter push away a decision that the code can make itself?
8. Are names precise and consistent? Does any name do two jobs?
9. Can only a comment explain something? Move it into a name, a type, or a `base.rules.yaml` rule.
10. Did the change leave the design as good as it would be with the new requirement known from the start?
