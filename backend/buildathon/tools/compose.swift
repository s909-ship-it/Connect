// Fills the Startup Buildathon template with Connect's content.
// Run: swift tools/compose.swift template.pdf out.pdf
// Keeps template pages 2-9 as the background and draws text and images on top.
import Foundation
import PDFKit
import AppKit

let args = CommandLine.arguments
let template = PDFDocument(url: URL(fileURLWithPath: args[1]))!
let outURL = URL(fileURLWithPath: args[2])
let teamSize = ProcessInfo.processInfo.environment["TEAM_SIZE"] ?? "3"
let here = URL(fileURLWithPath: args[1]).deletingLastPathComponent().path

let W: CGFloat = 720, H: CGFloat = 405
var box = CGRect(x: 0, y: 0, width: W, height: H)
let ctx = CGContext(outURL as CFURL, mediaBox: &box, [kCGPDFContextTitle as String: "Connect · Startup Buildathon India 2026"] as CFDictionary)!

// ---------- palette (Google colours from the template) ----------
func hex(_ s: String, _ a: CGFloat = 1) -> NSColor {
  let v = Int(s, radix: 16)!
  return NSColor(srgbRed: CGFloat((v >> 16) & 255) / 255, green: CGFloat((v >> 8) & 255) / 255, blue: CGFloat(v & 255) / 255, alpha: a)
}
let ink = hex("202124"), muted = hex("5F6368"), card = hex("F1F3F4"), line = hex("DADCE0")
let blue = hex("4285F4"), red = hex("EA4335"), yellow = hex("FBBC04"), green = hex("34A853")
let blueDark = hex("1A73E8"), greenDark = hex("188038")

func font(_ size: CGFloat, _ w: NSFont.Weight = .regular) -> NSFont { NSFont.systemFont(ofSize: size, weight: w) }

// ---------- drawing helpers, all in top-left coordinates ----------
func text(_ s: String, _ r: CGRect, _ f: NSFont, _ c: NSColor = ink, lineGap: CGFloat = 2, align: NSTextAlignment = .left) {
  let p = NSMutableParagraphStyle(); p.lineSpacing = lineGap; p.alignment = align
  NSAttributedString(string: s, attributes: [.font: f, .foregroundColor: c, .paragraphStyle: p])
    .draw(with: r, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine])
}
func rich(_ parts: [(String, NSFont, NSColor)], _ r: CGRect, lineGap: CGFloat = 2) {
  let p = NSMutableParagraphStyle(); p.lineSpacing = lineGap
  let m = NSMutableAttributedString()
  for (s, f, c) in parts { m.append(NSAttributedString(string: s, attributes: [.font: f, .foregroundColor: c, .paragraphStyle: p])) }
  m.draw(with: r, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine])
}
func fill(_ r: CGRect, _ c: NSColor, radius: CGFloat = 0) {
  c.setFill(); NSBezierPath(roundedRect: r, xRadius: radius, yRadius: radius).fill()
}
func stroke(_ r: CGRect, _ c: NSColor, radius: CGFloat, width: CGFloat = 0.75) {
  c.setStroke(); let b = NSBezierPath(roundedRect: r, xRadius: radius, yRadius: radius); b.lineWidth = width; b.stroke()
}
func dot(_ x: CGFloat, _ y: CGFloat, _ d: CGFloat, _ c: NSColor) { c.setFill(); NSBezierPath(ovalIn: CGRect(x: x, y: y, width: d, height: d)).fill() }
func pill(_ s: String, _ x: CGFloat, _ y: CGFloat, _ fg: NSColor, _ bg: NSColor) -> CGFloat {
  let f = font(8, .semibold)
  let w = (s as NSString).size(withAttributes: [.font: f]).width + 14
  fill(CGRect(x: x, y: y, width: w, height: 14), bg, radius: 7)
  text(s, CGRect(x: x + 7, y: y + 2.5, width: w, height: 12), f, fg)
  return w
}
func image(_ name: String, _ r: CGRect, radius: CGFloat = 0, border: Bool = false) {
  guard let img = NSImage(contentsOfFile: "\(here)/\(name)") else { print("missing image \(name)"); return }
  NSGraphicsContext.saveGraphicsState()
  if radius > 0 { NSBezierPath(roundedRect: r, xRadius: radius, yRadius: radius).addClip() }
  img.draw(in: r, from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: [.interpolation: NSImageInterpolation.high])
  NSGraphicsContext.restoreGraphicsState()
  if border { stroke(r, line, radius: radius) }
}
// Hides the template's "Type here..." prompt.
func coverPrompt() { fill(CGRect(x: 34, y: 132, width: 110, height: 22), .white) }
// Title in the same place and style as the template's own titles, for the page that has none.
func pageTitle(_ t: String, _ sub: String) {
  text(t, CGRect(x: 39, y: 81, width: 640, height: 26), font(19, .medium))
  text(sub, CGRect(x: 39, y: 107, width: 640, height: 16), font(10.5), ink)
}

func page(_ n: Int, _ draw: () -> Void) {
  let p = template.page(at: n - 1)!
  ctx.beginPDFPage(nil)
  ctx.drawPDFPage(p.pageRef!)
  ctx.saveGState()
  ctx.translateBy(x: 0, y: H); ctx.scaleBy(x: 1, y: -1)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: true)
  draw()
  NSGraphicsContext.restoreGraphicsState()
  ctx.restoreGState()
  ctx.endPDFPage()
}

// ---------- page 2: cover ----------
page(2) {
  let v = font(13, .semibold)
  text("Connectors  ·  product: Connect", CGRect(x: 137, y: 263, width: 520, height: 18), v)
  text(teamSize, CGRect(x: 125, y: 296, width: 200, height: 18), v)
  text("In colleges, students who want to build cannot find each other, and nothing shows who actually ships.",
       CGRect(x: 183, y: 330, width: 480, height: 40), v, lineGap: 3)
}

// ---------- page 3: problem ----------
page(3) {
  coverPrompt()
  text("Builders exist in every college. They just never find each other.", CGRect(x: 39, y: 135, width: 640, height: 18), font(12.5, .semibold))
  let items: [(String, String, NSColor)] = [
    ("Builders are scattered", "Students who want to build are spread across 50+ WhatsApp groups and clubs. A post asking for teammates is buried within hours.", blue),
    ("No way to tell who delivers", "Profiles are self-written. \u{201C}AI | Web3 | Founder\u{201D} looks exactly like someone who shipped three real projects.", red),
    ("Teams fall apart midway", "Members disappear once the work gets hard. Nothing records it, so the same thing happens to the next team.", yellow),
    ("No proof at the end", "Students graduate with nothing that shows what they built. Alumni who want to back student work can\u{2019}t tell which teams are real.", green),
  ]
  let cw: CGFloat = 314, ch: CGFloat = 104, gx: CGFloat = 14, gy: CGFloat = 12, y0: CGFloat = 164
  for (i, it) in items.enumerated() {
    let x = 39 + CGFloat(i % 2) * (cw + gx), y = y0 + CGFloat(i / 2) * (ch + gy)
    fill(CGRect(x: x, y: y, width: cw, height: ch), card, radius: 12)
    dot(x + 16, y + 18, 10, it.2)
    text(it.0, CGRect(x: x + 34, y: y + 14, width: cw - 50, height: 18), font(13, .semibold))
    text(it.1, CGRect(x: x + 16, y: y + 40, width: cw - 32, height: ch - 48), font(10.5), muted, lineGap: 3)
  }
}

// ---------- page 4: solution ----------
page(4) {
  coverPrompt()
  rich([("Connect", font(12.5, .bold), ink), (": find teammates, build together, and earn a reputation only from finished work.", font(12.5, .semibold), ink)],
       CGRect(x: 39, y: 135, width: 640, height: 18))
  let items: [(String, String, NSColor)] = [
    ("One campus project board", "Every project shows its team, milestones, proof links and the roles it still needs.", blue),
    ("Credit only for shipped work", "Two students from outside the team review the proof and decide what it is worth.", red),
    ("Teammates split the credit", "Each member divides the project between the others. Nobody sets their own share.", yellow),
    ("Joining costs a stake", "Credit is held when you join. Leave midway and you lose it, and your profile shows it.", green),
    ("A resume teammates signed", "A shareable link where each line is signed by the people who were there. AI writes only from those records.", blue),
    ("Clubs and alumni built in", "Clubs keep confirmed rosters. Alumni fund teams milestone by milestone, and teams need real credit to apply.", red),
  ]
  let cw: CGFloat = 206, ch: CGFloat = 88, gx: CGFloat = 12, gy: CGFloat = 10, y0: CGFloat = 162
  for (i, it) in items.enumerated() {
    let x = 39 + CGFloat(i % 3) * (cw + gx), y = y0 + CGFloat(i / 3) * (ch + gy)
    fill(CGRect(x: x, y: y, width: cw, height: ch), card, radius: 12)
    dot(x + 14, y + 16, 9, it.2)
    text(it.0, CGRect(x: x + 30, y: y + 12, width: cw - 40, height: 16), font(11.5, .semibold))
    text(it.1, CGRect(x: x + 14, y: y + 34, width: cw - 26, height: ch - 38), font(9.5), muted, lineGap: 2.5)
  }
  let w = pill("WORKING PRODUCT", 39, 361, greenDark, hex("E6F4EA"))
  text("Already built and running: Google sign-in, college email verification, project board, credit engine with automated tests.",
       CGRect(x: 39 + w + 10, y: 361, width: 640 - w - 10, height: 14), font(9.5), muted)
}

// ---------- page 5: architecture ----------
page(5) {
  coverPrompt()
  let h: CGFloat = 250, w = h * 1920 / 1080
  image("connect-architecture.png", CGRect(x: (W - w) / 2, y: 138, width: w, height: h))
}

// ---------- page 6: Google AI tools ----------
page(6) {
  coverPrompt()
  let tools: [(String, String, String, String, NSColor, NSColor)] = [
    ("Google Antigravity", "IN USE", "Our coding agent. It built Connect\u{2019}s Gemini features inside our codebase: the verified resume writer and the proof summary for reviewers. We reviewed and tested every change before it went in.", "Lets a small student team ship faster, with every change reviewed.", blueDark, hex("E8F0FE")),
    ("Google AI Studio", "IN USE", "Issues the Gemini API key that powers Connect\u{2019}s live AI features. We use it to design and test the prompt for each feature against real project records before it ships.", "No prompt reaches students before it is tested on real records.", blueDark, hex("E8F0FE")),
  ]
  let cw: CGFloat = 314, ch: CGFloat = 200, y0: CGFloat = 140
  for (i, t) in tools.enumerated() {
    let x = 39 + CGFloat(i) * (cw + 14)
    fill(CGRect(x: x, y: y0, width: cw, height: ch), card, radius: 14)
    text(t.0, CGRect(x: x + 18, y: y0 + 18, width: cw - 36, height: 22), font(16, .semibold))
    _ = pill(t.1, x + 18, y0 + 46, t.4, t.5)
    text(t.2, CGRect(x: x + 18, y: y0 + 72, width: cw - 36, height: 80), font(10.5), ink, lineGap: 3)
    fill(CGRect(x: x + 18, y: y0 + ch - 44, width: cw - 36, height: 0.75), line)
    text(t.3, CGRect(x: x + 18, y: y0 + ch - 34, width: cw - 36, height: 28), font(9.5, .medium), muted, lineGap: 2)
  }
  text("We are not using Google Agent Skills at this stage.", CGRect(x: 39, y: 352, width: 640, height: 14), font(9.5), muted)
}

// ---------- page 7: Google AI models ----------
page(7) {
  coverPrompt()
  // left: the model
  let lx: CGFloat = 39, ly: CGFloat = 140, lw: CGFloat = 230, lh: CGFloat = 228
  fill(CGRect(x: lx, y: ly, width: lw, height: lh), hex("E8F0FE"), radius: 14)
  text("MODEL", CGRect(x: lx + 18, y: ly + 18, width: 200, height: 12), font(8, .semibold), blueDark)
  text("Gemini 3.8 Flash", CGRect(x: lx + 18, y: ly + 34, width: lw - 36, height: 26), font(19, .semibold))
  text("Through the Gemini API", CGRect(x: lx + 18, y: ly + 62, width: lw - 36, height: 14), font(10), muted)
  text("Fast and low-cost, so every student can use the AI features many times a day. It is also the model our Antigravity coding agent runs on.",
       CGRect(x: lx + 18, y: ly + 88, width: lw - 36, height: 80), font(10.5), ink, lineGap: 3)
  text("AI never changes anyone\u{2019}s credit. Only people review, split and vouch.", CGRect(x: lx + 18, y: ly + lh - 46, width: lw - 36, height: 32), font(9.5, .semibold), blueDark, lineGap: 2)
  // right: what it does
  let uses: [(String, String, String, NSColor)] = [
    ("Verified resume writer", "Writes a student\u{2019}s resume only from projects their teammates signed. Self-written claims are never sent to the model.", "WORKING", blue),
    ("Proof summary for reviewers", "Turns a project\u{2019}s milestones, proof links and roles into a short checklist of what an outside reviewer should verify. It gives no verdict.", "WORKING", red),
    ("Teammate suggestions", "Matches open roles to students by the skills they used in shipped projects, not the skills they list.", "PLANNED", green),
  ]
  let rx: CGFloat = 283, rw: CGFloat = 398, rh: CGFloat = 70, gap: CGFloat = 9
  for (i, u) in uses.enumerated() {
    let y = ly + CGFloat(i) * (rh + gap)
    fill(CGRect(x: rx, y: y, width: rw, height: rh), card, radius: 12)
    dot(rx + 14, y + 15, 9, u.3)
    text(u.0, CGRect(x: rx + 30, y: y + 11, width: 260, height: 16), font(11.5, .semibold))
    let pw = (u.2 as NSString).size(withAttributes: [.font: font(8, .semibold)]).width + 14
    _ = pill(u.2, rx + rw - pw - 12, y + 11, u.2 == "PLANNED" ? greenDark : blueDark, u.2 == "PLANNED" ? hex("E6F4EA") : hex("E8F0FE"))
    text(u.1, CGRect(x: rx + 14, y: y + 32, width: rw - 28, height: 36), font(9.5), muted, lineGap: 2.5)
  }
}

// ---------- page 8: the product today ----------
page(8) {
  pageTitle("Already built, and where it grows", "A working web app today, not a mock-up. The same model scales from colleges to companies.")
  let w: CGFloat = 300, h = w * 455 / 800, y: CGFloat = 133, x2: CGFloat = 39 + 642 - w
  image("deck/shot-landing.jpg", CGRect(x: 39, y: y, width: w, height: h), radius: 10, border: true)
  image("deck/shot-project.jpg", CGRect(x: x2, y: y, width: w, height: h), radius: 10, border: true)
  text("Sign in with Google, and see why bios earn nothing", CGRect(x: 39, y: y + h + 6, width: w, height: 14), font(10, .semibold))
  text("A shipped project: outside review, teammate split, proof", CGRect(x: x2, y: y + h + 6, width: w, height: 14), font(10, .semibold))
  // growth: companies
  let by: CGFloat = 330, bh: CGFloat = 62
  fill(CGRect(x: 39, y: by, width: 642, height: bh), hex("E8F0FE"), radius: 12)
  let pw = pill("NEXT: COMPANIES", 53, by + 11, blueDark, .white)
  text("The same model works inside corporates.", CGRect(x: 53 + pw + 10, y: by + 10, width: 560 - pw, height: 16), font(11.5, .semibold))
  text("Employees team up on internal projects, credit comes only from work colleagues sign off, and managers see who actually delivers. A student\u{2019}s signed record carries straight into hiring.",
       CGRect(x: 53, y: by + 31, width: 614, height: 30), font(9.5), ink, lineGap: 2)
}

// ---------- page 9: thank you, unchanged ----------
page(9) {}

ctx.closePDF()
print("wrote \(outURL.path)")
