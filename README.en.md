<div align="center">

<img src="docs/dice.png" alt="A set of procedurally generated dice: d4, d6, d8, d10, d12, d20, d%" width="100%">

# ScriptoriumAleae · Dice Study

Physically simulated dice in the browser, for tabletop games.

**[Try it online →](https://fftyyy.github.io/ScriptoriumAleae/?lang=en)**

[中文](README.md) · English

</div>

![Screenshot](docs/screenshot.jpg)

## What it is

A 3D dice tray on a desk in a study. The dice are actually thrown: they tumble across the tray, knock into each other and come to rest, and the face pointing up is the result. There is no scripted animation, and no result is decided in advance.

It has d4, d6, d8, d10, d12, d20 and percentile dice (a tens die plus a units die), so it works for D&D or *Call of Cthulhu* as it is.

## Features

- **Real physics**: rigid-body simulation. Each die's mass and inertia are computed for uniform density, so the centre of mass sits dead centre — no loaded dice. Starting position, velocity and spin come from the browser's cryptographic random source.
- **No two dice alike**: colours, pattern and material are generated on the spot — resin, gemstone, nebula, brushed metal, pearl and more. The numeral colour is picked for contrast so it stays readable. Fixed styles are available too.
- **Two ways to throw**: press the button, or press and hold on the table, shake, and fling — the throw follows your hand.
- **Formulas**: `3d6 + 2`, `2d20kh1` (advantage), `4d6dl1` (drop the lowest), `1d100`, and so on.
- **CoC checks**: enter a skill value and get critical / extreme / hard / regular success, failure or fumble. Bonus and penalty dice really throw an extra tens die.
- **Take a closer look**: the camera leans in once the dice settle; scroll to zoom, middle-drag to rotate, right-drag to pan.
- **Chinese and English**: switch in the top-right corner; the English page lives at [`?lang=en`](https://fftyyy.github.io/ScriptoriumAleae/?lang=en).
- Plays at 0.35× by default so you can follow the tumble, with a switch to real speed; collision sounds, a roll log, and a phone layout.

## Running locally

Requires Node.js 22 or later.

```bash
npm install
npm run dev
```

`npm run build` produces a fully static site in `dist/`. Pushing to `main` makes GitHub Actions publish it to GitHub Pages.

## Built with

TypeScript, React, three.js, cannon-es and Vite. The wood, felt, leather and parchment in the scene, and the dice patterns and numerals, are all generated in code — no image assets.

## License

[MIT](LICENSE)
