import words from "../assets/words.json" with { type: "json" }

export function generateName() {
  const { adjectives, nouns } = words
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  return `${adjective}-${noun}`
}
