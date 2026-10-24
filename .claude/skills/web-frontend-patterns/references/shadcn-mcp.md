# Shadcn UI & the shadcn MCP

The project uses Shadcn UI (style **new-york**, base color **neutral**, icon library
**lucide**, RSC on). Config: `components.json`. Primitives live in `src/components/ui/`.

The **shadcn MCP** is wired up in the project (`.mcp.json` runs `npx shadcn@latest mcp`).
Use it instead of guessing component names or copy-pasting from memory.

## Golden rules

1. **Never hand-edit `src/components/ui/`.** Those files are generated. To change behavior,
   wrap the primitive (e.g. `components/forms/InputForm.tsx` wraps `ui/input`) or add via CLI.
2. **Search before you build.** Many UI needs already exist as a shadcn component or a
   registry example: find it via the MCP before writing one from scratch.
3. **Install via CLI**, then wrap/compose. Don't paste component source by hand.

## MCP tools (call via ToolSearch → `mcp__shadcn__*`)

| Tool | Use for |
|------|---------|
| `get_project_registries` | List configured registries (this project: `@shadcn`). |
| `list_items_in_registries` | Browse everything available in a registry. |
| `search_items_in_registries` | Find a component by need ("date picker", "data table"). |
| `view_items_in_registries` | Inspect a component's files/props before installing. |
| `get_item_examples_from_registries` | Pull real usage examples to copy patterns from. |
| `get_add_command_for_items` | Get the exact `npx shadcn add ...` command. |
| `get_audit_checklist` | Post-install checklist (run after adding components). |

## Workflow for adding a component

1. `search_items_in_registries` (or `list_items_in_registries`) to find the right item.
2. `view_items_in_registries` / `get_item_examples_from_registries` to confirm fit and see
   correct usage.
3. `get_add_command_for_items` → run it with **pnpm** in the frontend root:
   `pnpm dlx shadcn@latest add <item>` (installs into `src/components/ui/`).
4. If it needs react-hook-form behavior or app-specific defaults, wrap it in
   `components/forms/` or `components/shared/`: don't bake logic into the `ui/` file.
5. Run the audit (see below), then `pnpm type-check` and `pnpm lint`.

## Post-add audit checklist (from the MCP)

- Imports correct (named vs default).
- If using `next/image`, `images.remotePatterns` in `next.config` is configured.
- All dependencies installed.
- No lint errors/warnings (`pnpm lint`).
- No TypeScript errors (`pnpm type-check`).

## Design decisions are a separate concern

The MCP sources *components*. For deciding *which* component, the style, color palette, font
pairing, layout, or interaction quality, use the **`ui-ux-pro-max`** skill (component
selection, 161 product types, UX guidelines) and the **`impeccable`** skill (visual polish,
hierarchy, motion, accessibility, empty/error states). This skill then wires the result into
our feature structure and forms.
