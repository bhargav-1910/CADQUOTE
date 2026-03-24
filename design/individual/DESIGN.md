# Tech-Industrial Design System: Strategic Guidelines

## 1. Overview & Creative North Star
The CNC manufacturing landscape demands absolute precision, yet the software often feels like a relic of the industrial age. This design system bridges the gap between heavy machinery and high-end digital precision.

**Creative North Star: The Precision Engineer**
This system is an exercise in "Architectural Logic." We avoid the "template" look by treating the interface as a high-precision instrument. We break the rigid grid through **intentional asymmetry**—where heavy data containers are balanced by airy, expansive whitespace—and use a high-contrast typography scale to create an editorial feel that commands authority. The experience is not just "modern"; it is intentional, layered, and uncompromisingly professional.

---

## 2. Colors & Tonal Depth

Our palette is rooted in the deep authority of Navy and the kinetic energy of Electric Blue. However, the premium feel is established in the neutrals.

### The Palette
- **Primary (`#001435`):** Used for core structural grounding.
- **Electric Action (`#005bc1` / `surface_tint`):** Reserved for high-intent CTAs and active states.
- **Neutral Foundation (`#f7f9fb` to `#e0e3e5`):** A sophisticated range of cool greys that define our layering.

### The "No-Line" Rule
**Explicit Instruction:** Do not use 1px solid borders to section off content. In this design system, boundaries are created through **background color shifts**. 
- A card (`surface_container_lowest`) should sit on a section (`surface_container_low`), which in turn sits on the main `background`. 
- This creates a cleaner, more sophisticated interface that mimics high-end physical materials rather than a digital wireframe.

### Signature Textures & Glass
- **The Glass Rule:** Floating elements, such as 3D tool overlays or hover menus, must use Glassmorphism. Utilize a semi-transparent `surface` color with a `backdrop-filter: blur(12px)`.
- **Kinetic Gradients:** For primary CTAs and the Price Header, use a subtle linear gradient from `primary` to `primary_container`. This provides a "soul" to the component that flat hex codes cannot achieve.

---

## 3. Typography: Editorial Authority

We use a dual-font strategy to balance industrial character with technical readability.

- **Display & Headlines (Manrope):** Chosen for its geometric precision. Use `display-lg` and `headline-md` with tight letter-spacing (-0.02em) to create an authoritative, "spec-sheet" aesthetic.
- **Body & Labels (Inter):** The workhorse. Inter’s tall x-height ensures that complex pricing tables and technical specs remain legible at `body-sm` sizes.
- **Hierarchy Logic:** Large, bold headlines (`headline-lg`) should contrast sharply with small, high-density data labels (`label-md`). This "Big/Small" contrast is the hallmark of high-end editorial design.

---

## 4. Elevation & Depth

We move away from the "shadow-on-everything" approach. Depth is a narrative, not a decoration.

### The Layering Principle (Tonal Stacking)
Instead of drop shadows, achieve hierarchy by stacking tokens:
1.  **Level 0 (Base):** `surface`
2.  **Level 1 (Sectioning):** `surface_container_low`
3.  **Level 2 (Cards/Content):** `surface_container_lowest` (White)

### Ambient Shadows & "Ghost Borders"
- **Shadows:** When a component must float (e.g., a 3D view container), use an **Ambient Shadow**. 
  - *Spec:* `box-shadow: 0 20px 40px rgba(25, 28, 30, 0.06);` (a tinted, low-opacity shadow using `on_surface`).
- **Ghost Borders:** If accessibility requires a border, use the `outline_variant` at **20% opacity**. Never use a 100% opaque border; it breaks the fluid industrial aesthetic.

---

## 5. Components: Precision Primitive

### 3D View Containers
- **Styling:** Use a `surface_container_highest` background to create a "void" for the model.
- **Overlays:** Control buttons (Rotate/Zoom) must be glassmorphic chips (`surface` at 80% opacity with blur) floating within the container.
- **Roundedness:** Apply `lg` (0.5rem / 8px) to the outer container.

### Multi-Step Forms
- **The Step Indicator:** Use `primary_container` for inactive steps and `surface_tint` for the active step.
- **Flow:** Layout should be asymmetrical. Place the form fields in a wide `surface_container_lowest` column, balanced by a narrower "Live Quote Summary" sticky sidebar.

### Pricing Tables & Lists
- **No Dividers:** Prohibit the use of horizontal rules (`<hr>`). 
- **Separation:** Use the `Spacing Scale`. A `24` (6rem) gap between major groups, or a subtle `surface_variant` background hover state for list items.
- **Status Indicators:** Use `error` and `on_error_container` for DFX warnings. These should be styled as soft-tinted banners with an `xl` (0.75rem) corner radius.

### Buttons & Inputs
- **Primary Button:** Gradient of `primary` to `primary_container` with `md` roundedness. 
- **Input Fields:** Use `surface_container_lowest` with a "Ghost Border" that transitions to a 2px `surface_tint` (Electric Blue) only on focus.

---

## 6. Do’s and Don’ts

### Do
- **Do** use `display-lg` typography for hero numbers (e.g., Total Price) to make them feel like "achievements."
- **Do** use high-contrast color shifts to define the transition from "Configuration" (Light) to "Review" (Dark/Navy).
- **Do** allow content to "breathe" using the `16` and `20` spacing tokens. Industrial design is about scale.

### Don’t
- **Don’t** use pure black `#000000`. Always use `on_surface` or `primary` for text to maintain tonal harmony.
- **Don’t** use standard `1px` borders. They make the platform feel like a generic CRM rather than a bespoke manufacturing tool.
- **Don’t** stack shadows. One layer of ambient shadow is the maximum; anything more feels cluttered and "un-engineered."

---

*This design system is a living framework. When in doubt, prioritize the "Precision Engineer" ethos: if an element doesn't serve a functional or structural purpose, remove it.*