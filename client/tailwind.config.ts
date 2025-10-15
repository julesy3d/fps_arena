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
        // Catppuccin Macchiato theme colors
        rosewater: '#f4dbd6',
        flamingo: '#f0c6c6',
        pink: '#f5bde6',
        mauve: '#c6a0f6',
        red: '#ed8796',
        maroon: '#ee99a0',
        peach: '#f5a97f',
        yellow: '#eed49f',
        green: '#a6da95',
        teal: '#8bd5ca',
        sky: '#91d7e3',
        sapphire: '#7dc4e4',
        blue: '#8aadf4',
        lavender: '#b7bdf8',
        text: '#cad3f5',
        subtext1: '#b8c0e0',
        subtext0: '#a5adce',
        overlay2: '#939ab7',
        overlay1: '#8087a2',
        overlay0: '#6e738d',
        surface2: '#5b6078',
        surface1: '#494d64',
        surface0: '#363a4f',
        base: '#24273a',
        mantle: '#1e2030',
        crust: '#181926',
      }
    },
  },
  plugins: [],
};
export default config;
