# Move Together: Design System

**Status:** LOCKED, confirmed by the user on 2026-11-25.
**Direction:** "Labeled boxes on calm glass." The app is friendly, calm and simple. It uses warm paper neutrals, cardboard box labels and packing tape, and floating frosted glass over soft washes of the brand blues.
**Source of truth for code:** `frontend/src/index.css` (tokens) and `frontend/src/App.css` (components).

## Pins (do not change without the user)
- **Brand blues are exactly `#89cff0` (baby blue) and `#2b8bc6` (strong blue).**
  - `#89cff0` is used only as a fill or decoration, never for text (1.71:1 on white).
  - `#2b8bc6` is used for icons, outlines, chart fills and focus accents (3.74:1, which passes the 3:1 non-text minimum).
- **`--blue-700 #1f648e`** is the derived color for small blue text and primary buttons. It is 6.42:1 on white, and white text on it is 6.42:1.
- Light theme only.
- One sans-serif, **Figtree** (400–800), with tabular numerals for money.
- The layout from before the redesign stays: a sidebar shell for logged-in pages and a top navbar for public pages.

## Token block
```css
--blue-50: #eaf5fc;  --blue-300: #89cff0;  --blue-500: #2b8bc6;  --blue-700: #1f648e;  --blue-800: #1c587d;
--paper: #f7f5f1;  --surface: #ffffff;  --sunk: #f3f1ec;
--line: #e6e2da;          /* decorative dividers only */
--line-strong: #7a746a;   /* control + chart boundaries, 4.63:1 */
--ink: #22201c;  --text-2: #5d5850;  --on-primary: #ffffff;
--kraft: #f5ecdb;  --kraft-line: #e3d2b0;  --kraft-ink: #6b4f1d;
--success-bg: #e6f4ec;  --success-text: #17683c;
--warning-bg: #fdf4d9;  --warning-text: #7a5600;  --warning-mark: #e0a100;
--error-bg: #fdecec;    --error-text: #b42318;    --error-mark: #b42318;
--radius-xs: 4px; --radius-sm: 10px; --radius: 14px; --radius-lg: 20px; --radius-xl: 26px; --radius-pill: 999px;
--s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px; --s6: 32px; --s7: 48px;
--ease-out: cubic-bezier(.22,1,.36,1);  --ease-spring: cubic-bezier(.34,1.56,.64,1);
--dur-1: 120ms; --dur-2: 220ms; --dur-3: 420ms; --dur-4: 800ms;
```

## Type scale
| Use | Size and weight |
|---|---|
| h1 | 32px / 750, -0.025em (26px on phones) |
| h2 | 17px / 700 |
| Body | 16px / 1.55 |
| Secondary text | 14px |
| Meta | 13px |
| Smallest | 11.5px (tab labels, box labels) |

## Contrast (verified with `check-v2.mjs`: 34 pairs, all pass)
- Every text pair is at least 4.5:1, and every control or chart boundary is at least 3:1.
- Glass is checked against the worst-case backdrop behind it.

## Layout and screen sizes
| Width | Navigation |
|---|---|
| Under 600px | Glass header, glass bottom tab bar (Dashboard, Shared List, Budget, Dolly, More) and a More sheet |
| 600–1023px | 92px icon rail. Short landscape screens get a 72px icon-only rail. |
| 1024px and up | 256px floating glass sidebar |

- Container queries for components.
- `dvh` heights and safe-area insets.
- 44px+ targets on coarse pointers.
- 16px inputs.

## Signature elements
1. The dolly carrying the MT box is the logo, Dolly's avatar and the favicon.
2. Box-label chips (kraft background, uppercase) mark categories in Dolly's cards. Use them sparingly; the dashboard doesn't use them.
3. Packing-tape strips sit on the key-number cards.
4. Glass is used only on the chrome: the sidebar, tab bar, mobile header, composer and dropdowns. Data cards stay solid, and glass is never nested.

## Motion
- Press feedback uses `scale(.96)` with a spring release, plus ripples.
- Dropdowns and sheets grow from their trigger.
- Inputs glow and lift on focus.
- Dolly streams in word by word, each word fading from blur, after a typing indicator.
- Dashboard cards enter one after another, bars grow in and numbers count up.
- Everything is disabled under `prefers-reduced-motion`.
