/* Made-up demo data for the TEST site: about 60 colleges (the IITs, the NITs, Manipal, BITS and others), students with
   profiles, projects at every stage, reviews, vouches, skills confirmed by teammates, and clubs.

     node scripts/demo-data.js [database file]           add it (does nothing if it is already there)
     node scripts/demo-data.js [database file] --wipe    remove every made-up person, project, club and college

   It refuses to touch a database that looks like the live site's: see `guard` below. The people are invented. They get no
   email address and no GitHub link, so no real person's account or repository is ever involved, and the same names and
   numbers come out every run. Everything it makes is tagged ("demo:" on people, requested_by=0 on colleges), so --wipe
   finds all of it and nothing else. */
const Database = require("better-sqlite3");

const args = process.argv.slice(2).filter((a) => a !== "-");
const wipe = args.includes("--wipe");
const file = args.find((a) => !a.startsWith("--")) || process.env.DATABASE_PATH || "./data/connect.db";
const db = new Database(file, { timeout: 30000 });
const now = Math.floor(Date.now() / 1000), DAY = 86400;

// The live site has real people who signed in with Google or LinkedIn. The test site, a local copy or a fresh file
// does not (only sample people). Refuse unless the database says it is not the live one.
function guard() {
  const env = process.env.RAILWAY_ENVIRONMENT_NAME || "";
  if (env === "production" && !process.env.DEMO_DATA_ON_PRODUCTION) throw new Error("This is the live site's database. Demo data goes on the test site only.");
  const real = db.prepare("SELECT COUNT(*) n FROM users WHERE sub LIKE 'google:%' OR sub LIKE 'linkedin:%'").get().n;
  if (real > 25 && !process.env.DEMO_DATA_ANYWAY) throw new Error(`${real} people here signed in with Google or LinkedIn; this looks like a real site. Set DEMO_DATA_ANYWAY=1 to go ahead.`);
}

// A small seeded random generator, so every run makes the same data.
let seed = 20261121;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const some = (a, n) => { const c = [...a], out = []; while (out.length < n && c.length) out.push(c.splice(Math.floor(rnd() * c.length), 1)[0]); return out; };

const COLLEGES = [
  // [short link, name, student email domains]
  ["iitb", "IIT Bombay", "iitb.ac.in"], ["iitd", "IIT Delhi", "iitd.ac.in"], ["iitm", "IIT Madras", "iitm.ac.in"], ["iitk", "IIT Kanpur", "iitk.ac.in"],
  ["iitkgp", "IIT Kharagpur", "iitkgp.ac.in"], ["iitr", "IIT Roorkee", "iitr.ac.in"], ["iitg", "IIT Guwahati", "iitg.ac.in"], ["iith", "IIT Hyderabad", "iith.ac.in"],
  ["iiti", "IIT Indore", "iiti.ac.in"], ["iitbhu", "IIT (BHU) Varanasi", "iitbhu.ac.in"], ["iitism", "IIT (ISM) Dhanbad", "iitism.ac.in"], ["iitrpr", "IIT Ropar", "iitrpr.ac.in"],
  ["iitbbs", "IIT Bhubaneswar", "iitbbs.ac.in"], ["iitgn", "IIT Gandhinagar", "iitgn.ac.in"], ["iitj", "IIT Jodhpur", "iitj.ac.in"], ["iitp", "IIT Patna", "iitp.ac.in"],
  ["iitmandi", "IIT Mandi", "iitmandi.ac.in"], ["iittp", "IIT Tirupati", "iittp.ac.in"], ["iitpkd", "IIT Palakkad", "iitpkd.ac.in"], ["iitjammu", "IIT Jammu", "iitjammu.ac.in"],
  ["iitdh", "IIT Dharwad", "iitdh.ac.in"], ["iitbhilai", "IIT Bhilai", "iitbhilai.ac.in"], ["iitgoa", "IIT Goa", "iitgoa.ac.in"],
  ["nitt", "NIT Tiruchirappalli", "nitt.edu"], ["nitk", "NIT Karnataka, Surathkal", "nitk.edu.in"], ["nitw", "NIT Warangal", "nitw.ac.in"], ["nitc", "NIT Calicut", "nitc.ac.in"],
  ["nitrkl", "NIT Rourkela", "nitrkl.ac.in"], ["mnnit", "MNNIT Allahabad", "mnnit.ac.in"], ["mnit", "MNIT Jaipur", "mnit.ac.in"], ["vnit", "VNIT Nagpur", "vnit.ac.in"],
  ["svnit", "SVNIT Surat", "svnit.ac.in"], ["nitkkr", "NIT Kurukshetra", "nitkkr.ac.in"], ["nitdgp", "NIT Durgapur", "nitdgp.ac.in"], ["manit", "MANIT Bhopal", "manit.ac.in"],
  ["nits", "NIT Silchar", "nits.ac.in"], ["nith", "NIT Hamirpur", "nith.ac.in"], ["nitj", "NIT Jalandhar", "nitj.ac.in"], ["nitjsr", "NIT Jamshedpur", "nitjsr.ac.in"],
  ["nitp", "NIT Patna", "nitp.ac.in"], ["nitrr", "NIT Raipur", "nitrr.ac.in"], ["nitsri", "NIT Srinagar", "nitsri.ac.in"], ["nita", "NIT Agartala", "nita.ac.in"],
  ["nitdelhi", "NIT Delhi", "nitdelhi.ac.in"], ["nitgoa", "NIT Goa", "nitgoa.ac.in"], ["nitpy", "NIT Puducherry", "nitpy.ac.in"], ["nituk", "NIT Uttarakhand", "nituk.ac.in"],
  ["nitandhra", "NIT Andhra Pradesh", "nitandhra.ac.in"], ["nitsikkim", "NIT Sikkim", "nitsikkim.ac.in"], ["nitm", "NIT Meghalaya", "nitm.ac.in"], ["nitmanipur", "NIT Manipur", "nitmanipur.ac.in"],
  ["nitmz", "NIT Mizoram", "nitmz.ac.in"], ["nitnagaland", "NIT Nagaland", "nitnagaland.ac.in"], ["nitap", "NIT Arunachal Pradesh", "nitap.ac.in"],
  ["manipal", "Manipal Institute of Technology", "manipal.edu"], ["bits", "BITS Pilani", "bits-pilani.ac.in"], ["vit", "VIT Vellore", "vit.ac.in,vitstudent.ac.in"],
  ["iiith", "IIIT Hyderabad", "iiit.ac.in"], ["iiitd", "IIIT Delhi", "iiitd.ac.in"], ["iiitb", "IIIT Bangalore", "iiitb.ac.in"], ["dtu", "Delhi Technological University (DTU)", "dtu.ac.in"],
  ["nsut", "Netaji Subhas University of Technology", "nsut.ac.in"], ["coep", "COEP Technological University", "coeptech.ac.in"], ["vjti", "VJTI Mumbai", "vjti.ac.in"],
  ["jadavpur", "Jadavpur University", "jadavpuruniversity.in"], ["thapar", "Thapar Institute", "thapar.edu"], ["pes", "PES University", "pes.edu"], ["srm", "SRM Institute", "srmist.edu.in"],
  ["dau", "Dhirubhai Ambani University (DAU)", "dau.ac.in,daiict.ac.in"], ["pdeu", "Pandit Deendayal Energy University (PDEU)", "pdpu.ac.in"], ["cept", "CEPT University", "cept.ac.in"],
];

const FIRST = ["Aarav", "Vivaan", "Aditya", "Arjun", "Sai", "Reyansh", "Krishna", "Ishaan", "Rohan", "Kabir", "Ananya", "Diya", "Saanvi", "Aadhya", "Kavya", "Ira", "Myra", "Meera",
  "Priya", "Riya", "Neha", "Sneha", "Tanvi", "Pooja", "Nikhil", "Rahul", "Karthik", "Varun", "Siddharth", "Harsh", "Yash", "Dev", "Omkar", "Pranav", "Aniket", "Shreya", "Aditi",
  "Nandini", "Lakshmi", "Divya", "Swathi", "Keerthana", "Arjit", "Manish", "Abhinav", "Ritika", "Simran", "Gurpreet", "Harpreet", "Zoya", "Ayaan", "Farhan", "Sana", "Imran", "Joel",
  "Neil", "Tenzin", "Lalremruata", "Bhaskar", "Debanjan", "Sourav", "Ankita", "Bipasha", "Arnav", "Vihaan", "Mihir", "Parth", "Hetvi", "Jinal", "Dhruv", "Anushka", "Rishi"];
const LAST = ["Sharma", "Verma", "Iyer", "Nair", "Reddy", "Rao", "Patel", "Shah", "Mehta", "Desai", "Kulkarni", "Joshi", "Deshpande", "Patil", "Pawar", "Gupta", "Agarwal", "Singh",
  "Kaur", "Gill", "Chatterjee", "Banerjee", "Mukherjee", "Das", "Bose", "Ghosh", "Menon", "Pillai", "Krishnan", "Subramanian", "Naidu", "Choudhary", "Yadav", "Mishra", "Tiwari",
  "Pandey", "Khan", "Ansari", "Qureshi", "Fernandes", "D'Souza", "Thomas", "Mathew", "Bhutia", "Sangma", "Hazarika", "Borah", "Saikia", "Jain", "Bhatt", "Trivedi", "Rathod"];

// Branches, and the skills people in each tend to have (lowercase, as the skills engine stores them).
const BRANCHES = {
  CSE: ["react", "node", "python", "typescript", "next.js", "django", "postgres", "docker", "flutter", "kotlin", "pytorch", "go"],
  "AI and Data Science": ["python", "pytorch", "tensorflow", "pandas", "sql", "llms", "computer vision", "fastapi"],
  ECE: ["embedded c", "esp32", "arduino", "verilog", "pcb design", "matlab", "stm32", "signal processing"],
  EE: ["matlab", "power electronics", "simulink", "esp32", "pcb design", "python"],
  Mechanical: ["solidworks", "ansys", "cad", "3d printing", "arduino", "matlab"],
  Civil: ["autocad", "revit", "gis", "python", "staad pro"],
  Chemical: ["python", "aspen plus", "matlab", "data analysis"],
  "Design": ["figma", "ui design", "illustrator", "blender", "user research"],
};
const BRANCH_NAMES = Object.keys(BRANCHES);
const ABOUT = ["Likes building things people actually use.", "Weekend hackathons, weekday robotics.", "Into backend systems and good coffee.", "Learning by shipping, one project at a time.",
  "Interested in climate tech and IoT.", "Making campus life a little less chaotic.", "Design first, then code.", "Competitive programmer turned product builder.", "Open to joining a serious team.",
  "Hardware tinkerer. Owns too many ESP32s.", "Building ML tools for Indian languages.", "Here to find teammates who finish things."];

// Projects: a name, what it does, the skills it uses and its milestones.
const PROJECTS = [
  ["CampusRide", "Shared autos and cabs between campus and the railway station, booked in a WhatsApp-like chat", ["react", "node", "postgres"], ["Booking flow", "Driver app", "100 rides"]],
  ["MessMate", "Daily mess menus with ratings, so the kitchen knows what to cook less of", ["flutter", "python", "fastapi"], ["Menu feed", "Ratings", "Mess committee dashboard"]],
  ["LabSlot", "Booking lab equipment by the hour instead of a paper register", ["next.js", "postgres", "typescript"], ["Booking calendar", "Admin approval", "Live in two labs"]],
  ["AquaSense", "Low-cost water quality monitor for hostel tanks with SMS alerts", ["esp32", "embedded c", "pcb design"], ["Sensor board", "SMS alerts", "Installed in 3 hostels"]],
  ["Lipi", "Handwriting recognition for Indian scripts on cheap phones", ["pytorch", "python", "computer vision"], ["Dataset", "Model above 90%", "Android demo"]],
  ["PrintQueue", "Queue for the campus print shop that tells you when your pages are ready", ["react", "node", "docker"], ["Upload and pay", "Shop screen", "500 jobs"]],
  ["SolarLog", "Logging rooftop solar output across buildings to spot faulty panels", ["esp32", "python", "matlab"], ["Data logger", "Dashboard", "Fault alerts"]],
  ["FestPass", "QR passes and entry for the cultural fest, without the long gate queues", ["flutter", "node", "postgres"], ["Pass generation", "Scanner app", "Used at fest"]],
  ["NoteSwap", "Students share and rate notes per course, verified by who took the course", ["next.js", "postgres", "typescript"], ["Upload notes", "Course pages", "Ratings"]],
  ["Robocon Bot", "Line follower and pick-and-place robot for Robocon", ["embedded c", "stm32", "solidworks"], ["Chassis", "Line following", "Pick and place"]],
  ["HostelFix", "Hostel complaints with photos, tracked until the warden closes them", ["kotlin", "django", "postgres"], ["Complaint form", "Warden view", "Live in 2 hostels"]],
  ["PlaceTrack", "Placement prep tracker with company-wise question banks from seniors", ["react", "django", "postgres"], ["Question bank", "Mock schedule", "Used by 200 students"]],
  ["KrishiDrone", "Drone that maps crop health with a cheap multispectral camera", ["python", "computer vision", "arduino"], ["Frame build", "Camera rig", "Field trial"]],
  ["SignBridge", "Real-time Indian Sign Language to text on a laptop webcam", ["pytorch", "python", "fastapi"], ["Gesture dataset", "Model", "Web demo"]],
  ["GreenGrid", "Smart plugs that cut standby power in labs at night", ["esp32", "embedded c", "react"], ["Plug prototype", "Scheduler", "One lab for a month"]],
  ["BusPing", "Live location of the college buses, shared by the driver's phone", ["flutter", "node", "go"], ["Driver app", "Student map", "All routes live"]],
  ["CodeDojo", "Weekly coding contests run by the coding club, with an auto-judge", ["go", "docker", "react"], ["Judge", "Contest page", "10 contests run"]],
  ["Saathi", "Peer mental-health check-ins, anonymous and moderated by trained students", ["react", "node", "ui design"], ["Check-in flow", "Moderator tools", "Pilot with 50 students"]],
  ["CircuitSim", "Browser circuit simulator for first-year electronics labs", ["typescript", "react", "signal processing"], ["Editor", "Simulation", "Used in one lab"]],
  ["Bridge3D", "3D printed truss bridge models with load testing results", ["solidworks", "3d printing", "ansys"], ["Designs", "Prints", "Load tests"]],
  ["Granth", "Library seat booking and quiet-zone noise meter", ["esp32", "next.js", "postgres"], ["Seat booking", "Noise meter", "Library pilot"]],
  ["Udaan", "Scholarship finder that matches students to schemes they qualify for", ["python", "django", "llms"], ["Scheme database", "Matching", "1,000 searches"]],
  ["MetroMap", "Accessible indoor maps of the campus for wheelchair users", ["figma", "react", "gis"], ["Survey", "Map app", "Two buildings mapped"]],
  ["TinyML Bird", "Bird call recognition on a microcontroller for campus biodiversity counts", ["tensorflow", "esp32", "python"], ["Dataset", "On-device model", "Week-long count"]],
];
const ROLES = { react: "Frontend", "next.js": "Frontend", typescript: "Frontend", flutter: "App", kotlin: "App", node: "Backend", django: "Backend", fastapi: "Backend", go: "Backend",
  postgres: "Backend", docker: "DevOps", python: "ML", pytorch: "ML", tensorflow: "ML", "computer vision": "ML", llms: "ML", esp32: "Hardware", "embedded c": "Firmware",
  stm32: "Firmware", arduino: "Hardware", "pcb design": "Hardware", solidworks: "Mechanical", ansys: "Mechanical", "3d printing": "Mechanical", matlab: "Analysis",
  "signal processing": "Signals", figma: "Design", "ui design": "Design", gis: "Mapping" };
const CLUBS = [["Coding Club", "Contests, workshops and a weekly build night"], ["Robotics Club", "Robocon, line followers and everything with motors"],
  ["E-Cell", "Startups, pitch nights and founder talks"], ["Design Club", "UI, posters and the fest's whole look"], ["AI Club", "Paper reading and Kaggle nights"],
  ["Electronics Club", "PCBs, soldering and a lab that is always open"], ["Astronomy Club", "Night sky sessions and a homemade telescope"]];

function remove() {
  const ids = db.prepare("SELECT id FROM users WHERE sub LIKE 'demo:%'").all().map((r) => r.id);
  const pids = db.prepare(`SELECT id FROM projects WHERE lead_id IN (SELECT id FROM users WHERE sub LIKE 'demo:%')`).all().map((r) => r.id);
  const cids = db.prepare(`SELECT id FROM clubs WHERE lead_id IN (SELECT id FROM users WHERE sub LIKE 'demo:%')`).all().map((r) => r.id);
  const inList = (xs) => (xs.length ? xs.join(",") : "-1");
  db.transaction(() => {
    for (const t of ["members", "milestones", "proofs", "project_skills", "member_skills", "reviews", "review_log", "updates", "roles", "follows", "comments", "requests", "allocations", "review_invites", "live_checks", "proof_checks", "project_seen"])
      try { db.exec(`DELETE FROM ${t} WHERE project_id IN (${inList(pids)})`); } catch { /* table not in this version */ }
    db.exec(`DELETE FROM role_skills WHERE role_id NOT IN (SELECT id FROM roles)`);
    db.exec(`DELETE FROM projects WHERE id IN (${inList(pids)})`);
    db.exec(`DELETE FROM club_members WHERE club_id IN (${inList(cids)})`);
    db.exec(`DELETE FROM clubs WHERE id IN (${inList(cids)})`);
    for (const t of ["club_members", "members", "follows", "notifications", "activity", "project_seen", "identities"]) try { db.exec(`DELETE FROM ${t} WHERE user_id IN (${inList(ids)})`); } catch { /* */ }
    db.exec(`DELETE FROM vouches WHERE from_id IN (${inList(ids)}) OR to_id IN (${inList(ids)})`);
    db.exec(`DELETE FROM users WHERE id IN (${inList(ids)})`);
    // Colleges this script opened, once nobody real is in them.
    db.exec("DELETE FROM colleges WHERE requested_by=0 AND id NOT IN (SELECT DISTINCT college_id FROM users WHERE college_id IS NOT NULL)");
  })();
  console.log(`Removed ${ids.length} made-up people, ${pids.length} projects and ${cids.length} clubs.`);
}

function add() {
  if (db.prepare("SELECT 1 FROM users WHERE sub LIKE 'demo:%' LIMIT 1").get()) { console.log("Demo data is already here. Run with --wipe first to make it again."); return; }
  const owned = db.prepare("SELECT id, domains FROM colleges").all();
  const collegeFor = (domains) => owned.find((c) => c.domains.split(",").some((d) => domains.split(",").includes(d.trim())));
  const U = db.prepare(`INSERT INTO users (sub, name, branch, grad_year, role, about, verified, skills, onboarded, created_at, college_id, open_to_join, last_login_at)
    VALUES (?,?,?,?,?,?,1,?,1,?,?,?,?)`);
  const P = db.prepare("INSERT INTO projects (name, pitch, status, lead_id, pot, created_at, shipped_at, college_id, invited_at) VALUES (?,?,?,?,?,?,?,?,?)");
  const M = db.prepare("INSERT INTO members (project_id, user_id, role, did, status, stake, left_at) VALUES (?,?,?,?,?,?,?)");
  const run = (sql, ...a) => db.prepare(sql).run(...a);
  let people = 0, projects = 0, clubs = 0, opened = 0;

  db.transaction(() => {
    for (const [slug, name, domains] of COLLEGES) {
      let college = collegeFor(domains);
      if (!college) {
        let s = slug; for (let i = 2; db.prepare("SELECT 1 FROM colleges WHERE slug=?").get(s); i++) s = `${slug}-${i}`;
        const id = Number(run("INSERT INTO colleges (slug, name, domains, status, requested_by, created_at) VALUES (?,?,?,'active',0,?)", s, name, domains, now - int(200, 400) * DAY).lastInsertRowid);
        college = { id, domains }; owned.push(college); opened++;
      }
      // Students, and a couple of alumni.
      const size = int(9, 16), ids = [];
      const used = new Set();
      for (let i = 0; i < size; i++) {
        let full; do full = `${pick(FIRST)} ${pick(LAST)}`; while (used.has(full)); used.add(full);
        const branch = pick(BRANCH_NAMES), skills = some(BRANCHES[branch], int(2, 4));
        const alum = i >= size - 2 && rnd() < 0.5;
        const joined = now - int(90, 560) * DAY;
        const id = Number(U.run(`demo:${slug}:${i}`, full, branch, alum ? int(2018, 2024) : int(2026, 2029), alum ? "alum" : "student", pick(ABOUT),
          skills.map((k) => k.replace(/\b\w/g, (c) => c.toUpperCase())).join(", "), joined, college.id, rnd() < 0.4 ? 1 : 0, now - int(0, 20) * DAY).lastInsertRowid);
        ids.push({ id, branch, skills, joined, alum }); people++;
      }
      const students = ids.filter((x) => !x.alum);
      // Projects at every stage. Shipped ones have reviews, teammate skill ticks and vouches behind them.
      for (const [pname, pitch, pskills, ms] of some(PROJECTS, int(4, 7))) {
        if (students.length < 4) break;
        const team = some(students, int(2, 4)), lead = team[0];
        let status = pick(["shipped", "shipped", "shipped", "building", "recruiting", "review"]);
        const start = Math.max(...team.map((t) => t.joined)) + int(5, 40) * DAY;
        if (start > now - 10 * DAY) continue;
        // A project ships one to five months after it starts; one that could not have finished yet is still being built.
        let shippedAt = status === "shipped" ? start + int(30, 140) * DAY : null;
        if (shippedAt && shippedAt > now - 2 * DAY) { status = "building"; shippedAt = null; }
        const pot = status === "shipped" ? pick([100, 100, 60]) : 0;
        const pid = Number(P.run(pname, pitch, status, lead.id, pot, start, shippedAt, college.id, status === "review" ? now - int(1, 6) * DAY : null).lastInsertRowid);
        projects++;
        for (const t of team) {
          const k = pick(pskills);
          M.run(pid, t.id, ROLES[k] || "Member", `Built the ${k} side of it`, "active", 0, null);
        }
        for (const k of pskills) run("INSERT OR IGNORE INTO project_skills (project_id, skill) VALUES (?,?)", pid, k);
        ms.forEach((m, i) => run("INSERT INTO milestones (project_id, title, done) VALUES (?,?,?)", pid, m, status === "shipped" || status === "review" || i === 0 ? 1 : 0));
        run("INSERT INTO proofs (project_id, label, url) VALUES (?,?,?)", pid, "Demo", `https://example.com/demo/${slug}/${pname.toLowerCase().replace(/\W+/g, "-")}`);
        run("INSERT INTO updates (project_id, user_id, kind, text, created_at) VALUES (?,?,'event',?,?)", pid, lead.id, "Posted the project", start);
        if (status === "recruiting") for (const k of some(pskills, 2)) run("INSERT INTO roles (project_id, title, note, open) VALUES (?,?,?,1)", pid, ROLES[k] || "Builder", `Someone comfortable with ${k}`);
        if (status !== "shipped") continue;
        // Two outside reviewers agreed on the pot, each teammate ticked the skills the others used, some vouched.
        const outside = students.filter((s) => !team.includes(s));
        for (const r of some(outside, 2)) {
          run("INSERT OR IGNORE INTO reviews (project_id, reviewer_id, verdict, note) VALUES (?,?,?,?)", pid, r.id, pot, "Opened the demo and it works as described.");
          run("INSERT INTO review_log (project_id, reviewer_id, verdict, outcome, created_at) VALUES (?,?,?,?,?)", pid, r.id, pot, pot, shippedAt);
        }
        for (const t of team) for (const by of team) if (by !== t)
          for (const k of some(pskills, 2)) run("INSERT OR IGNORE INTO member_skills (project_id, user_id, skill, by_id) VALUES (?,?,?,?)", pid, t.id, k, by.id);
        for (const a of team) for (const b of team) if (a !== b && rnd() < 0.35)
          run("INSERT OR IGNORE INTO vouches (from_id, to_id, created_at) VALUES (?,?,?)", a.id, b.id, shippedAt + int(1, 30) * DAY > now ? now : shippedAt + int(1, 30) * DAY);
        run("INSERT INTO updates (project_id, user_id, kind, text, created_at) VALUES (?,?,'event',?,?)", pid, null, `Shipped with a pot of ${pot}`, shippedAt);
      }
      // Two or three clubs, each with a lead and confirmed members.
      for (const [cname, about] of some(CLUBS, int(2, 3))) {
        const crew = some(students, int(3, 6));
        if (!crew.length) break;
        const cid = Number(run("INSERT INTO clubs (name, about, lead_id, college_id, status, created_by, created_at) VALUES (?,?,?,?,'active',?,?)", cname, about, crew[0].id, college.id, crew[0].id, now - int(60, 300) * DAY).lastInsertRowid);
        crew.forEach((c, i) => run("INSERT OR IGNORE INTO club_members (club_id, user_id, role, confirmed) VALUES (?,?,?,1)", cid, c.id, i === 0 ? "Lead" : pick(["Member", "Member", "Core team", "Events"])));
        clubs++;
      }
    }
  })();
  console.log(`Added ${opened} colleges, ${people} made-up people, ${projects} projects and ${clubs} clubs.`);
}

guard();
if (wipe) remove(); else add();
