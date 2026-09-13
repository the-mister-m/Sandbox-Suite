MAP — Open Design repo (from filetree dumps)

Source: `/Users/moth3rship/Desktop/AI Design/Workflows/Open Design Map/` (dumps of `/Users/moth3rship/Downloads/open-design-main`). Recon only, no ranking.

# REPO SHAPE

Root: `/Users/moth3rship/Downloads/open-design-main` — pnpm monorepo, package name `open-design`, v0.22.1, Apache-2.0. `pnpm-workspace.yaml` workspaces: `packages/*`, `apps/*`, `tools/*`, `shells/*`, `e2e`. Root README identifies it as "OpenDesign: the open-source Claude Design alternative" — a local-first desktop app (macOS/Windows) that detects an installed coding-agent CLI, runs design skills + design systems, streams generated artifacts (web/desktop/mobile prototypes, dashboards, decks, images, video, "HyperFrames" motion graphics) into a sandboxed iframe preview, exports to HTML/PDF/PPTX/MP4. README claims support for "26 distinct local CLI executables" — matches `apps/daemon/src/runtimes/defs/` file count (below).

Top-level folders with file counts (prefix-anchored count of paths under each, from `open-design-tree.txt`):

| folder | files | what it is |
|---|---|---|
| design-systems/ | 4772 | ~154 brand/style token packs, one folder each |
| apps/ | 3960 | the actual application code: web, desktop, daemon, packaged, closure |
| plugins/ | 2476 | plugin/skill marketplace (_official, community, registry, spec) |
| design-templates/ | 949 | ~115 pre-built artifact templates (decks, dashboards, landing pages, html-ppt-* themes) |
| skills/ | 566 | 165 Claude-Skill-style folders (SKILL.md + assets/references/scripts) |
| packages/ | 499 | shared TS packages (17 workspaces) |
| tools/ | 361 | dev/pack/release/serve tooling |
| docs/ | 270 | project docs, changelog, ADRs, plans, i18n |
| e2e/ | 259 | Playwright/Vitest e2e harness |
| .github/ | 137 | CI workflows, actions, release scripts |
| specs/ | 126 | spec-driven-dev history (change/, current/, live-artifacts) |
| prompt-templates/ | 110 | image-generation prompt JSON library |
| clipper/ | 75 | browser extension (manifest.json, 21 locales) |
| shells/ | 52 | `terminal` shell distribution (installer/updater contracts) |
| scripts/ | 55 | repo-wide maintenance/migration scripts |
| mocks/ | 50 | mock CLI binaries + recordings for testing runtime adapters |
| assets/ | 46 | community pets, device frames, prompt-template images |
| .claude/ | 31 | one skill (`od-contribute`) + one command |
| deploy/ | 30 | docker/aws/azure deploy configs |
| charts/ | 15 | Helm chart (`open-design`) |
| craft/ | 13 | design-craft guideline markdown (color, typography, a11y, motion) |
| templates/ | 12 | live-artifact + deck HTML templates |
| .vaunt/ | 7 | icon set + config.yaml (unclear product) |
| figma-plugin/ | 5 | Figma plugin (code.js, manifest.json, IR.md) |
| .claude-plugin/ | 1 | marketplace.json |
| .looper-attachments/ | 1 | one PNG |
| story/ | 2 | STORY.md / STORY.zh-CN.md |
| root files | 52 | AGENTS.md, CLAUDE.md, README.md, package.json, pnpm-workspace.yaml, mise.toml, vercel.json, CHANGELOG.md, etc. |

Downloads files opened to confirm shape: `README.md` (head), `package.json`, `pnpm-workspace.yaml`, `ls` of repo root. Listed again in receipt.

# HARNESS INVENTORY

Repo has no top-level "harnesses" folder. The literal harness concept lives in `apps/daemon/src/runtimes/defs/` — one file per coding-agent CLI the daemon can drive (the daemon is the local sidecar process; `apps/daemon/bin/od.mjs` is the `od` binary). `shared.ts` in the same folder is common code, not a harness. `mocks/bin/` ships mock binaries for testing runtime detection (superset: adds `gemini`, `grok`, `vela`, `kiro-cli`, `opencode-cli`, `vibe-acp` as name variants, not separate harnesses).

| harness | path | ships | files |
|---|---|---|---|
| aider | apps/daemon/src/runtimes/defs/aider.ts | runtime def | 1 |
| amp | apps/daemon/src/runtimes/defs/amp.ts | runtime def | 1 |
| amr | apps/daemon/src/runtimes/defs/amr.ts | runtime def | 1 |
| antigravity | apps/daemon/src/runtimes/defs/antigravity.ts | runtime def | 1 |
| atomcode | apps/daemon/src/runtimes/defs/atomcode.ts | runtime def | 1 |
| byok-opencode | apps/daemon/src/runtimes/defs/byok-opencode.ts | runtime def | 1 |
| claude | apps/daemon/src/runtimes/defs/claude.ts | runtime def | 1 |
| codebuddy | apps/daemon/src/runtimes/defs/codebuddy.ts | runtime def | 1 |
| codex | apps/daemon/src/runtimes/defs/codex.ts | runtime def | 1 |
| copilot | apps/daemon/src/runtimes/defs/copilot.ts | runtime def | 1 |
| cursor-agent | apps/daemon/src/runtimes/defs/cursor-agent.ts | runtime def | 1 |
| deepseek | apps/daemon/src/runtimes/defs/deepseek.ts | runtime def | 1 |
| deepseek-harness | apps/daemon/src/runtimes/defs/deepseek-harness.ts | runtime def (`dsh` protocol) | 1 |
| devin | apps/daemon/src/runtimes/defs/devin.ts | runtime def | 1 |
| grok-build | apps/daemon/src/runtimes/defs/grok-build.ts | runtime def | 1 |
| hermes | apps/daemon/src/runtimes/defs/hermes.ts | runtime def | 1 |
| kilo | apps/daemon/src/runtimes/defs/kilo.ts | runtime def | 1 |
| kimi | apps/daemon/src/runtimes/defs/kimi.ts | runtime def | 1 |
| kiro | apps/daemon/src/runtimes/defs/kiro.ts | runtime def | 1 |
| mimo | apps/daemon/src/runtimes/defs/mimo.ts | runtime def | 1 |
| opencode | apps/daemon/src/runtimes/defs/opencode.ts | runtime def | 1 |
| pi | apps/daemon/src/runtimes/defs/pi.ts | runtime def | 1 |
| qoder | apps/daemon/src/runtimes/defs/qoder.ts | runtime def | 1 |
| qwen | apps/daemon/src/runtimes/defs/qwen.ts | runtime def | 1 |
| reasonix | apps/daemon/src/runtimes/defs/reasonix.ts | runtime def | 1 |
| trae-cli | apps/daemon/src/runtimes/defs/trae-cli.ts | runtime def | 1 |
| vibe | apps/daemon/src/runtimes/defs/vibe.ts | runtime def | 1 |

27 files in the folder, 26 are harness defs (`shared.ts` excluded) — matches README's "26 distinct local CLI executables." Each harness's protocol/stream handling is spread across `apps/daemon/src/runtimes/*.ts` (e.g. `claude-stream.ts`, `codex-child-evidence.ts`, `qoder-stream.ts`, `opencode-permissions.ts`) and `apps/daemon/src/agent-protocol/{acp,codex-app-server,dsh-profile,pi-rpc,core}` (protocol adapters: ACP, Codex app-server, DeepSeek-harness profile, pi-rpc). `apps/web/public/agent-icons/` and `apps/web/public/editor-icons/` ship matching icon assets.

# SKILLS INVENTORY

`skills/` — 165 folders, each `SKILL.md` at minimum, some with `references/`, `assets/`, `scripts/`, `agents/openai.yaml`, `LICENSE`. Not tied to one harness — read by whichever coding-agent CLI the daemon has launched (harness = "any"). Separate from this: `plugins/_official/` and `plugins/community/` also ship `SKILL.md` + `open-design.json` files (marketplace-distributed skills, not counted below) and `.claude/skills/od-contribute/` (1 meta-skill for repo contribution).

| skill | harness | path | purpose (from name/files) | reads/writes (from file names) |
|---|---|---|---|---|
| 8-bit-orbit-video-template | any | skills/8-bit-orbit-video-template | video template, 8-bit orbit style | assets/template.html, example.html |
| ad-creative | any | skills/ad-creative | ad creative generation | SKILL.md only |
| after-hours-editorial-template | any | skills/after-hours-editorial-template | editorial deck/doc template | assets/template.html, checklist.md |
| agent-browser | any | skills/agent-browser | browser automation for agents | SKILL.md only |
| ai-music-album | any | skills/ai-music-album | AI music album generation | SKILL.md only |
| algorithmic-art | any | skills/algorithmic-art | generative/algorithmic art | SKILL.md only |
| apple-hig | any | skills/apple-hig | Apple Human Interface Guidelines reference | SKILL.md only |
| article-magazine | any | skills/article-magazine | magazine-style article layout | example.html/.md |
| artifacts-builder | any | skills/artifacts-builder | generic artifact builder | SKILL.md only |
| brainstorming | any | skills/brainstorming | ideation aid | SKILL.md only |
| brand-extract | any | skills/brand-extract | extract brand kit from source | templates/brand-kit.html |
| brand-guidelines | any | skills/brand-guidelines | brand guideline authoring | SKILL.md only |
| brandkit | any | skills/brandkit | brand kit generation | LICENSE, SKILL.md |
| brutalist-skill | any | skills/brutalist-skill | brutalist visual style | LICENSE, SKILL.md |
| canvas-design | any | skills/canvas-design | canvas-based design | SKILL.md only |
| card-twitter | any | skills/card-twitter | Twitter/X social card | example.html/.md |
| card-xiaohongshu | any | skills/card-xiaohongshu | Xiaohongshu social card | example.html/.md |
| chat-motion-overlay | any | skills/chat-motion-overlay | chat-bubble motion video overlay (Remotion) | assets/remotion-template (React/TS), scripts/build_chat_overlay_spec.py, avatar-library images |
| color-expert | any | skills/color-expert | color theory guidance | SKILL.md only |
| competitive-ads-extractor | any | skills/competitive-ads-extractor | competitor ad extraction | SKILL.md only |
| copywriting | any | skills/copywriting | copywriting guidance | SKILL.md only |
| creative-director | any | skills/creative-director | creative-direction persona | SKILL.md only |
| d3-visualization | any | skills/d3-visualization | D3.js chart building | SKILL.md only |
| data-report | any | skills/data-report | data report layout | example.html/.md |
| deck-guizang-editorial | any | skills/deck-guizang-editorial | deck template, editorial style | example.html/.md |
| deck-open-slide-canvas | any | skills/deck-open-slide-canvas | deck template, slide canvas | example.html/.md |
| deck-swiss-international | any | skills/deck-swiss-international | deck template, Swiss style | example.html/.md |
| design-brief | any | skills/design-brief | design brief authoring | SKILL.md only |
| design-consultation | any | skills/design-consultation | design consultation flow | SKILL.md only |
| design-md | any | skills/design-md | DESIGN.md contract authoring | SKILL.md only |
| design-review | any | skills/design-review | design review checklist | SKILL.md only |
| digits-fintech-swiss-template | any | skills/digits-fintech-swiss-template | fintech template, Swiss style | assets/template.html, checklist.md |
| doc | any | skills/doc | generic document generation | SKILL.md only |
| doc-kami-parchment | any | skills/doc-kami-parchment | doc template, parchment style | example.html/.md |
| docx | any | skills/docx | Word (.docx) export | SKILL.md only |
| domain-name-brainstormer | any | skills/domain-name-brainstormer | domain-name ideation | SKILL.md only |
| ecommerce-image-workflow | any | skills/ecommerce-image-workflow | ecommerce image pipeline | checklist.md, example.html |
| editorial-burgundy-principles-template | any | skills/editorial-burgundy-principles-template | editorial template, burgundy palette | assets/template.html, checklist.md |
| emil-design-eng | any | skills/emil-design-eng | design-engineering persona (Emil Kowalski-style) | LICENSE, SKILL.md |
| emilkowalski-motion | any | skills/emilkowalski-motion | motion-design principles | SKILL.md only |
| enhance-prompt | any | skills/enhance-prompt | prompt enhancement | SKILL.md only |
| export-download-debugging | any | skills/export-download-debugging | debug export/download failures | SKILL.md only |
| fal-3d | any | skills/fal-3d | fal.ai 3D generation | SKILL.md only |
| fal-generate | any | skills/fal-generate | fal.ai image generation | SKILL.md only |
| fal-image-edit | any | skills/fal-image-edit | fal.ai image editing | SKILL.md only |
| fal-kling-o3 | any | skills/fal-kling-o3 | fal.ai Kling O3 video model | SKILL.md only |
| fal-lip-sync | any | skills/fal-lip-sync | fal.ai lip-sync | SKILL.md only |
| fal-realtime | any | skills/fal-realtime | fal.ai realtime generation | SKILL.md only |
| fal-restore | any | skills/fal-restore | fal.ai image restoration | SKILL.md only |
| fal-train | any | skills/fal-train | fal.ai model training | SKILL.md only |
| fal-tryon | any | skills/fal-tryon | fal.ai virtual try-on | SKILL.md only |
| fal-upscale | any | skills/fal-upscale | fal.ai upscaling | SKILL.md only |
| fal-video-edit | any | skills/fal-video-edit | fal.ai video editing | SKILL.md only |
| fal-vision | any | skills/fal-vision | fal.ai vision/analysis | SKILL.md only |
| faq-page | any | skills/faq-page | FAQ page layout | example.html |
| field-notes-editorial-template | any | skills/field-notes-editorial-template | editorial template, field-notes style | assets/template.html, checklist.md |
| figma-code-connect-components | any | skills/figma-code-connect-components | Figma Code Connect | SKILL.md only |
| figma-create-design-system-rules | any | skills/figma-create-design-system-rules | Figma design-system rules authoring | SKILL.md only |
| figma-create-new-file | any | skills/figma-create-new-file | create new Figma file | SKILL.md only |
| figma-generate-design | any | skills/figma-generate-design | generate Figma design | SKILL.md only |
| figma-generate-library | any | skills/figma-generate-library | generate Figma library | SKILL.md only |
| figma-implement-design | any | skills/figma-implement-design | implement Figma design in code | SKILL.md only |
| figma-use | any | skills/figma-use | general Figma usage | SKILL.md only |
| flutter-animating-apps | any | skills/flutter-animating-apps | Flutter animation guidance | SKILL.md only |
| frame-data-chart-nyt | any | skills/frame-data-chart-nyt | motion frame, NYT-style data chart | example.html/.md |
| frame-flowchart-sticky | any | skills/frame-flowchart-sticky | motion frame, sticky-note flowchart | example.html/.md |
| frame-glitch-title | any | skills/frame-glitch-title | motion frame, glitch title card | example.html/.md |
| frame-light-leak-cinema | any | skills/frame-light-leak-cinema | motion frame, cinematic light leak | example.html/.md |
| frame-liquid-bg-hero | any | skills/frame-liquid-bg-hero | motion frame, liquid-background hero | example.html/.md |
| frame-logo-outro | any | skills/frame-logo-outro | motion frame, logo outro | example.html/.md |
| frame-macos-notification | any | skills/frame-macos-notification | motion frame, macOS notification mock | example.html/.md |
| frontend-design | any | skills/frontend-design | frontend design guidance | LICENSE.txt, SKILL.md |
| frontend-dev | any | skills/frontend-dev | frontend development guidance | SKILL.md only |
| frontend-skill | any | skills/frontend-skill | frontend general skill | SKILL.md only |
| frontend-slides | any | skills/frontend-slides | frontend-built slide decks | SKILL.md only |
| full-page-screenshot | any | skills/full-page-screenshot | full-page screenshot capture | SKILL.md only |
| gif-sticker-maker | any | skills/gif-sticker-maker | GIF sticker creation | SKILL.md only |
| gpt-tasteskill | any | skills/gpt-tasteskill | taste/aesthetic judgment (GPT-flavored) | LICENSE, SKILL.md |
| gsap-core | any | skills/gsap-core | GSAP animation core | SKILL.md only |
| gsap-frameworks | any | skills/gsap-frameworks | GSAP + framework integration | SKILL.md only |
| gsap-performance | any | skills/gsap-performance | GSAP performance tuning | SKILL.md only |
| gsap-plugins | any | skills/gsap-plugins | GSAP plugin usage | SKILL.md only |
| gsap-react | any | skills/gsap-react | GSAP + React | SKILL.md only |
| gsap-scrolltrigger | any | skills/gsap-scrolltrigger | GSAP ScrollTrigger | SKILL.md only |
| gsap-timeline | any | skills/gsap-timeline | GSAP timeline sequencing | SKILL.md only |
| gsap-utils | any | skills/gsap-utils | GSAP utility helpers | SKILL.md only |
| hand-drawn-diagrams | any | skills/hand-drawn-diagrams | hand-drawn-style diagrams | SKILL.md only |
| hatch-pet | any | skills/hatch-pet | desktop-pet sprite generation pipeline | scripts/ (compose_atlas, extract_strip_frames, render_animation_videos, package_custom_pet), references/codex-pet-contract.md |
| html-ppt-retro-quarterly-review | any | skills/html-ppt-retro-quarterly-review | HTML-PPT template, retro quarterly review | assets/template.html, checklist.md |
| image-enhancer | any | skills/image-enhancer | image enhancement | SKILL.md only |
| image-to-code-skill | any | skills/image-to-code-skill | image-to-code conversion | LICENSE, SKILL.md |
| imagegen | any | skills/imagegen | general image generation | SKILL.md only |
| imagegen-frontend-mobile | any | skills/imagegen-frontend-mobile | image generation for mobile frontend mocks | LICENSE, SKILL.md |
| imagegen-frontend-web | any | skills/imagegen-frontend-web | image generation for web frontend mocks | LICENSE, SKILL.md |
| imagen | any | skills/imagen | Google Imagen usage | SKILL.md only |
| impeccable-design-polish | any | skills/impeccable-design-polish | final design polish pass | SKILL.md only |
| library-curator | any | skills/library-curator | curating a design library | SKILL.md only |
| login-flow | any | skills/login-flow | login-flow UI pattern | checklist.md, example.html |
| marketing-psychology | any | skills/marketing-psychology | marketing psychology guidance | SKILL.md only |
| minimalist-skill | any | skills/minimalist-skill | minimalist visual style | LICENSE, SKILL.md |
| minimax-docx | any | skills/minimax-docx | MiniMax-based docx generation | SKILL.md only |
| minimax-pdf | any | skills/minimax-pdf | MiniMax-based PDF generation | SKILL.md only |
| mockup-device-3d | any | skills/mockup-device-3d | 3D device mockups | example.html/.md |
| nanobanana-ppt | any | skills/nanobanana-ppt | "Nano Banana" model PPT generation | SKILL.md only |
| od-next-media-inputs | any | skills/od-next-media-inputs | OpenDesign-next media input handling | SKILL.md only |
| output-skill | any | skills/output-skill | output formatting | LICENSE, SKILL.md |
| paywall-upgrade-cro | any | skills/paywall-upgrade-cro | paywall/upgrade CRO patterns | SKILL.md only |
| pdf | any | skills/pdf | PDF export | SKILL.md only |
| pixelbin-media | any | skills/pixelbin-media | Pixelbin media handling | SKILL.md only |
| plan-design-review | any | skills/plan-design-review | design-plan review | SKILL.md only |
| platform-design | any | skills/platform-design | platform-level design guidance | SKILL.md only |
| poster-hero | any | skills/poster-hero | poster/hero image layout | example.html/.md |
| ppt-keynote | any | skills/ppt-keynote | Keynote-style PPT | example.html/.md |
| pptx | any | skills/pptx | PPTX export | SKILL.md only |
| pptx-generator | any | skills/pptx-generator | PPTX generation | SKILL.md only |
| pptx-html-fidelity-audit | any | skills/pptx-html-fidelity-audit | audit HTML-to-PPTX fidelity | scripts/extract_pptx.py, verify_layout.py |
| pr-feedback-quality-gate | any | skills/pr-feedback-quality-gate | PR review quality gate | SKILL.md only |
| redesign-skill | any | skills/redesign-skill | redesign existing artifact | LICENSE, SKILL.md |
| reference-design-contract | any | skills/reference-design-contract | design-contract from reference | checklist.md, example.html |
| release-notes-one-pager | any | skills/release-notes-one-pager | release-notes one-pager layout | assets/template.html, layouts.md |
| remotion | any | skills/remotion | Remotion video framework usage | SKILL.md only |
| replicate | any | skills/replicate | Replicate.com model usage | SKILL.md only |
| research-decision-room | any | skills/research-decision-room | research/decision-room artifact | checklist.md, evidence-model.md |
| resume-modern | any | skills/resume-modern | modern resume layout | example.html/.md |
| review-animations | any | skills/review-animations | animation review standards | STANDARDS.md, LICENSE |
| screenshot | any | skills/screenshot | screenshot capture | SKILL.md only |
| screenshots-marketing | any | skills/screenshots-marketing | marketing screenshot generation | SKILL.md only |
| shadcn-ui | any | skills/shadcn-ui | shadcn/ui component usage | SKILL.md only |
| shader-dev | any | skills/shader-dev | shader development | SKILL.md only |
| slack-gif-creator | any | skills/slack-gif-creator | Slack GIF creation | SKILL.md only |
| slides | any | skills/slides | general slide deck | SKILL.md only |
| social-reddit-card | any | skills/social-reddit-card | Reddit social card | example.html/.md |
| social-spotify-card | any | skills/social-spotify-card | Spotify social card | example.html/.md |
| social-x-post-card | any | skills/social-x-post-card | X/Twitter post card | example.html/.md |
| soft-skill | any | skills/soft-skill | "soft" (gentle) visual style | LICENSE, SKILL.md |
| sora | any | skills/sora | OpenAI Sora video generation | SKILL.md only |
| speech | any | skills/speech | speech/audio generation | SKILL.md only |
| stitch-loop | any | skills/stitch-loop | Stitch loop workflow | SKILL.md only |
| stitch-skill | any | skills/stitch-skill | Google Stitch-based design | DESIGN.md, LICENSE |
| swiftui-design | any | skills/swiftui-design | SwiftUI design guidance | SKILL.md only |
| swiss-creative-mode-template | any | skills/swiss-creative-mode-template | Swiss-style creative template | assets/template.html, checklist.md |
| swiss-user-research-video-template | any | skills/swiss-user-research-video-template | Swiss-style research video template | assets/template.html, checklist.md |
| taste-skill | any | skills/taste-skill | aesthetic-taste judgment | LICENSE, SKILL.md |
| taste-skill-v1 | any | skills/taste-skill-v1 | aesthetic-taste judgment, earlier version | LICENSE, SKILL.md |
| theme-factory | any | skills/theme-factory | theme generation | SKILL.md only |
| threejs | any | skills/threejs | Three.js 3D rendering | SKILL.md only |
| ui-skills | any | skills/ui-skills | general UI skill bundle | SKILL.md only |
| ui-ux-pro-max | any | skills/ui-ux-pro-max | advanced UI/UX guidance | SKILL.md only |
| venice-audio-music | any | skills/venice-audio-music | Venice.ai music generation | SKILL.md only |
| venice-audio-speech | any | skills/venice-audio-speech | Venice.ai speech generation | SKILL.md only |
| venice-image-edit | any | skills/venice-image-edit | Venice.ai image editing | SKILL.md only |
| venice-image-generate | any | skills/venice-image-generate | Venice.ai image generation | SKILL.md only |
| venice-video | any | skills/venice-video | Venice.ai video generation | SKILL.md only |
| vfx-text-cursor | any | skills/vfx-text-cursor | text-cursor VFX | example.html/.md |
| video-downloader | any | skills/video-downloader | video download utility | SKILL.md only |
| video-hyperframes | any | skills/video-hyperframes | HyperFrames motion-graphics video | example.html/.md |
| web-artifacts-builder | any | skills/web-artifacts-builder | web artifact builder | SKILL.md only |
| web-clone | any | skills/web-clone | clone an existing website | scripts/ (recon-site.mjs, mirror-site.mjs, visual-diff.mjs, sourcemap-hunt.mjs), references/ (reverse-engineering.md, static-mirror.md) |
| web-design-guidelines | any | skills/web-design-guidelines | web design guideline reference | references/guidelines.md, LICENSE |
| weread-year-in-review-video-template | any | skills/weread-year-in-review-video-template | WeRead year-in-review video template | assets/template.html, checklist.md |
| wpds | any | skills/wpds | (unclear from name — WordPress design system?) | SKILL.md only |
| writing-guidelines | any | skills/writing-guidelines | writing-style guideline reference | references/guidelines.md, LICENSE |
| youtube-clipper | any | skills/youtube-clipper | YouTube clip extraction | SKILL.md only |

Plus 2 non-skill root files in `skills/`: `AGENTS.md`, `README.md`.

Separate marketplace layer (not itemized above): `plugins/_official/` (atoms/, design-systems/, examples/, image-templates/, video-templates/, scenarios/ — each entry `open-design.json` + `SKILL.md`) and `plugins/community/` (~40+ user-submitted skill packages, each with `references/provenance.json` recording source attribution). `plugins/spec/` ships the plugin-authoring spec, templates, and worked examples (`create-hyperframes-launch`, `create-prototype-dashboard`, etc.).

# AGENT MD LOCATIONS

From `agent-md-locations.txt` (22 files, read whole), grouped by harness/area:

**Repo root / CI**
- `.github/AGENTS.md`
- `AGENTS.md` (repo root)

**apps/ (the application harnesses)**
- `apps/AGENTS.md`
- `apps/closure/AGENTS.md`
- `apps/daemon/AGENTS.md`
- `apps/daemon/src/critique/AGENTS.md`
- `apps/packaged/AGENTS.md`
- `apps/web/src/components/Theater/AGENTS.md`
- `apps/web/src/components/chat/AGENTS.md`

**design-systems/**
- `design-systems/_schema/AGENTS.md`

**design-templates/**
- `design-templates/AGENTS.md`

**e2e/**
- `e2e/AGENTS.md`

**packages/**
- `packages/AGENTS.md`
- `packages/standalone/AGENTS.md`

**plugins/**
- `plugins/AGENTS.md`
- `plugins/_official/scenarios/od-next-strategy/AGENTS.md`

**shells/**
- `shells/AGENTS.md`
- `shells/terminal/AGENTS.md`

**skills/**
- `skills/AGENTS.md`

**tools/**
- `tools/AGENTS.md`
- `tools/pack/AGENTS.md`
- `tools/serve/AGENTS.md`

No AGENTS.md found under `docs/`, `specs/`, `scripts/`, `deploy/`, `charts/`, `clipper/`, `craft/`, `data/`, `mocks/`, `prompt-templates/`, `templates/`, `story/`, `.vaunt/`, `.claude-plugin/`, `.looper-attachments/`, `assets/`, or any individual `design-systems/<brand>/` folder.

# HTML EDITOR CANDIDATES

No Monaco or CodeMirror anywhere in the tree (grepped, zero hits). The repo's "editor" is a custom direct-manipulation layer over rendered HTML artifacts, plus a wireframe sketch tool. Concentrated almost entirely in `apps/web/src/components/`.

| path | what surrounding files suggest |
|---|---|
| apps/web/src/components/FileViewer.tsx | main artifact/file viewer; paired tests `FileViewer.manual-edit.test.tsx`, `FileViewer.manual-edit-history.test.tsx` — renders and edits generated HTML in place |
| apps/web/src/components/ManualEditPanel.tsx, ManualEditSelectionOverlay.module.css, ManualEditTextToolbar.module.css, ManualEditColorPicker.module.css | direct-manipulation editing overlay on a rendered artifact: selection overlay, text toolbar, color picker |
| apps/web/src/components/SketchEditor.tsx, SketchPreview.tsx, sketch-colors.ts, sketch-model.ts, SketchEnginePrewarm.tsx | wireframe/sketch drawing tool with its own color model and a prewarm step (likely a canvas/wasm engine) |
| apps/web/src/components/PreviewModal.tsx, PreviewDrawOverlay.tsx | modal preview of an artifact with a draw-annotation overlay |
| apps/web/src/components/GenUISurfaceRenderer.tsx, GenUIInbox.tsx | renders generated-UI surfaces from agent output |
| apps/web/src/components/DesignBrowserPanel.tsx, DesignFilesPanel.tsx, design-browser-storage.ts, design-browser-tools.ts, design-browser-task-handoff.md (repo root) | browsing/managing generated design files |
| apps/web/src/components/DesignKitView.tsx, DesignSpecView.tsx | viewing a design system's kit / spec |
| apps/web/src/components/design-files/ (designArtifacts.ts, pluginFolderActions.ts, pluginFolders.ts) | artifact/plugin file-tree management |
| apps/web/src/lib/file-viewer-render-mode.ts, file-viewer-preview-assets.ts, html-source-snapshot-cache.ts, html-thumbnail-source-cache.ts | render-mode switching and HTML snapshot/thumbnail caching for the viewer |
| apps/web/src/artifacts/renderer-registry.ts | registry mapping artifact type to renderer component |
| design-systems/<brand>/system/{index.html, kit.html, kit.dark.html, artifacts/*.html} and preview/{colors,spacing,typography}.html | per-brand static HTML previews (154 brands, one full set each) — not an editor, but the render surface the editor targets |
| design-templates/ (per-template index.html / example.html / template.html) | the HTML template library the editor loads and edits |
| docs/plans/manual-edit-mode-implementation.md, specs/current/manual-edit-mode-requirements.md, specs/current/manual-edit-direct-manipulation.zh-CN.md, e2e/ui/app-manual-edit.test.ts | spec/plan/test trail confirming "manual edit" is a named, planned feature (direct manipulation of rendered HTML) |
| figma-plugin/ (code.js, ui.html, IR.md) | separate Figma-side plugin, not part of the web editor; IR.md suggests an intermediate representation bridging Figma and the app |

# GRAPH-SHAPED THINGS

No literal node/edge graph data structure found (grepped `graph`, `dag` — only two unrelated hits: a deck template folder named `graphify-dark-graph` and a video composition file `graphics.html`). What exists instead is registries and manifests:

| path | what it registers |
|---|---|
| apps/daemon/src/runtimes/registry.ts | the 26 coding-agent runtime defs |
| apps/daemon/src/registry/ (database-backend.ts, github-backend.ts, static-backend.ts, versioning.ts) | pluggable backend for a registry (db, GitHub, static file), with versioning |
| apps/daemon/src/plugins/registry.ts, apps/daemon/src/plugins/atoms/registry.ts | plugin and plugin-atom registries |
| apps/daemon/src/genui/registry.ts | generated-UI component registry |
| apps/daemon/src/critique/run-registry.ts | critique-run registry |
| apps/web/src/artifacts/renderer-registry.ts | artifact-type-to-renderer map |
| apps/web/src/providers/registry.ts | model-provider registry |
| packages/registry-protocol/src/{backend.ts, index.ts, schemas.ts} | shared registry protocol package used by daemon and pack tooling |
| packages/contracts/src/agent-tools/registry.ts, packages/contracts/src/api/registry.ts | agent-tool and API contract registries |
| packages/download/src/registry.ts | download-source registry |
| plugins/registry/{community,official}/open-design-marketplace.json | the actual plugin marketplace listing (community vs official) |
| plugins/community/humanize-ppt/registry/renderer_registry.json | one plugin's own internal renderer registry |
| design-systems/<brand>/manifest.json, components.manifest.json | per-brand design-system manifests (what each brand ships) |
| library/maps equivalents: none found in this repo (that pattern is Sandbox Suite's own, not Open Design's) | n/a |

# HOW THE DUMPS WERE CUT

`tree_split.py` (label: filetree splitter) walks the repo root, skips `node_modules` and `.git`, writes one `tree-<dirname>.txt` per top-level directory plus `tree-root-files.txt` for loose root files. Output for this repo: 28 top-level `tree-*.txt` files in `tree-split/` (23 real dirs + 5 dotdirs: `.claude`, `.claude-plugin`, `.github`, `.looper-attachments`, `.vaunt`) plus `tree-root-files.txt`.

Three of those top-level dumps were themselves large enough to warrant a second pass, split one level deeper into their own subfolders:
- `apps-split/` — 6 files: `tree-closure.txt`, `tree-daemon.txt`, `tree-desktop.txt`, `tree-packaged.txt`, `tree-web.txt`, `tree-root-files.txt` (one per app + loose files)
- `plugins-split/` — 6 files: `tree-_official.txt`, `tree-community.txt`, `tree-open-design.txt`, `tree-registry.txt`, `tree-spec.txt`, `tree-root-files.txt`
- `design-systems-split/` — 154 files, one `tree-<brand>.txt` per design-system folder (e.g. `tree-bmw.txt`, `tree-airbnb.txt`, `tree-apple.txt`) plus `tree-_schema.txt`

`tree.py` (label: filetree renderer) is the same walk logic printing one combined indented tree to stdout — this produced `open-design-tree-pretty.txt`. `find_agent_files.py` (label: agent file finder) walks the repo case-insensitively for `agent.md`/`agents.md` and printed sorted paths — this produced `agent-md-locations.txt`. `open-design-tree.txt` (flat, 14941 lines) appears to be the same walk with full paths printed one per line instead of indented tree connectors.

# UNKNOWNS

- `.vaunt/` (7 files: icons — beacon.png, node.png, nova.png, signal.png, spark.png — plus config.yaml) — no other repo reference found in the greps run; purpose not determined.
- `wpds` skill (skills/wpds/SKILL.md only) — name not decodable from filename alone.
- `data/cards/*-signal-*.svg` (two files named after usernames, e.g. `lefarcen-signal-1785911256163.svg`) and `data/events.jsonl`, `data/contributors.json`, `data/plugin-previews/manifest.json` — plausible analytics/contributor data but not confirmed from names alone.
- `.looper-attachments/kbpage_late.png` — single orphan file, tool/product named "Looper" not otherwise seen in the tree.
- `story/STORY.md` / `STORY.zh-CN.md` — content and purpose not read.
