import Link from "next/link";
import { TERMS_DATE } from "@/lib/consent";

export const metadata = { title: "Terms of Service", description: "The rules for using Connect." };

export default function Terms() {
  return (
    <article className="card narrow prose">
      <h1>Terms of Service</h1>
      <p className="muted small">Last updated {TERMS_DATE}</p>
      <p>Connect is a place for the people of a community, like the students of a college or the employees of a workplace, to find teammates, build projects and show what shipped. It is run by the Connect team. By creating an account or using Connect you agree to these terms, the <Link href="/privacy">privacy policy</Link> and the <Link href="/cookies">cookie policy</Link>. If you do not agree, do not use Connect.</p>

      <h2>1. Your account</h2>
      <ul>
        <li>One account per person. Use your real name and your own college or work email. Do not sign in as someone else or let anyone use your account.</li>
        <li>You can choose to appear under an alias in anonymous mode. Your college&rsquo;s admins can still see who you are, and everything in these terms applies to you the same. Using an alias to harass people, dodge a block or fake reviews gets the account suspended.</li>
        <li>Connect is for communities, like the students of a college or the employees of a workplace, and their alumni. If you are under 18, you need the consent of a parent or guardian to use it.</li>
        <li>You sign in with Google or LinkedIn, so keep that account safe. If you think someone else got in, use <b>Sign out of all other devices</b> in <Link href="/settings">Settings</Link> and change that account&rsquo;s password.</li>
      </ul>

      <h2>2. Be honest about your work</h2>
      <ul>
        <li>Only list projects and contributions you actually worked on, and only link proof that is really the project&rsquo;s.</li>
        <li>Credit only counts what teammates and outside reviewers sign. Gaming it, with fake teams, swapped or bought reviews, vouch rings, or someone else&rsquo;s code passed off as yours, gets accounts suspended and credit removed.</li>
        <li>Credit is a record of signed work, not a grade, a certificate or a reference.</li>
      </ul>

      <h2>3. Be decent and do not break things</h2>
      <ul>
        <li>No harassment, threats, hate, sexual content involving anyone without their consent, spam, scams, or content you do not have the right to share.</li>
        <li>Do not try to break into Connect, get around its limits, read other people&rsquo;s data, scrape it in bulk, or overload it. If you find a security problem, tell us through <Link href="/feedback">Feedback</Link> instead of using it.</li>
        <li>Anyone can report a project, commission or person. Admins of your community can hide projects and suspend accounts that break these terms.</li>
      </ul>

      <h2>4. Messages and calls</h2>
      <p>Messages, files and calls are between the people in them. Do not send anything illegal or anything you would not want the other person to keep. You can block anyone. Connect does not record calls.</p>

      <h2>5. What you post stays yours</h2>
      <p>You own what you build and post. You let Connect store it and show it to the people it is meant for (your community, or the people in a chat) so the site can work. That permission ends when you remove it or delete your account from <Link href="/settings">Settings</Link>, except that your place in past teams stays as &ldquo;Deleted user&rdquo; so your teammates&rsquo; history stays true.</p>

      <h2>6. AI features</h2>
      <ul>
        <li>Connect uses Google&rsquo;s Gemini to draft resumes from your signed records and to run the AI proof check, which compares a project&rsquo;s claims with its public GitHub, live site and demo video.</li>
        <li>AI can be wrong. The proof check never gives a verdict and never changes anyone&rsquo;s credit: people review. Read a resume draft before you use it; what you publish is yours to stand behind.</li>
      </ul>

      <h2>7. Alumni funding</h2>
      <p>Grants are agreements between an alum and a project team. Connect records them and shows what was paid, but does not handle money and is not responsible for whether a grant is paid.</p>

      <h2>8. Commissions</h2>
      <ul>
        <li>A commission is one person asking another to build something, for credit. Graded coursework, assignments, lab records, reports handed in for marks, exams and anything else you submit for a grade are not allowed, whether you are asking or doing.</li>
        <li>Anyone can report a commission as coursework. One an admin finds to be coursework is removed: nobody is paid, the reward is not returned, and it goes on the record of the person who posted it.</li>
        <li>Only alumni and clubs can attach money to a commission. Connect records the amount and whether it was marked as paid. It does not handle money and is not responsible for whether it is paid.</li>
        <li>Disputes are decided by the admins of your community.</li>
      </ul>

      <h2>9. Suspension and leaving</h2>
      <p>You can delete your account at any time from <Link href="/settings">Settings</Link>. We may suspend or remove an account that breaks these terms or puts other people at risk, and we may close a community whose domain turns out not to belong to it.</p>

      <h2>10. No guarantees</h2>
      <p>Connect is a student-built service provided as it is, without promises that it will always be available, error-free or fit for a particular purpose. To the extent the law allows, the Connect team is not liable for indirect losses, or for what other members do, post, promise or pay.</p>

      <h2>11. Changes</h2>
      <p>We may change these terms. The date at the top shows the latest version, and we will tell you in your inbox before an important change takes effect. If you keep using Connect after that, you accept the new terms.</p>

      <h2>12. Contact and law</h2>
      <p>Questions about these terms: write to us through <Link href="/feedback">Feedback</Link>. These terms are governed by the laws of India.</p>

      <p>See also <Link href="/rules">how credit works</Link>.</p>
    </article>
  );
}
