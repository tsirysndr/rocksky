export const SCRAMBLE_DURATION = 1200;
export const SCRAMBLE_PAUSE = 2600;
const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const blocks = "░▒▓█";

// A center-out wave briefly scrambles each character, then restores it.
export function scrambleFrame(
  text: string,
  elapsed: number,
  random = Math.random,
): string {
  if (elapsed < 0 || elapsed >= SCRAMBLE_DURATION) return text;
  const center = (text.length - 1) / 2;
  return Array.from(text, (character, index) => {
    if (/\s/.test(character)) return character;
    const age =
      elapsed - (Math.abs(index - center) / Math.max(center, 1)) * 900;
    if (age < 0 || age >= 300) return character;
    if (age < 100) return blocks[Math.min(3, Math.floor(age / 25))];
    return letters[Math.floor(random() * letters.length)];
  }).join("");
}
