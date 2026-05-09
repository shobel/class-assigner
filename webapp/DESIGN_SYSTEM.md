# Class Assignment Optimizer - Design System

## Design Philosophy

**Inspiration**: Linear, Notion, Stripe Dashboard, Vercel
**Goal**: Professional, trustworthy, data-forward, delightful

### Core Principles
1. **Clarity over decoration** - Every element serves a purpose
2. **Data hierarchy** - Important stats are immediately visible
3. **Confident simplicity** - Not minimal, but purposeful
4. **Professional warmth** - Serious tool with friendly touches

---

## Color Palette

### Primary (Indigo/Blue)
```
Primary 50:  #EEF2FF (backgrounds)
Primary 100: #E0E7FF (hover states)
Primary 500: #6366F1 (main actions)
Primary 600: #4F46E5 (hover)
Primary 700: #4338CA (active)
```

### Neutrals (Slate)
```
Slate 50:  #F8FAFC (page background)
Slate 100: #F1F5F9 (card backgrounds)
Slate 200: #E2E8F0 (borders)
Slate 400: #94A3B8 (secondary text)
Slate 600: #475569 (body text)
Slate 900: #0F172A (headings)
```

### Semantic Colors
```
Success: #10B981 (emerald-500)
Warning: #F59E0B (amber-500)
Error:   #EF4444 (red-500)
Info:    #3B82F6 (blue-500)
```

### Gradients
```
Hero gradient: linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)
Card hover: linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)
Success glow: radial-gradient(circle at center, #10B98120, transparent)
```

---

## Typography

### Font Family
```css
Primary: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif
Monospace: 'Fira Code', 'Monaco', monospace (for stats/numbers)
```

### Scale
```
Display:  48px / 56px (3rem / 3.5rem) - Hero text
H1:       32px / 40px (2rem / 2.5rem) - Page titles
H2:       24px / 32px (1.5rem / 2rem) - Section headers
H3:       20px / 28px (1.25rem / 1.75rem) - Card titles
H4:       16px / 24px (1rem / 1.5rem) - Subsections
Body:     14px / 20px (0.875rem / 1.25rem) - Main text
Caption:  12px / 16px (0.75rem / 1rem) - Metadata
Tiny:     11px / 14px (0.6875rem / 0.875rem) - Labels
```

### Weights
```
Regular: 400 (body text)
Medium:  500 (emphasized text)
Semibold: 600 (headings, buttons)
Bold:    700 (display, important numbers)
```

---

## Spacing System

```
2px:   0.125rem (hairline)
4px:   0.25rem  (xs)
8px:   0.5rem   (sm)
12px:  0.75rem  (md)
16px:  1rem     (base)
20px:  1.25rem  (lg)
24px:  1.5rem   (xl)
32px:  2rem     (2xl)
40px:  2.5rem   (3xl)
48px:  3rem     (4xl)
64px:  4rem     (5xl)
```

---

## Component Styling

### Buttons

**Primary**
```
Background: primary-500
Hover: primary-600 + lift 2px
Active: primary-700
Shadow: 0 1px 3px rgba(99, 102, 241, 0.3)
Padding: 10px 20px (sm) | 12px 24px (md) | 14px 28px (lg)
Border-radius: 8px
Font: 14px / semibold
Transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1)
```

**Secondary**
```
Background: white
Border: 1.5px solid slate-200
Hover: slate-50 + border primary-500
Text: slate-700
```

**Ghost**
```
Background: transparent
Hover: slate-100
Text: slate-600
```

### Cards

**Default**
```
Background: white
Border: 1px solid slate-200
Border-radius: 12px
Padding: 24px
Shadow: 0 1px 3px rgba(0, 0, 0, 0.04)
Hover: shadow-lg + lift 2px
Transition: all 200ms ease
```

**Stat Card (special)**
```
Border: 2px solid slate-200
Border-radius: 16px
Padding: 24px
Shadow: 0 2px 8px rgba(0, 0, 0, 0.04)
Hover: border-primary-500 + glow effect
```

### Badges

**Status badges**
```
Assigned:   bg-emerald-50, text-emerald-700, border-emerald-200
Pending:    bg-amber-50, text-amber-700, border-amber-200
Error:      bg-red-50, text-red-700, border-red-200
```

```
Padding: 4px 12px
Border-radius: 6px
Font: 12px / 600
Border: 1px solid (matching color)
```

### Inputs

```
Background: white
Border: 1.5px solid slate-200
Border-radius: 8px
Padding: 10px 12px
Font: 14px / regular
Focus: border-primary-500 + ring 0 0 0 3px primary-50
Placeholder: slate-400
```

---

## Layout Structure

### Sidebar (260px)
```
Background: slate-900 (dark mode inspired)
Text: slate-300
Active: primary-500 background
Width: 260px fixed
Shadow: inset -1px 0 0 rgba(255, 255, 255, 0.1)
```

### Main Content
```
Background: slate-50
Max-width: 1400px centered
Padding: 40px 48px
Min-height: 100vh
```

### Header Bar
```
Background: white
Border-bottom: 1px solid slate-200
Padding: 20px 48px
Sticky top
Shadow: 0 1px 3px rgba(0, 0, 0, 0.04) on scroll
```

---

## Specific Component Designs

### Balance Report Stats

**Card Grid**
```
Grid: 3 columns on desktop (min 280px)
Gap: 20px
Cards have subtle gradient overlay on hover
Icon size: 32px with colored background circle
```

**Stat Display**
```
Value: 36px / bold / slate-900
Label: 13px / medium / slate-500 / uppercase / tracking-wide
Supporting text: 12px / regular / slate-400
```

**Quality Indicator**
```
Perfect:    emerald-500 badge + subtle glow
Excellent:  blue-500 badge
Good:       indigo-500 badge
Fair:       amber-500 badge
```

### Class Boxes

**Header**
```
Background: gradient (primary-500 to primary-600)
Text: white
Padding: 20px
Border-radius: 12px 12px 0 0
Shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.2)
```

**Summary Stats**
```
Background: slate-50
Grid: 2 columns
Gap: 8px
Font: 13px / medium
Icons: 16px
```

**Student List (expandable)**
```
Background: white
Border-top: 1px solid slate-200
Each student: hover slate-50 + cursor pointer
```

### Student Cards (Grid View)

```
Size: 200px x 160px
Background: white
Border: 1.5px solid slate-200
Border-radius: 12px
Padding: 16px
Hover: lift 4px + shadow-xl + border-primary-500
```

**Layout**
```
Name: 15px / semibold / slate-900
Icons: bottom row, 20px size, gap 4px
Cursor: pointer
```

### Modals

```
Overlay: rgba(0, 0, 0, 0.6) backdrop-blur(4px)
Content: white, rounded-16px, shadow-2xl
Max-width: 600px (standard) | 800px (large)
Animation: scale(0.95) → scale(1) + fade-in 200ms
```

---

## Animation & Motion

### Principles
- **Fast**: 150ms for micro-interactions (hover)
- **Standard**: 200ms for UI state changes
- **Slow**: 300ms for page transitions
- **Easing**: cubic-bezier(0.4, 0, 0.2, 1) (ease-out)

### Key Animations

**Hover lift**
```css
transform: translateY(-2px);
box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
```

**Button press**
```css
transform: translateY(1px);
```

**Fade in**
```css
opacity: 0 → 1;
transform: translateY(10px) → translateY(0);
```

**Slide in (panel)**
```css
transform: translateX(100%) → translateX(0);
```

---

## Iconography

**Style**: Outlined (not filled)
**Stroke**: 2px
**Size**: 20px standard, 24px large, 16px small
**Source**: Heroicons or Lucide

**Emoji usage**: Keep for personality
- ⚠️ Problematic
- 🎯 Special needs
- 📊 Stats
- ✅ Success

---

## Dark Sidebar Concept

```css
Sidebar background: slate-900
Sidebar text: slate-400
Sidebar active: primary-500 bg + white text
Sidebar hover: slate-800
Logo area: slate-800 with subtle border
Grade items: slate-800 bg, rounded-lg
```

---

## Key Visual Enhancements

1. **Glassmorphism** on stat cards (subtle blur)
2. **Micro-interactions** everywhere (hover, click feedback)
3. **Progress indicators** during assignment
4. **Success animations** after assignment completes
5. **Subtle gradients** on primary actions
6. **Data visualization** for balance metrics (small inline bars)
7. **Empty states** with illustrations
8. **Loading skeletons** instead of spinners

---

## Implementation Priority

**Phase 1: Foundation** (Core colors, typography, spacing)
**Phase 2: Components** (Buttons, cards, inputs)
**Phase 3: Layout** (Sidebar, header, grid)
**Phase 4: Polish** (Animations, micro-interactions, gradients)
**Phase 5: Delight** (Empty states, success animations, Easter eggs)

---

This design system will make the app feel like a $1B SaaS product. Clean, confident, data-forward, with just enough personality to feel human.
