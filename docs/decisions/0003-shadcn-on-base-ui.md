# 0003. Build Synapse's UI from shadcn components on Base UI

Date: 2026-11-24 · Status: Accepted · Issue: #4

## Context

Every Phase 1 issue after 1.1 adds forms, dialogs, popovers, or a table: the Add flow (1.4),
tag autocomplete (1.6), the edge picker (1.7), the consumption form (1.8), confirmations for
merge and delete, and the Library (1.14). They all need accessible primitives with keyboard
support and focus management, styled with Tailwind 4 in light and dark themes (phase proposal
§7). finance-stack, built on the same stack under the same process, uses shadcn components on
`@base-ui/react`, with `class-variance-authority`, `tailwind-merge`, `lucide-react`, and
`sonner` (`finance-stack/app/package.json:29-48`), and its CSP already accounts for sonner's
injected styles (`finance-stack/app/lib/security/csp.ts:36-57`).

## Decision

Synapse builds its UI from shadcn components on Base UI. The shadcn CLI copies each component
into `app/components/ui/`, where it's owned and edited like any other code. Issues add
components as they need them. 1.1 (#4) adds `button` and `sonner`, and 1.1.1 (#44) adds
`input` and `label`.

## Consequences

- Components, patterns, and fixes carry over from finance-stack.
- Dialogs, popovers, comboboxes, and menus come with keyboard and focus handling, which the
  Phase 1 forms and Atlas panel rely on.
- The components are copied source, so upstream fixes don't arrive through Dependabot. Base UI
  itself, and the helper packages, do.
- `style-src` keeps `'unsafe-inline'` while sonner injects a `<style>` with no nonce, as in
  finance-stack.

## Alternatives considered

- **Plain Tailwind and hand-written components:** no dependency, but every dialog, popover, and
  combobox would need its own focus trap and keyboard handling, and the forms in 1.3 to 1.8
  would each reinvent them.
- **shadcn on Radix UI:** the long-standing default, but finance-stack uses Base UI, and two
  primitive libraries across the two repositories would stop components and fixes carrying over.
- **A styled kit such as Mantine or MUI:** complete, but its own theming and CSS-in-JS work
  against Tailwind 4, and several need inline styles or nonces of their own under the CSP.
