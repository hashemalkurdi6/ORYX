# ORYX — Dusk Direction

> *You just got home after months away. The day is ending. Night is just beginning. There's a summer breeze. You're going out with your friends in a little while. Nothing is in your way. Everything is ahead of you. The sky is doing that thing where it's three colors at once.*

This document fixes the visual identity of ORYX to a single, specific moment: **civil twilight in summer, anticipation lit by warm afterglow against an indigo sky that hasn't gone black yet.** It is the foundation for re-theming the rest of the app. The landing screen is the first place it lands; everything else follows.

This is a design rationale — not yet code. Approve it, push back on it, redirect it. Tokens come next.

---

## 1. The decode

The brief is emotional, not visual. To translate it I had to name what's actually happening in that moment so each choice maps to something specific.

| Felt thing | What it means visually |
|---|---|
| "Three colors at once" | A literal sky band: warm peach low → mauve/rose mid → indigo overhead. Held in tension, not gradient-resolved. |
| "Anticipation, not arrival" | Energy is potential, not kinetic. No "peak" treatment — no big drum hits, no shouting accents. The mark is composed and slightly understated, like someone about to walk somewhere. |
| "Warmth meeting cool" | Two emotional registers, both present. The primary CTA is warm. The secondary is cool. They face each other. |
| "Even dark areas have hue" | No `#000`. No `#0F0F0F`. The base background is a deep cobalt-indigo with measurable blue cast — it reads as *night air,* not absence of light. |
| "Summer breeze" | Motion that exhales. Cubic-out easings, not springs that overshoot. The halo breathes in a 16-second cycle, not 12. |
| "Walking somewhere good" | Confident pace, not fast. Type is unhurried. Buttons are generous, not punchy. |
| "Distinctive" | Nothing in the fitness app market uses this register. Closest visual neighbours are editorial / atmospheric apps (Headspace, Calm) — *no* fitness app sits here. That gap is the differentiation. |

---

## 2. Palette

The palette has two halves held at the same moment: **warm afterglow** (the sun's last 18 minutes) and **cool encroaching dusk** (the indigo sky). Every named color is doing one of those two jobs, plus the neutrals that keep them legible.

I picked the colors against real civil-twilight reference, not by default-modifying a generic dark theme. The names are part of the system — call them by name in code and design conversation.

### The warm side — anticipation, the sun that's still here

| Token | Hex | Role |
|---|---|---|
| **Ember** | `#EE9B7A` | Primary accent. Sun-warmed coral-peach. Used on the primary CTA, active states, the brightest band of the halo, anything saying "this is the action." |
| **Glow** | `#F5BC9A` | Lighter Ember for soft highlights, hover/press tints, the inner upper edge of the primary button gradient. |
| **Bloom** | `#E08394` | The transitional dusty-rose between warm and cool. Where the peach starts to lean pink. Used as a secondary glow color, the mid band of the halo, success-state warmth. |

### The cool side — encroaching dusk, the night that's coming

| Token | Hex | Role |
|---|---|---|
| **Veil** | `#9E83BD` | Dusty mauve-violet. The held tension between warm and cool. Used as a hairline-tint, decorative dividers, the third halo band. |
| **Horizon** | `#7E84C2` | Periwinkle. The cool moving in. Used for the ghost-button border and secondary-button text — the "cool side" of the dual CTA. |
| **Vesper** | `#161A2E` | **Base background.** Deep cobalt-indigo. Reads as *night air* against the warm halo, never as black. This is the canvas everything else sits on. |
| **Nightfall** | `#0F1226` | Deeper still. The "overhead" sky. Used for shadows and recessed surfaces. |
| **Halflight** | `#232846` | One step lifted from Vesper. Used for any elevated surface (cards, sheets) — slight cobalt shift upward, not just an opacity bump. |

### Neutrals — warm ivory, cool silver

Pure white is clinical. Pure gray is dead. The neutrals here are *tinted* by the two halves of the palette.

| Token | Hex | Role |
|---|---|---|
| **Ivory** | `#F1E7D5` | Primary text + the wordmark. Warm off-white — the colour of skin in late light. Reads as "lit by Ember," not "neutral." |
| **Mist** | `#B8B8D2` | Secondary text. Cool periwinkle gray — paired with the dusk side. |
| **Shadow** | `#6E7396` | Muted text, timestamps, hints. Still has periwinkle in it. |

### Semantic states (re-cast in palette terms)

The current system has lime / yellow / red for readiness. Those colors do not survive in the new direction (see §6). Replacements:

- **High readiness / success** → **Bloom** (`#E08394`) — warm, alive, but not green.
- **Mid readiness / warn** → **Glow** (`#F5BC9A`) — softer warmth.
- **Low readiness / danger** → A muted brick `#C66457` (named **Smoulder**) — sits in the warm family but darker, never reads as "alarm red." Concession color: only used for true danger states. Not on the landing.

This is a deliberate choice. Universal red/yellow/green is *legible* but *generic.* Keeping every signal inside the warm palette makes the system feel like one place — dusk doesn't have a green light in it.

---

## 3. Typography

> Inter is dead. So is Geist on this screen.

The current stack is Geist + JetBrains Mono. Both are competent and both are wrong for this brief — Geist is a tech-sans (it's literally Vercel's voice) and reads "developer tool." Dusk needs something with breath.

### Three faces

**Display — Fraunces** *(new)*

The wordmark, the tagline, anywhere the brand is speaking. Fraunces is a variable serif with a `SOFT` axis that rounds its terminals — perfect for the dusk register, neither stiff-editorial nor quirky-handwritten. It is *literary,* slightly warm, expressive without being precious. Pairs with sans body.

- "ORYX" wordmark: Fraunces SemiBold, optical-size 144, soft 80, tracking +4 (slightly looser than the current 6 — Fraunces has more body and doesn't need as much air).
- "Know your body." tagline: Fraunces *Italic* Regular, smaller. The italic gives it the feel of a thoughtful aside, not a slogan.

**Body — DM Sans** *(new)*

Functional UI, buttons, descriptive text, in-app labels. DM Sans is geometric-humanist with rounded shoulders — warmer than Inter, less corporate than Roboto, and reads beautifully in small sizes on mobile. It carries readability without imposing a tone.

**Micro / data — DM Mono** *(new, sparingly)*

For the "tracking" moments inside the app — distance, time, pace, heart rate. Used in passes after this one. On the landing screen it does not appear.

### Font dependencies — flagging

This pass introduces three new font packages and removes the Geist dependency from the landing screen (Geist may still be used elsewhere temporarily until the rest of the app is re-themed). The packages exist in `@expo-google-fonts`:

- `@expo-google-fonts/fraunces` — for `Fraunces_500Medium`, `Fraunces_600SemiBold`, `Fraunces_400Regular_Italic`
- `@expo-google-fonts/dm-sans` — for `DMSans_400Regular`, `DMSans_500Medium`, `DMSans_600SemiBold`, `DMSans_700Bold`
- `@expo-google-fonts/dm-mono` — for `DMMono_400Regular`, `DMMono_500Medium`

These are the only new dependencies in this pass. Flagging per the brief.

### Type scale

Same numeric scale (`type.size`), but tuned tracking:

| Style | Family | Size | Tracking | Notes |
|---|---|---|---|---|
| Wordmark | Fraunces SemiBold | 44 | +4 | Was Geist Bold +6. Looser-than-Inter normal, tighter than the current spread. |
| Tagline | Fraunces Italic | 17 | 0 | Italic is the move. |
| Subtitle | DM Sans Regular | 13 | 0 | "The training brain you've been missing." Quieter, neutral. |
| Primary CTA | DM Sans Medium | 16 | +0.2 | Was Bold. Medium feels more confident than bold here. |
| Secondary CTA | DM Sans Medium | 16 | +0.2 | Same weight as primary — equal vertical importance per the existing layout intent. |

---

## 4. Surface treatment

### Buttons

The two CTAs are the embodiment of the warm/cool tension. They are not the same shape painted two colors — they are two different *materials.*

**Primary — "Create Account":**

- Fill: vertical gradient `Glow → Ember` (top to bottom). Reads like the warm face of the sky: brighter at the top, deeper at the bottom.
- Text: `Vesper` (deep indigo) on warm fill — high contrast, but warm-on-warm. The text sits *in* the ember, not *on* it.
- Radius: `18px`. Slightly tighter than the current `R.lg = 20`. Reads as a worn river stone, not a pill, not a rectangle.
- Glow: a soft `Bloom` halo at low opacity (≈12%) blurred behind the button — small radius, subtle. The button looks like it's holding a lit ember without literally bloom-glowing.
- No drop shadow (drop shadows on warm buttons go cheap fast).

**Secondary — "Log In":**

- Fill: transparent.
- Border: 1px `Horizon` at 50% opacity. Cool periwinkle hairline.
- Text: `Ivory` — warm text on a cool border, so even the ghost button carries the dual-register tension.
- Radius: `18px` to match.
- No glow.

The pair, side-by-side: one breathes warm, one sits cool. Together they do what the brief asks — two registers, held.

### Radii (overall system)

- Buttons: 18 — slightly tighter than current.
- Cards (later passes): 22–24 — generous, "stone" not "tile."
- Pills: 999 — unchanged.

### Borders & dividers

- Dropped or near-zero. When used: 1px hairline at `Ivory @ 7%` — borders pick up a hint of warm rather than reading as dead gray.

### Shadows

When shadows appear (cards in later passes), they are **`Nightfall @ 60%` — indigo, never black.** Dusk shadows have hue. This is a small detail that compounds into atmosphere.

### No glassmorphism on the landing

The landing screen has no cards. It is open horizon — wordmark, halo, two buttons, breathing space. Glass would put a wall in front of the sky. (Glass treatments survive in the in-app system for cards that are doing real work — but only there, and only re-tuned to the new palette in later passes.)

---

## 5. Ambient backdrop — the cycling halo

The existing `ReadinessHalo` component is a soft, persistent, color-cycling radial gradient behind the logo. It already does the right *kind* of thing. It is repurposed, not replaced.

### The cycle

Currently: `readiness.high → readiness.mid → readiness.low → mid → high`, 12s loop. Lime → yellow → orange.

**New cycle on the landing:** `Ember → Bloom → Veil → Bloom → Ember`. Warm peak → mauve transition → cool violet → back. **16s loop**, slightly slower than current 12s — dusk does not change in 12 seconds. The slower cycle reads as breathing rather than animating.

The halo sits behind the logo at ~600px diameter (existing). Its outer edge is fully transparent, so there's no boundary between halo and Vesper background — the warmth feels emergent from the indigo, like atmosphere rather than a painted disc.

### Architectural note

The existing `ReadinessHalo` component reads `theme.readiness.high/mid/low` directly. To repurpose without breaking the in-app readiness ring (which still needs semantic colors), I'll either:

- (a) Generalize `ReadinessHalo` to accept an optional `colors` prop (3-tuple), defaulting to readiness colors. Landing passes the dusk triple. *Preferred.*
- (b) Add a thin `DuskHalo` wrapper that calls `ReadinessHalo` with explicit colors.

Option (a) is cleaner. One component, two roles: "readiness state" inside the app, "sky" on the landing. I'll commit to (a) in the implementation pass.

### Full-screen `AmbientBackdrop` (other screens)

Not used on the landing — the landing's backdrop is just `Vesper` flat plus the halo. The full-screen `AmbientBackdrop` (used on home, etc.) gets its multi-glow palette retuned to dusk colors in a later pass; not in scope for this commit.

---

## 6. Lime — does it survive?

**Lime dies.**

I considered keeping `#DEFF47` as a single semantic accent for "live / active / now" states (since users may have learned it as an ORYX cue). Rejected because:

1. The brief says explicitly "kill the current direction" and "not pure black + neon."
2. Lime against a deep cobalt base reads as *electric warning,* not anticipation. It violates "energy without urgency."
3. Keeping it would force every other surface to negotiate around it. Cleaner to commit fully than to leave a vestige.

In its place: **Ember** carries the active-state job. Where lime previously meant "this thing is on / active / now," Ember now does. Where lime previously meant "AI / intelligent treatment," `signal.ai` is re-cast to Ember as well — the warm side of the system carries that meaning more honestly than a chartreuse ever did.

For accessibility: Ember on Vesper hits contrast comfortably for non-text accents. For text on Ember backgrounds (the primary CTA), Vesper-on-Ember meets WCAG AA at 16px medium.

---

## 7. Motion philosophy (sketch only)

Detailed motion polish is the **`emil-design-eng`** pass that runs after this one is approved. For now, the philosophy:

- **Slow > fast.** Easings exhale. Replace `Easing.out(Easing.quad)` with `Easing.bezier(0.22, 1, 0.36, 1)` — same direction, longer settle, softer arrival.
- **Stagger > simultaneous.** The current entry timeline (logo draws → readiness arc colours → wordmark slides → tagline → context → buttons spring) is good. Soften the spring (lower stiffness, raise damping — settle in, don't pop).
- **Halo cycle: 16s, not 12s.** Slower breath.
- **No bounce.** Summer breeze, not playful toy. The current spring on the buttons (damping 14, stiffness 120) is on the edge of bouncy — flag for the motion pass.

The full audit + tuning lives in `docs/design/dusk-motion-audit.md` after the visual pass is approved.

---

## 8. What the landing screen will feel like

When you open the app cold:

1. The screen is dark. Not black — a deep cobalt-indigo. Already, your eye notices it has a hue.
2. Behind the centred logo, a soft warm halo is breathing. It's the colour of a sun that's just gone down. As you watch, it slowly rolls through pink, then a held mauve, then a cool violet, and back. The cycle is so slow you almost don't notice it changing — but you feel that the sky is doing something.
3. The mark draws itself in. A heartbeat later, the wordmark fades up from below — Fraunces, slightly soft, set in warm ivory. It does not announce. It arrives.
4. The tagline appears in italic, smaller. *"Know your body."* It reads like a quiet thought, not a slogan.
5. A subtitle settles below it.
6. The two buttons rise from below — "Create Account" warm, "Log In" cool. They sit in the same row of importance, facing each other across the warm/cool divide.
7. After everything has arrived, only the halo keeps moving. The sky continues to breathe.

That's the screen. The user is the person walking somewhere good, and the app is the dusk they're walking through.

---

## 9. Risks / things to watch

- **Three font families is more weight than two.** Mitigated by loading only the specific cuts named in §3 (six font files total). Bundle size impact: roughly +180KB woff2.
- **Warm coral CTA in fitness category is unusual.** The whole point. But if it reads "feminine" or "soft" in a way that worries you, the cool ghost button is the counterweight, and the type (especially Fraunces in the wordmark) carries enough quiet authority to balance it.
- **Removing lime is a brand shift.** If the team has external assets (App Store screenshots, marketing) using lime, those will need to change too. Out of scope for this pass; flagging.
- **`themeDark` changes affect every screen that reads from it.** Other screens will look different the moment tokens land — likely *wrong* until they're re-themed. The fix is to keep moving through the rest of the app in subsequent passes; the foundation is what matters here. If we want to stage rollout, we can fork a `themeDuskDark` and gate it; my recommendation is to commit and march.

---

## 10. Decisions log (so I'm honest about what I picked)

- **Picked Ember over peach** because peach reads gentle/wedding; Ember has the slight coral edge that says "warmth with intent."
- **Picked Fraunces over Newsreader / Cormorant / Instrument Serif.** Newsreader is a near-tie — its italics are gorgeous — but Fraunces' SOFT axis is unique and matches "summer breeze" better. Instrument Serif is more boutique-brand than I want; Cormorant leans wedding.
- **Picked DM Sans over Spline / Sora / Public Sans.** Spline is more characterful but trades readability at small sizes; Sora is too geometric-cool for a warm system; Public Sans has no character. DM Sans is the right amount of warmth for body work.
- **Picked Vesper (`#161A2E`) over a warmer near-black like `#1A1620`.** A warm dark base would muddy the tension — the cool side needs to *be* cool. Warmth comes from the halo and accents, not from the canvas.
- **Killed lime entirely instead of keeping it semantic.** See §6.
- **Generalized halo over creating a new component.** §5.
- **Two reviews of "should the body be a serif too?"** Considered, rejected — serif body on mobile fitness UI hurts readability at small sizes and risks the editorial register tipping into "too literary." Keeping the body sans, the display serif. Quiet contrast.

---

## Approval gate

**Read this. Push back hard. Specifically I want to know:**

1. The named palette (Ember, Bloom, Veil, Horizon, Vesper, Nightfall, Halflight, Ivory, Mist, Shadow) — does it feel like the moment, or do I have a color wrong?
2. The font commitment (Fraunces + DM Sans + DM Mono, with three new dependencies) — proceed, or restrict to what's already installed?
3. The lime decision — gone entirely, or should I preserve it as a semantic-only token for app-wide consistency?
4. The "ReadinessHalo accepts a colors prop" architectural call — fine, or prefer a separate `DuskHalo` component?

When you've signed off, I move to tokens.
