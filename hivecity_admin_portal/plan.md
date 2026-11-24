# HIVE CITY Admin Control Centre — implementation plan

## Scope

Build a responsive, route-aware admin control centre for operating the HIVE CITY ecosystem. The first delivered slice prioritises a high-fidelity operational shell, command-centre dashboard, HIVE PLAY operations, and representative management pages for people, activities, commerce, content, support and administration. Preview data is explicitly labeled until the existing backend has real domain tables and API contracts.

## Implementation approach

- React + TypeScript frontend in `client/src`, using the starter’s existing Vite, Tailwind, Radix and Recharts dependencies.
- Use a single route-aware application shell with wouter-compatible paths and a declarative navigation model so every sidebar destination is reachable.
- Create reusable UI primitives in the page layer for KPI cards, status pills, data tables, charts, modal workflows, search/filter controls and empty/preview states.
- Keep domain values in typed local preview data structures. Do not present them as verified production statistics; surface `Preview data` and `demo telemetry` labels in the UI.
- Preserve the existing Express/tRPC/Drizzle stack. No new schema is introduced in this visual implementation slice; backend-ready seam points remain available for later feature routers and permission checks.
- Provide a single light-only visual system through the existing ThemeContext, with no user-facing dark-mode state or toggle.
- Add `/manus-routes.json` for all implemented top-level routes.

## Design direction

### Design movement
- **Tactical operations console** — 0.06
- **Civic data atelier** — 0.04
- **Editorial commerce cockpit** — 0.03

Chosen: **Tactical operations console**.

### Core principles
1. Make operational status scannable in under five seconds.
2. Pair high-contrast numeric hierarchy with restrained information density.
3. Use game-operations cues as functional structure, not decoration.
4. Keep every action reversible, labeled and permission-ready.

### Color philosophy
Burgundy and stone create a composed, editorial operations palette: burgundy carries brand emphasis, active navigation and important actions; muted rose and clay distinguish supporting series and attention states; warm stone keeps the work surface calm. The single light system uses `#F5F1EF`, `#FFFFFF`, `#803F4C`, `#C28B70`, `#30272A`, `#817579` and `#E6DCD9`. The system avoids neon, excessive gradients and decorative glow.

### Layout paradigm
A persistent command rail anchors the left edge. The workspace is asymmetrical: wide analytics spans sit beside narrow operational feeds, with tactical map panels breaking the card rhythm. Page modules use generous gutters and visible section labels rather than a uniform card wall.

### Signature elements
- Hexagonal logomark and compact `HIVE // OPS` wordmark.
- Fine map-grid linework and restrained signal-dot accents in tactical panels.
- Clear data-first composition: strong headlines, purposeful buttons and quiet separators instead of decorative dashboard chrome.

### Interaction philosophy
Controls should feel like a dispatch console: quick actions are obvious, filters stay close to the data they affect, and every mutation provides immediate feedback. Search, sidebar collapse, theme switch, dialogs and drawers are functional in the first slice.

### Animation
Use 160–240ms easing for panels, drawer transitions, active states and hover lifts. Charts enter with a short opacity/translate reveal. Respect `prefers-reduced-motion` by removing transforms and long transitions.

### Typography system
Inter is used for all UI and metrics. Headlines use a heavier weight and tight tracking; operational labels use 10–11px uppercase text with deliberate letter spacing. Financial and statistical values use tabular numerals and never use ambiguous shorthand.

### Brand essence
A real-time operating console for turning cities into safer, more social movement experiences. Personality: precise, energetic, trusted.

### Brand voice
Headlines are direct and situational: “Command centre” and “Live arenas need attention.” CTAs are action-first: “Create event”, “Review queue”, “Open match”.

### Wordmark & logo
The mark is a compact honeycomb/hex cell with a signal notch, paired with `HIVE // OPS` rather than a generic typed wordmark.

### Signature brand color
Primary Burgundy `#803F4C` in light mode, paired with `#C27C8C` in dark mode and clay accent `#C28B70`.

## Project structure

- `client/src/App.tsx` — route-aware shell, navigation, page compositions and interactions.
- `client/src/index.css` — theme tokens, layout primitives, charts, tactical map and responsive rules.
- `client/public/manus-routes.json` — declared route set for Preview and publication.
- `server/routers.ts` / `drizzle/schema.ts` — unchanged in this slice; reserved for backend-backed domain modules.

## Backend status

The starter backend currently exposes only authentication/system routes and a `users` table. The delivered UI therefore uses clearly labeled preview telemetry. Next backend phase should add domain tables and protected procedures for users, events, bookings, products/orders, moderation, HIVE PLAY matches and audit logs before production rollout.


## Complete creative redesign — athletic editorial direction

The command centre now leads with a single featured performance story rather than a repeated KPI grid. A restrained deep-wine-to-burgundy gradient carries the hero performance area, with a compact signal rail for new users, attendance, revenue and tickets. Growth analytics gets the largest canvas, revenue is separated into its own visualisation, and the lower dashboard is composed around upcoming events, recent registrations, recent orders, live HIVE PLAY operations, activity stream, movement heatmap and dispatch actions.

The visual system now uses the approved light-only palette: `#F7F1ED`, `#FFFFFF`, `#F0E7E3`, `#282326`, `#797074`, `#E7DAD7`, `#70283C`, `#431725`, `#B96F7D`, `#E8B9A7` and `#D67C4D`. Gradients are limited to the featured performance area and purposeful data treatments. Existing routes, search, filters, drawers, quick actions, charts and Preview data seams remain intact.
