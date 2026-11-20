# Connect design system

The live look of Connect, written down from `app/globals.css` and `app/public.css`. If this file and the CSS disagree, the CSS is right and this file should be fixed.

**Direction:** Apple-style, as on apple.com and in Apple's Human Interface Guidelines. That means the system font, calm neutral surfaces, one blue for actions, Apple's system colours as accents, soft rounded shapes, a pill for every selection, and very light shadows. The user picked it after comparing it live, side by side, with the earlier look.

## 1. Principles

- **One action colour.** Blue (`--mark`) is for the main action on a screen and for links. Every other colour shows status, never an action.
- **Pills for choosing.** Buttons, filters, tabs, chips and badges are all fully rounded. Cards are rounded too, but less.
- **Surfaces, not boxes.** White (or dark grey) cards sit on a soft canvas, with no hairline borders. Separation comes from colour and spacing.
- **Dark first, light equal.** Both themes are designed. Without a saved choice, Connect follows the device. The choice is a cookie, set from Settings or the avatar menu.
- **Readable by rule.** Body text and small text meet 4.5:1 contrast in both themes. Coloured text uses the deeper `-t` shades.
- **Phone first for touch.** Every control is about 44px tall on touch screens. Nothing scrolls sideways at 375px.

## 2. Colour

All colours are CSS variables on `:root`. Never write a raw colour in a component.

### Neutral roles

| Token | Role | Dark | Light |
|---|---|---|---|
| `--bg` | Page canvas | `#000000` | `#f5f5f7` |
| `--surface` | Cards, menus, toasts | `#1c1c1e` | `#ffffff` |
| `--surface2` | Raised areas inside a card | `#2c2c2e` | `#fbfbfd` |
| `--sunk` | Inputs, notes, wells | `#2c2c2e` | `#f0f0f3` |
| `--pill` / `--pill-hover` | Ghost buttons, filters, chips, meter track | `#3a3a3c` / `#48484a` | `#e8e8ed` / `#dedee4` |
| `--ink` | Main text | `#f5f5f7` | `#1d1d1f` |
| `--muted` | Secondary text | `#a1a1a6` | `#5e5e63` |
| `--line` / `--line2` | Dividers | `#38383a` / `#48484a` | `#e5e5ea` / `#d2d2d7` |
| `--silver` | Second dot of the logo | `#86868b` | `#86868b` |
| `--bar` | Translucent top bar | `rgba(22,22,23,.8)` | `rgba(250,250,252,.8)` |

### Action and state

| Token | Role | Dark | Light |
|---|---|---|---|
| `--mark` / `--mark-ink` | Primary button fill and its text, sent chat bubbles, unread counts | `#0071e3` / `#fff` | `#0071e3` / `#fff` |
| `--accent` | Links, focus rings, checkbox and slider fill, selected outlines | `#0a84ff` | `#0071e3` |
| `--accent-soft` | Unread rows, focus glow | blue at 20% | blue at 10% |
| `--ok` / `--ok-soft` | Success | `#30d158` | `#1d7333` / `#e9f6ec` |
| `--warn` / `--warn-soft` | Warning | `#ff9f0a` | `#b25000` / `#fff4e5` |
| `--bad` / `--bad-soft` | Errors, destructive actions | `#ff453a` | `#d70015` / `#fdecee` |

In dark mode, primary buttons use the deeper `#0071e3` rather than `#0a84ff`, so white button text stays readable. Links stay the brighter `#0a84ff`, which reads well on black.

### System palette (accents)

These are Apple's system colours, for status badges, project icons, figures and progress. Fills use the base colour. Text uses the `-t` shade.

| Name | Fill, dark / light | Text (`-t`), dark / light |
|---|---|---|
| blue | `#0a84ff` / `#007aff` | `#409cff` / `#0071e3` |
| green | `#30d158` / `#34c759` | `#30d158` / `#1d7333` |
| orange | `#ff9f0a` / `#ff9500` | `#ffb340` / `#b02e00` |
| purple | `#bf5af2` / `#af52de` | `#da8fff` / `#8944ab` |
| pink | `#ff375f` / `#ff2d55` | `#ff6482` / `#d30f45` |
| teal | `#40c8e0` / `#30b0c7` | `#5de6ff` / `#0071a4` |
| indigo | `#5e5ce6` / `#5856d6` | `#7d7aff` / `#3634a3` |
| red | `#ff453a` / `#ff3b30` | `#ff6961` / `#d70015` |

**Where the palette is used:**
- **Status badges:**
  - "Needs people" is orange.
  - "Building" and info badges are blue.
  - "In review" is purple.
  - "Shipped", "Paid" and "Alumni funded" are green.
  - Errors are red.
- **The credit badge in the header** is green, because credit reads as money earned.
- **"Fits you"** is teal.
- **Progress bars** sweep from blue to teal.
- **Admin figures** each get one colour: blue, green, orange and purple.

### Fixed colours (same in both themes)

`--white`, `--black`, `--danger #ff3b30`, `--danger-deep #d70015`, `--go #34c759`, `--info #0a84ff` and `--linkedin #0a66c2`. These are for text on photos and video, the call screen, call buttons and the LinkedIn brand mark.

### Avatars and project icons

- **Avatars without a photo:** white initials on one of eight deepened system colours, picked by user ID, so white text reads at 4.5:1 or better:
  `#0071e3 #1f7a35 #c93400 #8944ab #d30f45 #5856d6 #0071a4 #b25000`.
  These live in `AVATAR` in `app/bits.tsx`, and chat uses the same list.
- **Project icons** (`.picon`) look like app icons: the first letter on a soft vertical gradient of one of eight colours (`.c0` to `.c7`), with a 9px radius (12px when large). They're decorative and hidden from screen readers.

## 3. Type

- **Font:** the system font only, so no web fonts load.
  - `--display`: SF Pro Display, then Helvetica Neue and Arial.
  - `--body`: SF Pro Text.
  - `--code`: SF Mono and Menlo, for code only.
- **Numbers:** figures, times and credit use the text font with `font-variant-numeric: tabular-nums`, as apple.com does. Never monospace.
- **Body:** 16px, line height 1.47, letter spacing -0.01em, antialiased.
- **Headings:** weight 600, line height 1.1, balanced wrapping.

| Use | Size | Tracking |
|---|---|---|
| Landing headline (`.pub-hero h1`) | `clamp(2.9rem, 1.5rem + 5vw, 5rem)` | -0.035em |
| Landing section heads | `clamp(2rem, 1.2rem + 3vw, 3rem)` | -0.03em |
| `h1` in the app | 2rem | -0.02em |
| `h2` | 1.3rem | -0.015em |
| `h3` | 1.06rem | -0.01em |
| Labels (`.label`) | 0.8rem, weight 600, `--muted`, sentence case | — |
| Small text | 0.85rem | — |

- **The one gradient:** the landing headline's last words ("what ships.") run blue → purple → pink → orange (`.grad`). The closing statement uses blue → purple. It falls back to plain text in forced-colours mode. Don't use gradient text anywhere else.
- **Never:** all-caps labels, letter-spaced eyebrows, or a single italic word inside a heading.

## 4. Shape, depth and layout

- **Radius:**
  - `--r-sm` 10px for inputs.
  - `--r-md` 14px for notes, alerts and toasts.
  - `--r-lg` 18px for cards.
  - `--r-xl` 28px for large panels.
  - `--r-pill` 980px for all pills.
- **Shadows:** almost none.
  - Light cards use `0 2px 12px rgba(0,0,0,.06)`. Dark cards use none.
  - Popovers and toasts use `--shadow-pop`.
  - A card you can open lifts 2px on hover, with a soft 28px shadow.
- **Materials:** the top bar is translucent, with `saturate(180%) blur(20px)` over `--bar`.
- **Container:** at most 1120px wide, centred, with 20px side padding (16px on phones).
- **App columns:** the main column plus a 320px sidebar with a 28px gap. Below 860px it becomes a single column.
- **Cards:** 22px padding.
- **Landing sections:** `clamp(72px, 9vw, 120px)` of vertical padding.

## 5. Motion

- **Easing:**
  - `--ease`: `cubic-bezier(.4,0,.6,1)`.
  - `--ease-out`: `cubic-bezier(0,0,.2,1)`.
- **Durations:**
  - 0.24s for colour changes.
  - 0.12s for presses.
  - 0.32s for a card lift.
- **Press feedback:** buttons scale to 0.98 on press, and the chat send button to 0.92.
- **Waiting states:** a form that is sending shows a moving sheen on its button. Loading placeholders use the same sheen.
- **Properties:** animate only `transform`, `opacity` and colours. Never `transition: all`.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, every animation and transition is turned off.

## 6. Components

**Buttons (`.btn`):**
- The primary button is a blue pill: weight 600, 0.95rem, 11px × 20px padding, at least 40px tall.
- On hover it lightens 6%. When pressed it darkens 8% and scales to 0.98.
- `.ghost` is grey (`--pill`). `.danger` is a soft red fill with red text.
- `.sm` is at least 32px tall, and `.lg` has 14px × 26px padding.
- When disabled, opacity drops to 0.42.
- Use one primary button per screen area. Everything else is ghost.

**Filters and tabs:**
- Grey pills with a count in a slightly lighter weight.
- The selected filter flips to ink on canvas: white on black in dark mode, black on white in light mode.
- The header tabs are muted text that turns into a grey pill on hover or when current.

**Badges (`.pill`), chips (`.chip`) and stamps (`.stamp`):**
- All are fully rounded, 0.75–0.8rem, weight 600.
- Badges are coloured by status (see the palette above). Chips are neutral grey, used for skills and "Needs: role".
- Stamps are outlined, for verified marks.

**Cards (`.card`):** a surface, an 18px radius, no border. `.lift` is for cards that open something.
- **Getting started card:** a gentle blue-to-purple wash.
- **Invite card:** a green-to-teal wash.
- **For you cards (`.fy`):** the title link covers the whole card. "Not for me" sits above it at the bottom right, beside the blue reason line ("Needs your React · Moving this week").

**Inputs:**
- `--sunk` fill, a transparent border, 10px radius, 1rem text and 16px on phones, so iPhone doesn't zoom in.
- On focus they show a blue border and a 4px soft blue glow.
- Checkboxes, radios and sliders use `accent-color`.

**Avatars:** round, 32px (64–76px when large), with initials as described in section 2.

**Header and phone navigation:**
- The header holds the logo (a blue dot and a silver dot, then "Connect"), the community chip, tabs, message and bell icons, the green credit badge, the avatar and settings.
- Under 40rem, a five-item tab bar sits fixed at the bottom: Projects, People, Messages, Inbox and You. It has unread badges and respects the safe area.

**Feedback:**
- Toasts are surface cards with `--shadow-pop`. Error toasts add a 3px red inner edge on the left.
- Notes use `--sunk`. Alerts are rounded 14px.

**Progress (`.meter`):** a grey pill track with a blue-to-teal fill.

**Chat:**
- Sent bubbles are blue (`--mark`) with white text. Received bubbles are `--surface2`.
- Bubbles have an 18px radius, with a 6px tail corner on the last bubble in a run.

## 7. Accessibility

- **Contrast:** 4.5:1 for body and small text, and 3:1 for large text.
- **Focus:** every control shows a 3px blue focus ring (`:focus-visible`) with a 2px offset.
- **Skip link:** a "Skip to content" link appears when you press Tab.
- **Labels:** every form field has a visible label or an `aria-label`.
- **Tap targets:** about 44px on touch screens, set in the `@media (pointer: coarse)` block.
- **Long text:** long names, titles and links wrap (`overflow-wrap`) instead of pushing the page sideways. The chat header cuts long names off with an ellipsis.
- **Colour:** meaning is never shown by colour alone. Every coloured badge also has a word.

## 8. Words

- **Community, not college.** Connect is for communities, like the students of a college or the employees of a workplace. Say "member", not "student", and "college or work email" for the email people verify with.
- Never say "tier 3 college".
- Plain words and short sentences. Buttons say what happens ("Send for review", "Not for me").
- Never invent numbers, quotes, testimonials or logos.

## 9. Before shipping a visual change

- Check light and dark at 375px, 768px and 1440px. Look for no sideways scroll, no console errors, and contrast that still passes.
- For a big visual change, show the options side by side, live, before deploying.
