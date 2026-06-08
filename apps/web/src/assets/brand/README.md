# Spry brand assets

`spry-logo.png` is the master brand mark (1024x1024, white line-art on the dark
brand background). It is the source of truth for the logo; it is not imported by
code. The app-served assets below are generated from it, so regenerate them here
whenever the master changes:

- `apps/web/public/spry-logo.png` - transparent, white-in-alpha mark used by the
  nav. Rendered through a CSS mask filled with the theme foreground color, so it
  follows light/dark mode (see `apps/web/src/components/Logo/NavIcon.tsx`).
- `apps/web/public/favicon.png` and `apps/web/public/images/192x192_App_Icon.png`,
  `512x512_App_Icon.png` - favicon + app icons (rounded square, white mark on the
  dark brand background).
- `apps/web/public/images/324x74_App_Watermark.png` - white logo + "Spry" wordmark
  lockup overlaid on generated Open Graph share images.
