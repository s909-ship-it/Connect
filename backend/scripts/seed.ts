/* Wipes the database and fills it with invented sample people and projects for local development.
   Run with: npm run seed            Never run this against real data. */
import { db, run, now, TABLES } from "../lib/db";

if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production.");

const MONTH = 30 * 86400;
const ago = (months: number) => now() - Math.round(months * MONTH);
const ids: Record<string, number> = {};

db.transaction(() => {
  for (const t of TABLES) run(`DELETE FROM ${t}`);

  const person = (key: string, name: string, branch: string, year: number, skills: string, extra: Record<string, unknown> = {}) => {
    const o = { role: "student", verified: 1, admin: 0, about: "", ...extra };
    ids[key] = Number(run(
      "INSERT INTO users (sub, name, email, branch, grad_year, role, verified, admin, skills, about, onboarded, college_email, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)",
      `seed:${key}`, name, `${key}@example.com`, branch, year, o.role, o.verified, o.admin, skills, o.about,
      o.role === "student" && o.verified ? `${key}@college.example` : null, ago(14)).lastInsertRowid);
  };
  person("ishaan", "Ishaan Deshmukh", "ECE", 2027, "Embedded C, ESP32, PCB design");
  person("riya", "Riya Patil", "CSE", 2027, "React, Node, Figma");
  person("kabir", "Kabir Shaikh", "CSE", 2026, "Python, ML, FastAPI");
  person("tanvi", "Tanvi Kulkarni", "CSE", 2026, "Product, UI design, Next.js", { admin: 1 });
  person("sneha", "Sneha Jadhav", "IT", 2028, "Flutter, Firebase");
  person("arjun", "Arjun Mane", "Mech", 2027, "CAD, 3D printing, Mechanisms");
  person("omkar", "Omkar Pawar", "ECE", 2028, "Verilog, FPGA, Sensors");
  person("dev", "Dev Rathod", "CSE", 2027, "AI, Web3, Leadership", { about: "Founder | AI | Web3 | Building the future" });
  person("nikhil", "Nikhil Gaikwad", "CSE", 2029, "Python", { verified: 0 });
  person("meera", "Meera Joshi", "CSE", 2016, "", { role: "alum", about: "Senior engineer, payments" });
  person("rohan", "Rohan Bhosale", "Mech", 2012, "", { role: "alum", about: "Founder, EV components" });
  person("priya", "Priya Nair", "ECE", 2019, "", { role: "alum", verified: 0, about: "Hardware engineer" });
  // Students who said they are free to join something.
  for (const k of ["sneha", "omkar"]) run("UPDATE users SET open_to_join=1 WHERE id=?", ids[k]);

  for (const c of ["Founder at a stealth AI startup", "Built 10+ full-stack apps", "Web3 expert", "Led a 200-member tech community"])
    run("INSERT INTO claims (user_id, text) VALUES (?,?)", ids.dev, c);

  type Member = [key: string, role: string, did: string, share: number, skills?: string];
  type Spec = {
    name: string; pitch: string; status: string; pot?: number; months: number; team: Member[];
    left?: string[]; proofs?: string[]; posts?: string[]; ms: [string, number][]; roles?: [string, string][];
  };
  const project = (key: string, s: Spec) => {
    const lead = ids[s.team[0][0]];
    const pid = Number(run("INSERT INTO projects (name, pitch, status, lead_id, pot, created_at, shipped_at) VALUES (?,?,?,?,?,?,?)",
      s.name, s.pitch, s.status, lead, s.pot ?? 0, ago(s.months + 3), s.status === "shipped" ? ago(s.months) : null).lastInsertRowid);
    ids[key] = pid;
    s.team.forEach(([k, role, did], i) => run("INSERT INTO members (project_id, user_id, role, did, stake) VALUES (?,?,?,?,?)",
      pid, ids[k], role, did, i > 0 && s.status !== "shipped" ? 10 : 0));
    for (const k of s.left ?? []) run("INSERT INTO members (project_id, user_id, role, status, stake) VALUES (?,?,?,'left',10)", pid, ids[k], "Member");
    for (const label of s.proofs ?? []) run("INSERT INTO proofs (project_id, label, url) VALUES (?,?,?)", pid, label, "https://example.com/" + key);
    for (const [title, done] of s.ms) run("INSERT INTO milestones (project_id, title, done) VALUES (?,?,?)", pid, title, done);
    const log = (text: string, months: number, user: number | null = lead, kind = "event") =>
      run("INSERT INTO updates (project_id, user_id, kind, text, created_at) VALUES (?,?,?,?,?)", pid, user, kind, text, ago(months));
    log("Project posted", s.months + 3);
    s.ms.filter((m) => m[1]).forEach(([title], i) => log(`Milestone done: ${title}`, Math.max(s.months, 0) + 0.2 * (s.ms.length - i)));
    if (s.status === "shipped") log(`Shipped with a pot of ${s.pot}`, s.months, null);
    if (s.status === "review") log("Sent for review", 0.02);
    if (s.status === "dropped") log("Dropped by the lead", s.months);
    for (const text of s.posts ?? []) log(text, 0.05, lead, "post");
    for (const [title, note] of s.roles ?? []) run("INSERT INTO roles (project_id, title, note) VALUES (?,?,?)", pid, title, note);
    // The project's skill list, and each teammate ticking what the others used.
    const used = [...new Set(s.team.flatMap((m) => (m[4] ?? "").split(",").map((k) => k.trim().toLowerCase()).filter(Boolean)))];
    for (const k of used) run("INSERT OR IGNORE INTO project_skills (project_id, skill) VALUES (?,?)", pid, k);
    if (s.status === "shipped")
      for (const [to, , , , list] of s.team) for (const k of (list ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean))
        for (const [from] of s.team) if (from !== to) run("INSERT INTO member_skills (project_id, user_id, skill, by_id) VALUES (?,?,?,?)", pid, ids[to], k, ids[from]);
    // Each teammate splits 100 between the others, in proportion to the intended shares.
    if (s.status === "shipped" && s.team.length > 1)
      for (const [from, , , fromShare] of s.team) {
        const others = s.team.filter((t) => t[0] !== from);
        let left = 100;
        others.forEach(([to, , , share], i) => {
          const pct = i === others.length - 1 ? left : Math.round((share / (100 - fromShare)) * 100);
          left -= pct;
          run("INSERT INTO allocations (project_id, from_id, to_id, pct) VALUES (?,?,?,?)", pid, ids[from], ids[to], pct);
        });
      }
  };

  project("busping", { name: "BusPing", pitch: "Live location of the three college buses, from an ESP32 GPS unit on each one.", status: "shipped", pot: 100, months: 8,
    proofs: ["Live site", "Repo", "Demo video"], ms: [["GPS units on 3 buses", 1], ["Running on all routes for 30 days", 1], ["Handover to transport office", 1]],
    team: [["ishaan", "Hardware", "Built the GPS unit and firmware, fitted it on 3 buses", 40, "embedded c, esp32"], ["riya", "Web app", "Built the map view and arrival alerts", 35, "react, node"], ["arjun", "Enclosure", "Designed and printed the weatherproof case", 25, "cad, 3d printing"]] });
  project("festpass", { name: "FestPass", pitch: "QR entry passes for the annual fest. Scanned 3,100 entries over two days.", status: "shipped", pot: 100, months: 10,
    proofs: ["Repo", "Photos from the fest gate"], ms: [["Booking site", 1], ["Scanners at every gate", 1]],
    team: [["tanvi", "Lead, design", "Ran the project and designed the pass flow", 40, "product, ui design"], ["riya", "Frontend", "Built the booking site and scanner app", 35, "react, node"], ["ishaan", "Scanner rig", "Built offline handheld scanners for the gates", 25, "esp32, embedded c"]] });
  project("solarlog", { name: "SolarLog", pitch: "Temperature logger for the hostel solar water heater, so you know when the water is hot.", status: "shipped", pot: 60, months: 13,
    proofs: ["Repo", "Photos of the installed unit"], ms: [["Sensor board", 1], ["Dashboard", 1]],
    team: [["ishaan", "Firmware", "Built the sensor board and logging firmware", 55, "pcb design, embedded c"], ["omkar", "Sensors", "Calibrated the probes and wrote the dashboard", 45, "sensors"]] });
  project("messmate", { name: "MessMate", pitch: "Daily mess menu with ratings. The mess committee reads the weekly report.", status: "shipped", pot: 100, months: 9,
    proofs: ["Live app", "Repo"], ms: [["Menu and ratings", 1], ["Mobile app", 1], ["Weekly report to the committee", 1]],
    team: [["riya", "Lead, web", "Built the web app and admin panel", 45, "react, node"], ["kabir", "Backend", "Built the API and weekly report job", 30, "python, fastapi"], ["sneha", "Mobile", "Built the Flutter app", 25, "flutter, firebase"]] });
  project("placetrack", { name: "PlaceTrack", pitch: "Tracks placement prep: company-wise questions seniors were actually asked.", status: "shipped", pot: 100, months: 15, left: ["dev"],
    proofs: ["Live site", "Repo"], ms: [["Question bank from 40 seniors", 1], ["Search and tags", 1]],
    team: [["tanvi", "Lead", "Collected the question bank from 40 seniors", 40, "product"], ["kabir", "Backend", "Built search and tagging", 35, "python, ml"], ["riya", "Frontend", "Built the site", 25, "react"]] });
  project("printqueue", { name: "PrintQueue", pitch: "Booking queue for the workshop 3D printer.", status: "shipped", pot: 60, months: 12,
    proofs: ["Repo"], ms: [["Queue running at the workshop", 1]],
    team: [["arjun", "Lead", "Set the queue rules and printer profiles", 60, "3d printing"], ["omkar", "Display", "Built the status display at the printer", 40, "sensors, fpga"]] });
  project("labslot", { name: "LabSlot", pitch: "Book lab equipment by the hour. RFID tap to check out an oscilloscope.", status: "recruiting", months: -1, left: ["dev"],
    proofs: ["Repo"], ms: [["Working booking flow", 1], ["Admin view for lab staff", 1], ["RFID readers on 5 benches", 0], ["One full semester of use", 0]],
    posts: ["Lab staff tried the booking flow on Tuesday. Two benches are live for the pilot."],
    roles: [["Backend (Node)", "Kabir's API needs a second pair of hands"], ["RFID hardware", "One ECE student for the reader units"]],
    team: [["tanvi", "Lead", "Running the project and the lab staff pilot", 0, "product"], ["kabir", "Backend", "Building the booking API", 0, "node, python"]] });
  project("lfr", { name: "Robocon line follower", pitch: "Line follower for the regional Robocon round in February.", status: "recruiting", months: -2,
    proofs: ["Repo", "Chassis photos"], ms: [["Chassis", 1], ["Follows a straight line", 0], ["Full track under 40 seconds", 0]],
    posts: ["Chassis is printed and the motors are mounted. Sensor array goes on this weekend."],
    roles: [["Control / PID tuning", "Someone who has tuned a PID loop before"]],
    team: [["arjun", "Lead, chassis", "Designed the chassis", 0], ["ishaan", "Motor driver", "", 0], ["omkar", "Sensor array", "", 0]] });
  project("noteswap", { name: "NoteSwap", pitch: "Notes and previous-year papers in one searchable place, by subject code.", status: "recruiting", months: -2.9,
    ms: [["Upload and browse", 0], ["Search inside scanned PDFs", 0], ["500 papers uploaded", 0]],
    roles: [["React frontend", "Has a Figma file ready"], ["Search / ML", "Search across scanned PDFs"]],
    team: [["sneha", "Lead", "", 0]] });
  project("hostelfix", { name: "HostelFix", pitch: "Report a broken tap or fan in the hostel and see when it gets fixed.", status: "review", months: -2,
    proofs: ["Live site", "Repo"], ms: [["Report form", 1], ["Warden dashboard", 1]],
    team: [["sneha", "Lead", "Built the report form and app", 0, "flutter, firebase"], ["kabir", "Backend", "Built the warden dashboard", 0, "python, fastapi"]] });
  project("canteenq", { name: "CanteenQ", pitch: "Pre-order from the canteen and skip the queue.", status: "dropped", months: 3,
    ms: [["Menu", 0], ["Ordering", 0]], team: [["dev", "Lead", "", 0]] });

  const vouch = (from: string, to: string) => run("INSERT INTO vouches (from_id, to_id, created_at) VALUES (?,?,?)", ids[from], ids[to], ago(2));
  vouch("riya", "ishaan"); vouch("tanvi", "ishaan"); vouch("tanvi", "riya"); vouch("kabir", "riya"); vouch("riya", "tanvi");
  vouch("riya", "kabir"); vouch("riya", "sneha"); vouch("ishaan", "arjun"); vouch("arjun", "omkar"); vouch("ishaan", "omkar");

  const club = (name: string, about: string, members: [string, string][]) => {
    const cid = run("INSERT INTO clubs (name, about, lead_id) VALUES (?,?,?)", name, about, ids[members[0][0]]).lastInsertRowid;
    for (const [k, role] of members) run("INSERT INTO club_members (club_id, user_id, role, confirmed) VALUES (?,?,?,1)", cid, ids[k], role);
    return cid;
  };
  club("Robotics Club", "Robocon team, weekly build nights in the workshop.", [["arjun", "Lead"], ["ishaan", "Electronics head"], ["omkar", "Member"]]);
  const codecell = club("CodeCell", "The coding club. Runs the fresher bootcamp and the internal hackathon.", [["kabir", "Lead"], ["riya", "Web lead"], ["sneha", "Member"]]);
  club("Design Circle", "Posters, fest branding and product design reviews.", [["tanvi", "Lead"], ["riya", "Member"]]);
  run("INSERT INTO club_members (club_id, user_id, confirmed) VALUES (?,?,0)", codecell, ids.dev);

  const grant = (project: string, alum: string, parts: [number, string, number][]) => {
    const gid = run("INSERT INTO grants (project_id, alum_id, amount) VALUES (?,?,?)", ids[project], ids[alum], parts.reduce((a, p) => a + p[0], 0)).lastInsertRowid;
    for (const [amount, title, paid] of parts) run("INSERT INTO grant_parts (grant_id, title, amount, paid) VALUES (?,?,?,?)", gid, title, amount, paid);
  };
  grant("busping", "meera", [[6000, "GPS units for 3 buses", 1], [6000, "Running on all routes for 30 days", 1], [6000, "Handover to transport office", 1]]);
  grant("labslot", "rohan", [[8000, "Working booking flow", 1], [9000, "RFID readers on 5 benches", 0], [8000, "One full semester of use", 0]]);
  const note = (who: string, text: string, href: string) =>
    run("INSERT INTO notifications (user_id, text, href, created_at) VALUES (?,?,?,?)", ids[who], text, href, ago(0.01));
  note("ishaan", "Riya Patil vouched for you", `/u/${ids.ishaan}`);
  note("ishaan", "HostelFix is ready for review", `/projects/${ids.hostelfix}`);
  note("riya", "HostelFix is ready for review", `/projects/${ids.hostelfix}`);
  note("tanvi", "HostelFix is ready for review", `/projects/${ids.hostelfix}`);
  note("tanvi", "Priya Nair is waiting for alumni approval", "/admin");
  run("INSERT INTO calls (alum_id, title, about, amount, min_credit) VALUES (?,?,?,?,?)", ids.meera, "Campus utility grant", "For anything students on campus would use every week.", 30000, 150);
  run("INSERT INTO calls (alum_id, title, about, amount, min_credit) VALUES (?,?,?,?,?)", ids.rohan, "Hardware build grant", "Parts and fabrication for a physical build. Paid per milestone.", 50000, 250);

  // Everything above lives in one sample college, on the reserved .example domain so it can never match a real one.
  const demo = run("INSERT INTO colleges (slug, name, domains, status, created_at) VALUES ('demo-college','Demo College','college.example','active',?)", ago(30)).lastInsertRowid;
  run("UPDATE users SET college_id=?", demo);
  for (const t of ["projects", "clubs", "calls", "reports"]) run(`UPDATE ${t} SET college_id=?`, demo);
})();

console.log("Seeded sample data. Start the app with `npm run dev` and pick a person on the sign-in page.");
