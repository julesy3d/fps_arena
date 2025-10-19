import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        title: ['"Major Mono Display"', 'monospace'],
        mono: ['"Fira Code"', 'monospace'],
      },
      colors: {
        // Base tones (light theme)
        base: '#f5f5f0',        // Warm off-white background
        surface: '#e8e8e0',     // Slightly darker surface
        overlay: '#d4d4c8',     // Input/card backgrounds

        // Text hierarchy
        text: '#2d2d2d',        // Primary text (warm charcoal)
        subtext0: '#5a5a52',    // Secondary text
        subtext1: '#787870',    // Tertiary text

        // Accents (muted Y2K palette)
        cyan: '#7dd3c0',        // Mint/cyan for status
        lavender: '#b4a7d6',    // Soft purple for highlights
        peach: '#f5b895',       // Warm peachy accent
        sage: '#a8c5a4',        // Muted green for success
        rose: '#e8a5a5',        // Soft pink for errors
        amber: '#e5c287',       // Warm yellow for warnings

        // Semantic colors
        success: '#a8c5a4',
        warning: '#e5c287',
        error: '#e8a5a5',
        info: '#7dd3c0',
      }
    },
  },
  plugins: [],
};
export default config;
