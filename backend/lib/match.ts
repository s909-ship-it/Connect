/* Turns a role's title into the skills it probably means, for roles whose lead has not listed any.
   Ranking people for a role lives in lib/relevance.ts. */

/* Words that often appear in role titles, and the skills they usually mean. */
const RELATED: Record<string, string[]> = {
  frontend: ["react", "next.js", "nextjs", "vue", "angular", "javascript", "typescript", "html", "css", "ui"],
  backend: ["node", "python", "fastapi", "django", "flask", "java", "go", "sql", "postgres", "api"],
  mobile: ["flutter", "react native", "android", "ios", "kotlin", "swift"],
  app: ["flutter", "react native", "android", "ios"],
  hardware: ["esp32", "arduino", "embedded c", "pcb design", "sensors", "stm32", "verilog", "fpga"],
  rfid: ["esp32", "arduino", "embedded c", "sensors"],
  firmware: ["embedded c", "esp32", "stm32", "arduino"],
  ml: ["ml", "python", "pytorch", "tensorflow", "ai"],
  search: ["ml", "python", "elasticsearch", "ai"],
  design: ["figma", "ui design", "product", "ui"],
  ui: ["figma", "ui design", "react"],
  control: ["pid", "control systems", "matlab", "embedded c", "mechanisms"],
  pid: ["control systems", "matlab", "embedded c"],
  cad: ["cad", "3d printing", "mechanisms"],
  mechanical: ["cad", "3d printing", "mechanisms"],
};

const norm = (s: string) => s.toLowerCase().trim();
const words = (s: string) => norm(s).split(/[^a-z0-9.+#]+/).filter(Boolean);

/* The skills a role title asks for: the title's own words plus related skills. */
export function roleSkills(title: string): Set<string> {
  const out = new Set<string>();
  for (const w of words(title)) {
    out.add(w);
    for (const r of RELATED[w] ?? []) out.add(r);
  }
  return out;
}

function matches(skill: string, wanted: Set<string>) {
  const s = norm(skill);
  if (wanted.has(s)) return true;
  // "React" matches "react frontend"; "Embedded C" matches "embedded"
  return words(s).some((w) => w.length > 2 && wanted.has(w));
}

/* The skills from a person's list that an open role asks for. Used for the board's "Fits you" filter. */
export function fitFor(title: string, skills: string[]): string[] {
  const wanted = roleSkills(title);
  return skills.filter((k) => matches(k, wanted));
}
