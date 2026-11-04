<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- All dashboard data flows through `src/lib/ecovision/store.tsx` (EcoProvider): demo dataset when `VITE_ECOVISION_API_URL` is unset, REST + SSE from the FastAPI backend otherwise — pages never fetch directly so demo/live switching stays in one place.
- `/dashboard` layout is `ssr: false` because data and timestamps are locale/timezone dependent and session is in localStorage.
- Leaflet is only loaded via dynamic import (`components/eco/TrapMap.tsx` behind React.lazy) because it touches `window` at import time.
- Demo data is seeded/deterministic and built lazily (never at module scope) to stay Worker-safe.
- Python backend (`backend/`) and edge agent (`edge/`) are reference code run outside Lovable; secrets live only there.
