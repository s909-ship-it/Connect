const Database = require('better-sqlite3');
const path = process.argv[2] || './data/connect.db';
const db = new Database(path);

const now = Math.floor(Date.now() / 1000);
const MONTH = 30 * 86400;
const ago = (months) => now - Math.round(months * MONTH);

db.pragma('journal_mode = WAL');

db.transaction(() => {
  console.log('Adding realistic campus profiles and projects...');

  // Helper to add user if not exists by email
  const userStmt = db.prepare(`
    INSERT INTO users (
      sub, name, email, branch, grad_year, role, about, college_email,
      verified, admin, skills, onboarded, created_at, github, open_to_join, college_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, 1, ?, ?, 1, ?)
  `);

  const getUser = (email) => db.prepare('SELECT id FROM users WHERE email=?').get(email);

  const addPerson = (name, email, branch, year, role, about, skills, github, collegeId) => {
    let u = getUser(email);
    if (!u) {
      const sub = 'seed:' + email.split('@')[0];
      const collegeEmail = email;
      const res = userStmt.run(sub, name, email, branch, year, role, about, collegeEmail, skills, ago(8), github, collegeId);
      return Number(res.lastInsertRowid);
    }
    return u.id;
  };

  // Nirma University Students (college_id: 1)
  const diya = addPerson('Diya Sharma', 'diya.s@nirmauni.ac.in', 'CSE', 2026, 'student',
    'Building vision models for edge robotics. Final year CSE @ Nirma.',
    'PyTorch, FastAPI, Computer Vision, Docker, Python', 'diyasharma-ai', 1);

  const yash = addPerson('Yash Patel', 'yash.p@nirmauni.ac.in', 'ECE', 2027, 'student',
    '3rd year ECE. Hardware prototyping, firmware, and telemetry systems.',
    'Embedded C, ESP32, FreeRTOS, PCB Design, Sensors', 'yashpatel-hw', 1);

  const ananya = addPerson('Ananya Mehta', 'ananya.m@nirmauni.ac.in', 'IT', 2026, 'student',
    'Full-stack engineer. Maintainer of campus open-source utilities.',
    'React, Next.js, TypeScript, PostgreSQL, TailwindCSS', 'ananyamehta-dev', 1);

  const sid = addPerson('Siddharth Shah', 'sid.shah@nirmauni.ac.in', 'Mech', 2027, 'student',
    'Mechanical lead @ Robocon Nirma. 3D printing & rapid prototyping.',
    'CAD, SolidWorks, 3D Printing, Aerodynamics, Mechanisms', 'sidshah-mech', 1);

  const khushi = addPerson('Khushi Trivedi', 'khushi.t@nirmauni.ac.in', 'CSE', 2028, 'student',
    '2nd year CSE. Mobile dev & design systems. Built UI for Nirma Tech Fest.',
    'Flutter, Firebase, Figma, UI Design, Dart', 'khushitrivedi', 1);

  const vikram = addPerson('Vikram Verma', 'vikram@terrarobotics.io', 'ECE', 2020, 'alum',
    'Founder @ TerraRobotics (ex-Nirma ECE \'20). Sponsoring campus hardware builds.',
    'Robotics, Embedded Systems, Hardware Product, Angel Investing', 'vverma-nirma', 1);

  // DAU / DAIICT Student (college_id: 2)
  const kavya = addPerson('Kavya Nair', 'kavya.nair@dau.ac.in', 'CSE', 2026, 'student',
    'Systems programmer @ DAU. Working on low-latency data pipelines & compilers.',
    'Rust, Distributed Systems, WebAssembly, C++', 'kavyanair-dau', 2);

  // DTU Student (college_id: 3)
  const pranav = addPerson('Pranav Joshi', 'pranav.j@dtu.ac.in', 'ECE', 2027, 'student',
    'DTU Robotics. Autonomous navigation, SLAM, and point cloud processing.',
    'ROS2, C++, SLAM, Autonomous Vehicles, Python', 'pranav-dtu', 3);

  // VOUCHES between Nirma students
  const vouchStmt = db.prepare('INSERT OR IGNORE INTO vouches (from_id, to_id, created_at) VALUES (?, ?, ?)');
  vouchStmt.run(yash, ananya, ago(4));
  vouchStmt.run(ananya, yash, ago(4));
  vouchStmt.run(yash, sid, ago(3));
  vouchStmt.run(sid, yash, ago(3));
  vouchStmt.run(diya, yash, ago(2));
  vouchStmt.run(yash, diya, ago(2));
  vouchStmt.run(ananya, khushi, ago(2));
  vouchStmt.run(khushi, ananya, ago(2));

  // If user 1 (Aaditya) exists, add friendly vouches & notifications
  const user1 = db.prepare('SELECT id, name FROM users WHERE id=1').get();
  if (user1) {
    // Param (user 2) vouches for Aaditya
    const user2 = db.prepare('SELECT id FROM users WHERE id=2').get();
    if (user2) {
      vouchStmt.run(user2.id, 1, ago(1));
    }
    // Yash and Ananya also vouch for Aaditya
    vouchStmt.run(yash, 1, ago(1));
    vouchStmt.run(ananya, 1, ago(1));
  }

  // PROJECTS
  const getProj = (name) => db.prepare('SELECT id FROM projects WHERE name=?').get(name);

  // 1. NirmaTransit (Shipped)
  let p1 = getProj('NirmaTransit');
  if (!p1) {
    const res = db.prepare(`
      INSERT INTO projects (name, pitch, status, lead_id, pot, created_at, shipped_at, college_id, live_url)
      VALUES (?, ?, 'shipped', ?, 100, ?, ?, 1, 'https://transit.nirmauni.ac.in')
    `).run('NirmaTransit', 'Live GPS location of the three campus shuttles, powered by an ESP32 telemetry tracker on each bus.', yash, ago(6), ago(3));
    const pid = Number(res.lastInsertRowid);

    // Members: Yash (Hardware), Ananya (Web App), Siddharth (Enclosure)
    const memStmt = db.prepare('INSERT INTO members (project_id, user_id, role, did, status, stake) VALUES (?, ?, ?, ?, ?, ?)');
    memStmt.run(pid, yash, 'Hardware & Telemetry', 'Designed ESP32 firmware, GPS antenna matching, and cellular data uplink.', 'active', 0);
    memStmt.run(pid, ananya, 'Full-stack Web App', 'Built the live map UI with Leaflet, websocket alerts, and route playback.', 'active', 0);
    memStmt.run(pid, sid, 'Weatherproof Enclosure', 'Designed IP67 casing, vibration dampening mount, and solar trickle charger.', 'active', 0);

    // Proofs
    const proofStmt = db.prepare('INSERT INTO proofs (project_id, label, url) VALUES (?, ?, ?)');
    proofStmt.run(pid, 'Live Dashboard', 'https://transit.nirmauni.ac.in');
    proofStmt.run(pid, 'GitHub Firmware Repo', 'https://github.com/nirma-robotics/shuttle-gps-fw');
    proofStmt.run(pid, 'Field Testing Photos', 'https://example.com/transit-proofs');

    // Milestones
    const msStmt = db.prepare('INSERT INTO milestones (project_id, title, done) VALUES (?, ?, ?)');
    msStmt.run(pid, 'Custom PCB with SIM7600 and ESP32-S3', 1);
    msStmt.run(pid, 'Live telemetry running for 30 consecutive days', 1);
    msStmt.run(pid, 'Deployment across all 3 Nirma shuttles', 1);

    // Allocations (pot = 100)
    const allocStmt = db.prepare('INSERT INTO allocations (project_id, from_id, to_id, pct) VALUES (?, ?, ?, ?)');
    allocStmt.run(pid, yash, ananya, 60);
    allocStmt.run(pid, yash, sid, 40);
    allocStmt.run(pid, ananya, yash, 70);
    allocStmt.run(pid, ananya, sid, 30);
    allocStmt.run(pid, sid, yash, 60);
    allocStmt.run(pid, sid, ananya, 40);

    // Skills
    const pSkill = db.prepare('INSERT OR IGNORE INTO project_skills (project_id, skill) VALUES (?, ?)');
    for (const s of ['esp32', 'embedded c', 'react', 'typescript', 'cad', 'pcb design']) pSkill.run(pid, s);

    const mSkill = db.prepare('INSERT OR IGNORE INTO member_skills (project_id, user_id, skill, by_id) VALUES (?, ?, ?, ?)');
    mSkill.run(pid, yash, 'esp32', ananya);
    mSkill.run(pid, yash, 'embedded c', sid);
    mSkill.run(pid, yash, 'pcb design', ananya);
    mSkill.run(pid, ananya, 'react', yash);
    mSkill.run(pid, ananya, 'typescript', yash);
    mSkill.run(pid, sid, 'cad', yash);
    mSkill.run(pid, sid, '3d printing', ananya);

    // Updates
    const upStmt = db.prepare('INSERT INTO updates (project_id, user_id, kind, text, created_at) VALUES (?, ?, ?, ?, ?)');
    upStmt.run(pid, yash, 'event', 'Project posted', ago(6));
    upStmt.run(pid, yash, 'event', 'Milestone done: Custom PCB with SIM7600 and ESP32-S3', ago(5));
    upStmt.run(pid, ananya, 'event', 'Milestone done: Live telemetry running for 30 consecutive days', ago(4));
    upStmt.run(pid, yash, 'event', 'Shipped with a pot of 100', ago(3));
    upStmt.run(pid, yash, 'post', 'Shuttles 1, 2, and 3 now broadcast real-time GPS coordinates directly to student portal!', ago(3));
  }

  // 2. BotDrop: Autonomous Campus Delivery Rover (Recruiting!)
  let p2 = getProj('BotDrop');
  if (!p2) {
    const res = db.prepare(`
      INSERT INTO projects (name, pitch, status, lead_id, pot, created_at, college_id)
      VALUES (?, ?, 'recruiting', ?, 0, ?, 1)
    `).run('BotDrop', 'Indoor/outdoor campus rover navigating between Nirma engineering blocks to deliver electronics components and 3D prints.', yash, ago(1.5));
    const pid = Number(res.lastInsertRowid);

    const memStmt = db.prepare('INSERT INTO members (project_id, user_id, role, did, status, stake) VALUES (?, ?, ?, ?, ?, ?)');
    memStmt.run(pid, yash, 'Lead & Powertrain', 'Assembled 4WD skid-steer chassis and dual VESC motor controllers.', 'active', 0);
    memStmt.run(pid, sid, 'Mechanical Chassis', 'Custom laser cut aluminum chassis and suspension dampening.', 'active', 10);

    const roleStmt = db.prepare('INSERT INTO roles (project_id, title, note, open) VALUES (?, ?, ?, 1)');
    const r1 = Number(roleStmt.run(pid, 'Computer Vision / SLAM Engineer', 'Implement depth camera obstacle avoidance and RTAB-Map SLAM on Jetson Orin Nano.').lastInsertRowid);
    const r2 = Number(roleStmt.run(pid, 'Web Teleoperation Dashboard', 'Build WebRTC video stream and joystick tele-op interface in Next.js.').lastInsertRowid);

    const rSkill = db.prepare('INSERT INTO role_skills (role_id, skill, importance) VALUES (?, ?, ?)');
    rSkill.run(r1, 'computer vision', 3);
    rSkill.run(r1, 'python', 2);
    rSkill.run(r2, 'next.js', 3);
    rSkill.run(r2, 'react', 2);

    const msStmt = db.prepare('INSERT INTO milestones (project_id, title, done) VALUES (?, ?, ?)');
    msStmt.run(pid, 'Chassis fabrication and motor driver bench test', 1);
    msStmt.run(pid, 'Jetson Orin Nano onboard compute integration', 1);
    msStmt.run(pid, 'Autonomous waypoint navigation between Block A and Block B', 0);
    msStmt.run(pid, 'Locker door solenoid auto-unlock with QR verification', 0);

    const upStmt = db.prepare('INSERT INTO updates (project_id, user_id, kind, text, created_at) VALUES (?, ?, ?, ?, ?)');
    upStmt.run(pid, yash, 'event', 'Project posted', ago(1.5));
    upStmt.run(pid, sid, 'event', 'Milestone done: Chassis fabrication and motor driver bench test', ago(1));
    upStmt.run(pid, yash, 'post', 'Bench tests with 24V LiFePO4 pack hit 8 km/h with 15kg payload. Looking for someone with CV experience to wire up the RealSense D435!', ago(0.5));
  }

  // 3. AeroScan: Drone Campus Mapping (Recruiting!)
  let p3 = getProj('AeroScan');
  if (!p3) {
    const res = db.prepare(`
      INSERT INTO projects (name, pitch, status, lead_id, pot, created_at, college_id)
      VALUES (?, ?, 'recruiting', ?, 0, ?, 1)
    `).run('AeroScan', 'Automated orthomosaic photogrammetry and thermal mapping of Nirma campus buildings to assess solar rooftop efficiency.', diya, ago(2));
    const pid = Number(res.lastInsertRowid);

    const memStmt = db.prepare('INSERT INTO members (project_id, user_id, role, did, status, stake) VALUES (?, ?, ?, ?, ?, ?)');
    memStmt.run(pid, diya, 'Lead & AI Analytics', 'Trained semantic segmentation pipeline on rooftop thermal imagery.', 'active', 0);
    memStmt.run(pid, sid, 'Airframe & Gimbal', 'Custom carbon fiber quadcopter frame and 2-axis brushless gimbal.', 'active', 10);

    const roleStmt = db.prepare('INSERT INTO roles (project_id, title, note, open) VALUES (?, ?, ?, 1)');
    const r1 = Number(roleStmt.run(pid, 'Mission Planner & Ground Station', 'Develop Flutter/Electron tablet app for autonomous waypoint grid surveys.').lastInsertRowid);
    const rSkill = db.prepare('INSERT INTO role_skills (role_id, skill, importance) VALUES (?, ?, ?)');
    rSkill.run(r1, 'flutter', 3);
    rSkill.run(r1, 'python', 2);

    const msStmt = db.prepare('INSERT INTO milestones (project_id, title, done) VALUES (?, ?, ?)');
    msStmt.run(pid, 'FAA / DGCA registered drone build with Pixhawk 6C', 1);
    msStmt.run(pid, 'High-res geo-referenced campus survey (200 acres)', 1);
    msStmt.run(pid, 'Automated rooftop solar radiation and thermal heat loss report', 0);

    const upStmt = db.prepare('INSERT INTO updates (project_id, user_id, kind, text, created_at) VALUES (?, ?, ?, ?, ?)');
    upStmt.run(pid, diya, 'event', 'Project posted', ago(2));
    upStmt.run(pid, diya, 'post', 'Finished the aerial survey flight over the engineering quad! Processing 1,200 RAW images into a high-density 3D point cloud.', ago(0.8));
  }

  // 4. HostelMenu: Student Meal Ratings & Crowdsourced Menu (Shipped)
  let p4 = getProj('HostelMenu');
  if (!p4) {
    const res = db.prepare(`
      INSERT INTO projects (name, pitch, status, lead_id, pot, created_at, shipped_at, college_id)
      VALUES (?, ?, 'shipped', ?, 80, ?, ?, 1)
    `).run('HostelMenu', 'Daily mess menu, feedback polls, and automated weekly cleanliness and taste reports submitted to the student council.', ananya, ago(7), ago(4));
    const pid = Number(res.lastInsertRowid);

    const memStmt = db.prepare('INSERT INTO members (project_id, user_id, role, did, status, stake) VALUES (?, ?, ?, ?, ?, ?)');
    memStmt.run(pid, ananya, 'Lead & API', 'PostgreSQL schema, Next.js server actions, and daily menu CRON scraper.', 'active', 0);
    memStmt.run(pid, khushi, 'Mobile App UI', 'Cross-platform Flutter app with offline caching and notification alerts.', 'active', 0);
    memStmt.run(pid, diya, 'Sentiment Engine', 'NLP pipeline analyzing student free-text suggestions into weekly summaries.', 'active', 0);

    const msStmt = db.prepare('INSERT INTO milestones (project_id, title, done) VALUES (?, ?, ?)');
    msStmt.run(pid, 'Daily menu notifications for 600+ hostel students', 1);
    msStmt.run(pid, 'Automated weekly PDF report generated for Chief Warden', 1);

    const allocStmt = db.prepare('INSERT INTO allocations (project_id, from_id, to_id, pct) VALUES (?, ?, ?, ?)');
    allocStmt.run(pid, ananya, khushi, 55);
    allocStmt.run(pid, ananya, diya, 45);
    allocStmt.run(pid, khushi, ananya, 60);
    allocStmt.run(pid, khushi, diya, 40);
    allocStmt.run(pid, diya, ananya, 50);
    allocStmt.run(pid, diya, khushi, 50);

    const pSkill = db.prepare('INSERT OR IGNORE INTO project_skills (project_id, skill) VALUES (?, ?)');
    for (const s of ['next.js', 'flutter', 'postgresql', 'figma', 'python']) pSkill.run(pid, s);

    const mSkill = db.prepare('INSERT OR IGNORE INTO member_skills (project_id, user_id, skill, by_id) VALUES (?, ?, ?, ?)');
    mSkill.run(pid, ananya, 'next.js', khushi);
    mSkill.run(pid, ananya, 'postgresql', diya);
    mSkill.run(pid, khushi, 'flutter', ananya);
    mSkill.run(pid, khushi, 'figma', ananya);
    mSkill.run(pid, diya, 'python', ananya);
  }

  // CLUBS
  const getClub = (name) => db.prepare('SELECT id FROM clubs WHERE name=?').get(name);

  let c1 = getClub('Nirma Autonomous Systems Club');
  if (!c1) {
    const res = db.prepare(`
      INSERT INTO clubs (name, about, lead_id, college_id, status, created_by, created_at)
      VALUES (?, ?, ?, 1, 'active', ?, ?)
    `).run('Nirma Autonomous Systems Club', 'Collegiate robotics and autonomous vehicles team. Building rovers, drones, and competing in national Robocon.', yash, yash, ago(5));
    const cid = Number(res.lastInsertRowid);

    const cmStmt = db.prepare('INSERT OR IGNORE INTO club_members (club_id, user_id, role, confirmed, manage) VALUES (?, ?, ?, 1, ?)');
    cmStmt.run(cid, yash, 'Lead', 1);
    cmStmt.run(cid, sid, 'Hardware Co-Lead', 1);
    cmStmt.run(cid, diya, 'Perception Engineer', 0);

    const planStmt = db.prepare('INSERT INTO club_plans (club_id, title, about, day, place, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    planStmt.run(cid, 'Rover Telemetry & LiDAR Workshop', 'Hands-on sensor fusion with ROS2 and Velodyne puck LiDAR on the prototype rover.', Math.floor((now + 86400 * 2) / 86400), 'Robotics Lab, Ground Floor Block A', yash, ago(0.2));
  }

  let c2 = getClub('Nirma Open Source Developers Group (OSDG)');
  if (!c2) {
    const res = db.prepare(`
      INSERT INTO clubs (name, about, lead_id, college_id, status, created_by, created_at)
      VALUES (?, ?, ?, 1, 'active', ?, ?)
    `).run('Nirma Open Source Developers Group (OSDG)', 'Campus community for Linux enthusiasts, web artisans, and open-source contributors.', ananya, ananya, ago(4));
    const cid = Number(res.lastInsertRowid);

    const cmStmt = db.prepare('INSERT OR IGNORE INTO club_members (club_id, user_id, role, confirmed, manage) VALUES (?, ?, ?, 1, ?)');
    cmStmt.run(cid, ananya, 'Lead', 1);
    cmStmt.run(cid, khushi, 'Community Lead', 1);
    cmStmt.run(cid, diya, 'Member', 0);

    const planStmt = db.prepare('INSERT INTO club_plans (club_id, title, about, day, place, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    planStmt.run(cid, 'Full-Stack Next.js 16 & Server Actions Masterclass', 'Building interactive multi-tenant web tools from scratch.', Math.floor((now + 86400 * 5) / 86400), 'Computer Center Lab 204', ananya, ago(0.1));
  }

  // ALUMNI CALL / GRANT
  const getCall = (title) => db.prepare('SELECT id FROM calls WHERE title=?').get(title);
  let call1 = getCall('Campus Hardware & Robotics Innovation Grant');
  if (!call1) {
    db.prepare(`
      INSERT INTO calls (alum_id, title, about, amount, min_credit, open, college_id)
      VALUES (?, ?, ?, 40000, 20, 1, 1)
    `).run(vikram, 'Campus Hardware & Robotics Innovation Grant',
      'Seed funding for student teams prototyping physical devices, drones, or smart campus sensors at Nirma. Funding is unlocked milestone-by-milestone upon verified proof.');
  }

  // COMMISSIONS
  const getComm = (title) => db.prepare('SELECT id FROM commissions WHERE title=?').get(title);
  let comm1 = getComm('Interactive 3D URDF Robot Visualizer');
  if (!comm1) {
    const cRes = db.prepare(`
      INSERT INTO commissions (college_id, client_id, title, brief, deadline, reward, minted, status, created_at)
      VALUES (1, ?, ?, ?, ?, 30, 0, 'open', ?)
    `).run(yash, 'Interactive 3D URDF Robot Visualizer',
      'Need a smooth Three.js/WebGL canvas component embedded in our club docs to visualize our 4-DOF manipulator robot arm with joint angle sliders.',
      now + 86400 * 14, ago(0.3));
    const commId = Number(cRes.lastInsertRowid);
    db.prepare('INSERT INTO commission_skills (commission_id, skill, importance) VALUES (?, ?, 3)').run(commId, 'three.js');
    db.prepare('INSERT INTO commission_skills (commission_id, skill, importance) VALUES (?, ?, 2)').run(commId, 'react');
  }

  // Notifications for user 1 (Aaditya) so the app feels alive
  if (user1) {
    const notifStmt = db.prepare('INSERT INTO notifications (user_id, text, href, created_at, seen) VALUES (?, ?, ?, ?, 0)');
    notifStmt.run(1, 'Param Parikh vouched for your verified credit', '/u/1', ago(0.2));
    notifStmt.run(1, 'Yash Patel posted an open role on BotDrop: "Web Teleoperation Dashboard"', '/projects/2', ago(0.1));
    notifStmt.run(1, 'Vikram Verma opened a new ₹40,000 Hardware Grant for Nirma teams', '/funding', ago(0.05));
  }

  console.log('Seeding complete! Successfully added diverse student & alumni profiles, projects, clubs, and funding.');
})();
