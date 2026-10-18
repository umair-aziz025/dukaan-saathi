/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#19342A',
    tint: '#234B3A',

    // Core surfaces
    background: '#F7F5EC',
    foreground: '#19342A',

    // Cards / elevated surfaces
    card: '#FFFEFA',
    cardForeground: '#19342A',

    // Primary action color (buttons, links, active states)
    primary: '#234B3A',
    primaryForeground: '#FFFDF6',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#E8EDE4',
    secondaryForeground: '#244334',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#EFEEE5',
    mutedForeground: '#6C766B',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#DFE9DA',
    accentForeground: '#234B3A',
    accentStrong: '#986126',

    // Destructive actions (delete, error states)
    destructive: '#B54639',
    destructiveForeground: '#FFFFFF',

    // Borders and input outlines
    border: '#DEDCD0',
    input: '#DEDCD0',
  },

  dark: {
    text: '#F5F1E6',
    tint: '#A9C7A8',
    background: '#101C16',
    foreground: '#F5F1E6',
    card: '#19271F',
    cardForeground: '#F5F1E6',
    primary: '#A9C7A8',
    primaryForeground: '#132018',
    secondary: '#27372D',
    secondaryForeground: '#E4EBDD',
    muted: '#202D24',
    mutedForeground: '#A7B2A5',
    accent: '#2B3D31',
    accentForeground: '#E4EBDD',
    accentStrong: '#DCA354',
    destructive: '#F07E6E',
    destructiveForeground: '#1B1210',
    border: '#334137',
    input: '#334137',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 8,
};

export default colors;
