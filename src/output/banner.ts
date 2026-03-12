function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function colorChar(char: string, hue: number): string {
  const [r, g, b] = hslToRgb(hue % 360, 100, 60);
  return `\x1b[38;2;${r};${g};${b}m${char}\x1b[0m`;
}

function rainbowLine(text: string, hueOffset: number): string {
  const hueStep = 360 / text.length;
  return text
    .split("")
    .map((char, i) => colorChar(char, (hueOffset + i * hueStep) % 360))
    .join("");
}

const TITLE = "  Super Ghost  ";
const BANNER_LINES = [
  `   👻${TITLE}👻`,
  `  ─────────────────────`,
  `  AI-powered E2E testing`,
];

function renderBanner(hueOffset: number): string[] {
  return [
    `   👻${rainbowLine(TITLE, hueOffset)}👻`,
    `  \x1b[2m─────────────────────\x1b[0m`,
    `  \x1b[2mAI-powered E2E testing\x1b[0m`,
  ];
}

const FRAMES = 15;
const FRAME_MS = 60;
const HUE_STEP = 24;

export async function animateBanner(): Promise<void> {
  const isTTY = process.stdout.isTTY === true;

  if (!isTTY) {
    const lines = BANNER_LINES;
    process.stdout.write(lines.join("\n") + "\n\n");
    return;
  }

  process.stdout.write("\x1b[?25l"); // hide cursor

  try {
    for (let frame = 0; frame < FRAMES; frame++) {
      const lines = renderBanner(frame * HUE_STEP);
      if (frame > 0) {
        // Move cursor up N lines to overwrite previous frame
        process.stdout.write(`\x1b[${lines.length}A`);
      }
      process.stdout.write(lines.join("\n") + "\n");

      if (frame < FRAMES - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, FRAME_MS));
      }
    }
    process.stdout.write("\n");
  } finally {
    process.stdout.write("\x1b[?25h"); // restore cursor
  }
}
