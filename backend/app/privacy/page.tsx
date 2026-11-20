import Link from "next/link";

export const metadata = { title: "Privacy" };

/* Plain-language privacy policy. Also the page Google asks for before the sign-in app can be published. */
export default function Privacy() {
  const contact = process.env.CONTACT_EMAIL;
  return (
    <article className="card narrow prose">
      <h1>Privacy</h1>
      <p className="muted small">Last updated 21 November 2026</p>

      <h2>What we collect</h2>
      <ul>
        <li><b>From Google or LinkedIn sign-in:</b> your name, email address and profile photo. Nothing else, and we never see your password.</li>
        <li><b>From you:</b> branch, graduation year, skills, a line about you, optional GitHub, LinkedIn and website links, and your college or work email if you verify with a code.</li>
        <li><b>From using Connect:</b> projects you post or join, milestones, proof links, reviews, vouches, credit splits, questions, club roles and funding applications.</li>
        <li><b>For your board&rsquo;s For you order:</b> which projects you opened, how often, and which you marked &ldquo;Not for me&rdquo;. Only your own board uses it; nobody else can see it, and it never affects anyone&rsquo;s credit or scores.</li>
        <li><b>From messages and calls:</b> the messages you send, and the photos, videos, files and voice notes you attach. For calls we keep a log of who called whom, when, and for how long. Calls are not recorded.</li>
        <li><b>When you sign in:</b> the time and the kind of device (for example &ldquo;Chrome on Windows&rdquo;) of your latest sign-in, so we can show it to you and tell you about a sign-in you did not make. We do not keep your network address.</li>
        <li><b>Which days you use Connect:</b> for each day you open it, a count of how many pages you loaded, not which ones. Admins see these only added up across everyone, as charts, never per person. Deleting your account deletes them.</li>
        <li><b>Sign-in codes:</b> when a code is emailed to you we keep only a scrambled copy of it until it is used or expires, and a scrambled marker for each device you chose to trust.</li>
        <li><b>Photos you upload:</b> a profile photo replaces the one from your sign-in provider until you remove it, and a project&rsquo;s image is seen by whoever can see the project.</li>
        <li><b>Anonymous mode:</b> if you turn it on, everyone sees an alias and a pattern instead of your name and photo, and your links, resume and read receipts are hidden. We keep your real name and photo so your college&rsquo;s admins can still see who you are; nobody else can. In calls and voice notes your voice is changed on your own device before it is sent, so your real voice never reaches us or the other person, and your camera stays off.</li>
        <li><b>If you turn on alerts:</b> an address your browser gives us for that device, so we can send it notifications. Turning alerts off removes it.</li>
      </ul>

      <h2>What is public</h2>
      <p>Verified members have a profile page anyone with the link can open: name, photo, branch, year, skills, links, projects and credit. Your email addresses are never shown to anyone, only the email domain you verified with. Reviews are shown without the reviewer&rsquo;s name.</p>
      <p>Everything else stays inside your community: projects in progress, people lists, clubs and funding are visible only to verified members of the same community. Messages and their attachments can be opened only by the two people in the chat, and a project&rsquo;s team space (its chat and photos, pinned messages, notes, task board and team calls) only by the people currently on that team. A community&rsquo;s public page shows only its counts and shipped projects.</p>

      <h2>How it is used</h2>
      <ul>
        <li>To run Connect: showing projects, working out credit, sending you inbox alerts and, if you leave them on, emails about them.</li>
        <li>If someone on a project&rsquo;s team asks AI to make the project&rsquo;s image, its name and one-line pitch are sent to Gemini to draw it.</li>
        <li>If you press <b>Write with AI</b> on your resume, your signed project facts are sent to Google&rsquo;s Gemini API to write it. When the <b>AI proof check</b> runs on a project (the team, its reviewers or an admin starts it, and it runs once by itself when the project goes for review), Connect reads the project&rsquo;s public GitHub repos, live site and YouTube demo titles, and sends Gemini those and the project&rsquo;s pitch, milestones, skills and each member&rsquo;s role and &ldquo;what I did&rdquo;. Members are sent as &ldquo;Member 1&rdquo;, &ldquo;Member 2&rdquo; and so on, never by name or email. Nothing else is sent to it.</li>
        <li>Calls, including team calls, connect directly between the browsers in the call where possible, which means the other person&rsquo;s device can see your network address, as with most calling apps. When a direct connection is not possible, the encrypted call passes through a relay run by Cloudflare.</li>
        <li>Alerts are delivered by the notification service of your browser or phone maker (Google, Apple or Mozilla).</li>
        <li>We do not sell your data, show ads, or share it with anyone except the services that run the site: hosting, email delivery, Gemini, Cloudflare&rsquo;s call relay and your browser&rsquo;s notification service.</li>
      </ul>

      <h2>Cookies</h2>
      <p>One cookie keeps you signed in, one remembers light or dark mode, one remembers a device you chose to trust at sign-in, two last a few minutes while you sign in, and one remembers your answer to the cookie notice. No tracking or advertising cookies. The full list, with how long each lasts, is on the <Link href="/cookies">Cookies</Link> page.</p>

      <h2>Your choices</h2>
      <ul>
        <li>Turn email alerts off, switch calls off, choose who can start a chat with you, sign out of your other devices, download everything we hold about you, or delete your account from <Link href="/settings">Settings</Link>.</li>
        <li>Deleting erases your personal details. Your place in past project teams stays as &ldquo;Deleted user&rdquo;, so your teammates&rsquo; history remains accurate.</li>
      </ul>

      <h2>Age</h2>
      <p>Connect is for communities, like the students of a college or the employees of a workplace, and their alumni. If you are under 18, use it only with the consent of a parent or guardian.</p>

      <h2>Contact</h2>
      <p>Questions or requests: {contact ? <>email <a href={`mailto:${contact}`}>{contact}</a>, or </> : null}use <b>Report</b> on the project or profile concerned. Once signed in you can also write to the team from <Link href="/feedback">Feedback</Link>; we keep what you send there, with the page you came from, until you delete your account.</p>
    </article>
  );
}
