import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        rosewater: '#dc8a78',
        flamingo: '#dd7878',
        red: '#d20f39',
        maroon: '#e64553',
        peach: '#fe640b',
        yellow: '#df8e1d',
        green: '#40a02b',
        teal: '#179299',
        text: '#4c4f69',
        subtext0: '#6c6f85',
        overlay2: '#7c7f93',
        surface0: '#ccd0da',
        surface1: '#bcc0cc',
        surface2: '#acb0be',
        base: '#eff1f5',
        mantle: '#e6e9ef',
        crust: '#dce0e8',
      },
    },
  },
  plugins: [],
};
export default config;