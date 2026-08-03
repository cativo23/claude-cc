# Lumira Roadmap

> Última revisión: 2026-08-03 — post release v1.15.1

## Estrategia de release

Agrupar varios cambios por versión en vez de un release por item. Los items chicos/medianos (features de bajo ancho, fixes, calibraciones, docs) se bundlean en un mismo minor; los big bets van solos en su propio minor. Menos releases, menos overhead de pipeline, changelog más legible.

---

## Próximo

### Corrimiento visual cerebrito (línea 2) vs versión (línea 1) en Kitty + CommitMono Nerd Font Mono
Con `line1Align: "packed"` (versión anclada al borde derecho real) y el thinking badge activo en línea 2, se ve un corrimiento de pocos píxeles entre el final de `v2.1.205` y el cerebrito — visible solo en el render completo real (`lumira` vía pipe), no reproducido en pruebas aisladas. Ya descartado como causa: ancho del glyph `U+F09D1` solo (alinea perfecto), el wrapper OSC8 hyperlink de `version` (idéntico a texto plano), y los caracteres de bloque `█`/`░` de la barra de contexto (alinean perfecto). El bug — si existe — solo se manifiesta con la combinación completa de escapes ANSI/OSC8 apilados en la línea real; no se pudo aislar más sin otra sesión de diagnóstico. Cosmético, no bloquea nada. Retomar con captura+bytes exactos del render real.

---

## Distribución

- **Blog post** — ✅ publicado (`blog.cativo.dev/lumira-statusline-for-claude-code/`).
- **Reddit** — ✅ publicado.
- **Hacker News** — sin confirmar si salió. Único canal pendiente de los 3 planeados.
- **awesome-claude-code #1880** — `validation-passed`, abierto desde 2026-05-24 (~10 semanas). Cola manual/editorial de un maintainer externo, no accionable desde acá salvo esperar o sumar stars.

---

## HOLD

### #83 — configurable mergeGroups + elementOrder (Phase 2)
Layout avanzado: reordenar y agrupar segmentos arbitrariamente. Scope grande. En hold hasta que haya demanda externa.

---

## Completado recientemente

- **v1.16.0** (en curso) — bundle chico: `refreshInterval` support (re-corre `statusLine` cada N seg configurables vía config.json → transcrito a `settings.json`; nunca aplica a `subagentStatusLine`, el panel de subagentes ya se actualiza por eventos de tokens); `worktreeBreadcrumb` agrupado junto a branch+repo en `line1.ts`/`powerline-line1.ts` (prioridad powerline subida de 22.5 a 62, extensión de PR #185); `footerLinksRegexes` documentado en README (feature nativa de CC, sin código). TDD, 1350/1350 tests verdes.
- **v1.15.1** — docs sync: README "What's new" banner (frozen desde v1.9.0) actualizado, skill catalog de `line1Align` documentado. Sin cambios de runtime.
- **v1.15.0** — `line1Align: "justified" | "packed"` (default `justified`, sin romper nada); en `packed` todo se empaqueta a la izquierda y solo `version` queda anclada al borde real. Reordenamiento `branch → repo → directory` en línea 1 (#185). Fix de `displayWidth`: rango Box Drawing (`U+2500–U+257F`) contaba como wide cuando es single-cell — desalineaba línea 1 vs línea 2 con separadores.
- **v1.14.0** — #176 `subagentStatusLine` renderer (cerrada con referencia a PR #182): `lumira subagent` estiliza cada fila del agent panel (glyph de estado + identificador + tokens), con tema e iconos. Filas identificadas por `description` — CC manda todos los subagentes de Task como `local_agent` sin `name` (verificado capturando el payload real). Registro opt-in en el installer (no pisa hooks ajenos). (PR #182)
- **v1.13.0** — bundle "workspace metadata + fixes": `workspace.repo` segment (hyperlink al repo, reemplaza `git remote get-url`), auto-compact threshold calibrado a 84, `git_worktree` fallback cuando `worktree.name` está ausente, floor de Nerd Fonts documentado (PR #181)
- **v1.12.2** — thinking badge visible de verdad: glyph nerd `U+F09D1` (era `nf-md-brain` U+F1824, tenue) + color magenta (era dim); lightning nerd `U+F140B` (era ⚡ emoji en modo nerd) (PR #180)
- **v1.12.1** — installer migra el path stale de plugin-cache al binario bare `lumira` (PR #179)
- **v1.12.0** — `thinking.enabled` indicator: badge en line2/powerline cuando el extended thinking está activo (PR #178)
- **v1.11.0** — PR widget: number + review_state + OSC 8 hyperlink (classic y powerline), security-validated
- **v1.10.0** — GSD plan progress + resume indicator; comparison table en README
- **v1.9.x** — plugin marketplace, `--help`/`--version` flags, **stats dedup por `message.id`** (PR #168 — arregla la inflación 2-4× de `lumira stats`; el backlog lo listaba como pendiente por error)
- **v1.8.x** — worktree breadcrumb, added-dirs badge, API latency widget, custom commands
- **v1.7.x** — compaction count, context auto-compact threshold visual
- **v1.0.x** — rate limits como battery glyph (nerd), 7d quota projection
