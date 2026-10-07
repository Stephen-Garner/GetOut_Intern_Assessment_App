# Beacon — GetOut Activation Command Center

## What This Project Is
An internal analytics dashboard for GetOut, a family entertainment membership company.
Members pay an annual fee for access to 2,000+ venues. The core business problem:
members who visit fewer than 4 venues per year don't renew.

## Tech Stack
- Frontend: React 18 + Vite + Tailwind CSS + Recharts + Lucide React
- Backend: Express.js + SQLite (better-sqlite3)
- Desktop: Electron with auto-update via GitHub Releases
- AI: Claude Code integration via subprocess

## Key Concepts
- **Segments**: Ghost (0 visits, 30+ days), One-and-Done (1 visit, inactive 45+ days),
  Approaching Threshold (2-3 visits), In the Zone (4-10 visits), Power User (11+), New Member (<30 days)
- **Health Score**: 0-100 composite score predicting renewal likelihood
  (visit frequency 40%, recency 30%, utilization 20%, renewal proximity 10%)
- **Activation threshold**: 4 venue visits is the inflection point for renewal

## Project Structure
- src/widgets/core/ — Pre-built dashboard widgets
- src/widgets/custom/ — AI-generated widgets (registry.json tracks them)
- server/routes/ — Express API routes
- server/segmentation.js — Segment assignment and health score calculation
- server/mapping.js — Column auto-mapping with synonym dictionary
- electron/ — Electron main process and preload

## When Creating Widgets
- Use Recharts for charts, Tailwind for styling, Lucide for icons
- Fetch data from /api/data/* endpoints only
- Handle loading, empty, and error states
- Use CSS variables for theme compatibility (var(--text-primary), var(--bg-secondary), etc.)
- Export as default function component
- Keep under 10KB
- No external fetches, no localStorage, no cookies

## Data Schema (Canonical Fields)
Members: member_id, first_name, last_name, email, market, zip_code,
purchase_date, renewal_date, acquisition_channel, total_visits,
last_visit_date, plan_tier, plan_price, _segment, _health_score
