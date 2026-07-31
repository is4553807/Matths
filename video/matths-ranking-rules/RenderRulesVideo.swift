import AppKit
import AVFoundation
import CoreMedia
import CoreVideo
import Foundation

struct Cue: Codable {
    let index: Int
    let scene: String
    let text: String
    let start: Double
    let end: Double
    let audio: String
}

struct Scene: Codable {
    let index: Int
    let id: String
    let step: Int
    let title: String
    let eyebrow: String
    let kind: String
    let start: Double
    let end: Double
    let cues: [Cue]
}

struct Timeline: Codable {
    let width: Int
    let height: Int
    let fps: Int
    let duration: Double
    let scenes: [Scene]
    let cues: [Cue]
}

enum Palette {
    static let background = NSColor(calibratedRed: 0.027, green: 0.047, blue: 0.082, alpha: 1)
    static let surface = NSColor(calibratedRed: 0.055, green: 0.086, blue: 0.137, alpha: 1)
    static let cyan = NSColor(calibratedRed: 0.08, green: 0.86, blue: 0.95, alpha: 1)
    static let cyanDim = NSColor(calibratedRed: 0.08, green: 0.58, blue: 0.68, alpha: 1)
    static let white = NSColor(calibratedWhite: 0.97, alpha: 1)
    static let muted = NSColor(calibratedRed: 0.48, green: 0.58, blue: 0.69, alpha: 1)
    static let grid = NSColor(calibratedRed: 0.12, green: 0.18, blue: 0.27, alpha: 1)
    static let gold = NSColor(calibratedRed: 1.0, green: 0.72, blue: 0.24, alpha: 1)
    static let red = NSColor(calibratedRed: 1.0, green: 0.33, blue: 0.39, alpha: 1)
    static let green = NSColor(calibratedRed: 0.25, green: 0.91, blue: 0.56, alpha: 1)
}

func clamp(_ value: Double, _ low: Double = 0, _ high: Double = 1) -> Double {
    return min(high, max(low, value))
}

func ease(_ value: Double) -> Double {
    let x = clamp(value)
    return x * x * (3 - 2 * x)
}

func easeOut(_ value: Double) -> Double {
    let x = clamp(value)
    return 1 - pow(1 - x, 3)
}

func pulse(_ t: Double, speed: Double = 1) -> Double {
    return 0.5 + 0.5 * sin(t * .pi * 2 * speed)
}

func lerp(_ a: CGFloat, _ b: CGFloat, _ t: Double) -> CGFloat {
    return a + (b - a) * CGFloat(clamp(t))
}

func pointLerp(_ a: CGPoint, _ b: CGPoint, _ t: Double) -> CGPoint {
    return CGPoint(x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t))
}

func roundedRect(_ rect: CGRect, radius: CGFloat, fill: NSColor, stroke: NSColor? = nil, lineWidth: CGFloat = 1) {
    let path = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
    fill.setFill()
    path.fill()
    if let stroke {
        stroke.setStroke()
        path.lineWidth = lineWidth
        path.stroke()
    }
}

func circle(_ center: CGPoint, radius: CGFloat, fill: NSColor, stroke: NSColor? = nil, lineWidth: CGFloat = 1) {
    let path = NSBezierPath(ovalIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
    fill.setFill()
    path.fill()
    if let stroke {
        stroke.setStroke()
        path.lineWidth = lineWidth
        path.stroke()
    }
}

func line(_ a: CGPoint, _ b: CGPoint, color: NSColor, width: CGFloat = 2, dash: [CGFloat] = []) {
    let path = NSBezierPath()
    path.move(to: a)
    path.line(to: b)
    color.setStroke()
    path.lineWidth = width
    if !dash.isEmpty {
        path.setLineDash(dash, count: dash.count, phase: 0)
    }
    path.stroke()
}

func polyline(_ points: [CGPoint], color: NSColor, width: CGFloat = 2) {
    guard let first = points.first else { return }
    let path = NSBezierPath()
    path.move(to: first)
    for point in points.dropFirst() {
        path.line(to: point)
    }
    color.setStroke()
    path.lineWidth = width
    path.lineJoinStyle = .round
    path.lineCapStyle = .round
    path.stroke()
}

func arrow(_ a: CGPoint, _ b: CGPoint, color: NSColor, width: CGFloat = 3) {
    line(a, b, color: color, width: width)
    let angle = atan2(b.y - a.y, b.x - a.x)
    let size: CGFloat = 12
    let left = CGPoint(
        x: b.x - size * cos(angle - .pi / 6),
        y: b.y - size * sin(angle - .pi / 6)
    )
    let right = CGPoint(
        x: b.x - size * cos(angle + .pi / 6),
        y: b.y - size * sin(angle + .pi / 6)
    )
    let head = NSBezierPath()
    head.move(to: b)
    head.line(to: left)
    head.line(to: right)
    head.close()
    color.setFill()
    head.fill()
}

func drawText(
    _ text: String,
    in rect: CGRect,
    size: CGFloat,
    color: NSColor = Palette.white,
    weight: NSFont.Weight = .regular,
    alignment: NSTextAlignment = .left,
    lineSpacing: CGFloat = 4
) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = alignment
    paragraph.lineBreakMode = .byWordWrapping
    paragraph.lineSpacing = lineSpacing
    let font = NSFont.systemFont(ofSize: size, weight: weight)
    let attributes: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: color,
        .paragraphStyle: paragraph,
    ]
    (text as NSString).draw(
        with: rect,
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        attributes: attributes
    )
}

func pill(_ text: String, center: CGPoint, width: CGFloat, color: NSColor, textColor: NSColor? = nil) {
    let rect = CGRect(x: center.x - width / 2, y: center.y - 20, width: width, height: 40)
    roundedRect(rect, radius: 20, fill: color.withAlphaComponent(0.13), stroke: color.withAlphaComponent(0.8), lineWidth: 1.5)
    drawText(text, in: rect.offsetBy(dx: 0, dy: 7), size: 17, color: textColor ?? color, weight: .semibold, alignment: .center)
}

func drawUser(_ center: CGPoint, color: NSColor, scale: CGFloat = 1, label: String? = nil) {
    let glow = 30 * scale
    circle(center, radius: glow, fill: color.withAlphaComponent(0.08))
    circle(center, radius: 19 * scale, fill: Palette.background, stroke: color, lineWidth: 3)
    circle(CGPoint(x: center.x, y: center.y - 4 * scale), radius: 6 * scale, fill: color)
    let body = NSBezierPath()
    body.appendArc(withCenter: CGPoint(x: center.x, y: center.y + 14 * scale), radius: 11 * scale, startAngle: 180, endAngle: 0)
    color.setStroke()
    body.lineWidth = 4 * scale
    body.stroke()
    if let label {
        drawText(label, in: CGRect(x: center.x - 70, y: center.y + 36 * scale, width: 140, height: 30), size: 17, color: color, weight: .semibold, alignment: .center)
    }
}

func drawCheck(_ center: CGPoint, color: NSColor, scale: CGFloat = 1) {
    circle(center, radius: 18 * scale, fill: color.withAlphaComponent(0.15), stroke: color, lineWidth: 2)
    polyline([
        CGPoint(x: center.x - 8 * scale, y: center.y),
        CGPoint(x: center.x - 2 * scale, y: center.y + 7 * scale),
        CGPoint(x: center.x + 10 * scale, y: center.y - 8 * scale),
    ], color: color, width: 3 * scale)
}

func drawLock(_ center: CGPoint, color: NSColor, open: Bool = false) {
    let body = CGRect(x: center.x - 16, y: center.y - 2, width: 32, height: 27)
    roundedRect(body, radius: 5, fill: color.withAlphaComponent(0.15), stroke: color, lineWidth: 2)
    let shackle = NSBezierPath()
    shackle.appendArc(withCenter: CGPoint(x: center.x + (open ? 8 : 0), y: center.y - 2), radius: 10, startAngle: 190, endAngle: open ? 310 : 350)
    color.setStroke()
    shackle.lineWidth = 3
    shackle.stroke()
}

final class Renderer {
    let timeline: Timeline
    let width: CGFloat
    let height: CGFloat

    init(timeline: Timeline) {
        self.timeline = timeline
        self.width = CGFloat(timeline.width)
        self.height = CGFloat(timeline.height)
    }

    func scene(at time: Double) -> Scene {
        return timeline.scenes.first(where: { time >= $0.start && time < $0.end }) ?? timeline.scenes.last!
    }

    func activeCue(at time: Double) -> Cue? {
        return timeline.cues.first(where: { time >= $0.start && time <= $0.end })
    }

    func cueOrdinal(_ scene: Scene, at time: Double) -> Int {
        for (index, cue) in scene.cues.enumerated() where time <= cue.end + 0.12 {
            return index
        }
        return max(0, scene.cues.count - 1)
    }

    func cueProgress(_ scene: Scene, ordinal: Int, at time: Double) -> Double {
        guard ordinal >= 0, ordinal < scene.cues.count else { return 0 }
        let cue = scene.cues[ordinal]
        return clamp((time - cue.start) / max(0.01, cue.end - cue.start))
    }

    func render(time: Double, context: CGContext) {
        context.saveGState()
        context.translateBy(x: 0, y: height)
        context.scaleBy(x: 1, y: -1)
        let graphics = NSGraphicsContext(cgContext: context, flipped: true)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = graphics
        context.setAllowsAntialiasing(true)
        context.setShouldAntialias(true)
        Palette.background.setFill()
        NSBezierPath(rect: CGRect(x: 0, y: 0, width: width, height: height)).fill()

        drawGrid(time)
        let currentScene = scene(at: time)
        let local = clamp((time - currentScene.start) / max(0.01, currentScene.end - currentScene.start))
        drawHeader(currentScene, time: time, progress: local)
        drawStepRail(currentScene, progress: local)

        switch currentScene.kind {
        case "hook":
            drawHook(currentScene, time: time, progress: local)
        case "placement":
            drawPlacement(currentScene, time: time, progress: local)
        case "leagues":
            drawLeagues(currentScene, time: time, progress: local)
        case "official":
            drawOfficial(currentScene, time: time, progress: local)
        case "takeover":
            drawTakeover(currentScene, time: time, progress: local)
        case "refund":
            drawRefund(currentScene, time: time, progress: local)
        default:
            drawOutro(currentScene, time: time, progress: local)
        }

        drawCaptions(time: time)
        drawProgress(time: time)
        NSGraphicsContext.restoreGraphicsState()
        context.restoreGState()
    }

    func drawGrid(_ time: Double) {
        for x in stride(from: CGFloat(0), through: width, by: 72) {
            let alpha = 0.2 + 0.08 * pulse(time * 0.05 + Double(x / 300))
            line(CGPoint(x: x, y: 0), CGPoint(x: x, y: height), color: Palette.grid.withAlphaComponent(alpha), width: 1)
        }
        for y in stride(from: CGFloat(0), through: height, by: 72) {
            line(CGPoint(x: 0, y: y), CGPoint(x: width, y: y), color: Palette.grid.withAlphaComponent(0.18), width: 1)
        }
    }

    func drawHeader(_ scene: Scene, time: Double, progress: Double) {
        let intro = easeOut(progress * 7)
        let x = lerp(74, 48, intro)
        drawText(scene.eyebrow, in: CGRect(x: x, y: 45, width: 600, height: 30), size: 18, color: scene.kind == "refund" ? Palette.gold : Palette.cyan, weight: .bold)
        drawText(scene.title, in: CGRect(x: x, y: 78, width: 620, height: 110), size: 39, color: Palette.white.withAlphaComponent(intro), weight: .bold, lineSpacing: 2)
        line(CGPoint(x: 48, y: 178), CGPoint(x: 672, y: 178), color: Palette.grid, width: 1.5)
    }

    func drawStepRail(_ scene: Scene, progress: Double) {
        let y: CGFloat = 207
        for index in 1...5 {
            let x = 214 + CGFloat(index - 1) * 74
            let active = scene.step == index
            circle(CGPoint(x: x, y: y), radius: active ? 11 : 6, fill: active ? Palette.cyan : Palette.grid, stroke: active ? Palette.white.withAlphaComponent(0.7) : nil, lineWidth: 1)
            drawText("\(index)", in: CGRect(x: x - 15, y: y - 9, width: 30, height: 20), size: 12, color: active ? Palette.background : Palette.muted, weight: .bold, alignment: .center)
            if index < 5 {
                line(CGPoint(x: x + 13, y: y), CGPoint(x: x + 61, y: y), color: index < max(1, scene.step) ? Palette.cyanDim : Palette.grid, width: 2)
            }
        }
    }

    func drawHook(_ scene: Scene, time: Double, progress: Double) {
        let center = CGPoint(x: 360, y: 600)
        let orbit: CGFloat = 218
        let reveal = easeOut(progress * 4)
        let labels = [("실력", Palette.cyan), ("도전", Palette.white), ("환급", Palette.gold)]
        let angles: [Double] = [-Double.pi / 2, Double.pi / 6, Double.pi * 5 / 6]
        var points: [CGPoint] = []

        for (index, item) in labels.enumerated() {
            let angle = angles[index] + sin(time * 0.28 + Double(index)) * 0.05
            let target = CGPoint(x: center.x + orbit * cos(angle), y: center.y + orbit * sin(angle))
            let point = pointLerp(center, target, reveal)
            points.append(point)
        }
        if points.count == 3 {
            polyline([points[0], points[1], points[2], points[0]], color: Palette.cyanDim.withAlphaComponent(0.55), width: 2)
        }
        for (index, point) in points.enumerated() {
            let item = labels[index]
            circle(point, radius: 64, fill: Palette.surface.withAlphaComponent(0.9), stroke: item.1, lineWidth: 2.5)
            drawText(item.0, in: CGRect(x: point.x - 55, y: point.y - 15, width: 110, height: 34), size: 26, color: item.1, weight: .bold, alignment: .center)
        }
        drawUser(center, color: Palette.white, scale: 1.25, label: "USER")
        let cue = cueOrdinal(scene, at: time)
        let phrase = cue == 0 ? "한 결제 주기 안에서 연결" : "공식 모의고사  ×  Takeover  ×  환급"
        drawText(phrase, in: CGRect(x: 70, y: 890, width: 580, height: 50), size: 26, color: cue == 0 ? Palette.muted : Palette.cyan, weight: .semibold, alignment: .center)
    }

    func drawPlacement(_ scene: Scene, time: Double, progress: Double) {
        let cue = cueOrdinal(scene, at: time)
        let cp = cueProgress(scene, ordinal: cue, at: time)
        let center = CGPoint(x: 360, y: 430)
        let number = cue == 0 ? Int(1500.0 * easeOut(cp * 1.7)) : 1500
        circle(center, radius: 118, fill: Palette.surface, stroke: Palette.cyan, lineWidth: 3)
        drawText("START MMR", in: CGRect(x: center.x - 100, y: center.y - 43, width: 200, height: 28), size: 17, color: Palette.muted, weight: .bold, alignment: .center)
        drawText("\(number)", in: CGRect(x: center.x - 120, y: center.y - 8, width: 240, height: 74), size: 58, color: Palette.white, weight: .bold, alignment: .center)

        let nodeY: CGFloat = 675
        for index in 0..<5 {
            let appear = easeOut((progress * 2.1 - Double(index) * 0.12))
            let x = 150 + CGFloat(index) * 105
            line(CGPoint(x: index == 0 ? x : x - 75, y: nodeY), CGPoint(x: x, y: nodeY), color: Palette.cyanDim.withAlphaComponent(appear), width: 3)
            circle(CGPoint(x: x, y: nodeY), radius: 23, fill: Palette.background, stroke: Palette.cyan.withAlphaComponent(appear), lineWidth: 3)
            drawText("\(index + 1)", in: CGRect(x: x - 20, y: nodeY - 13, width: 40, height: 30), size: 20, color: Palette.white.withAlphaComponent(appear), weight: .bold, alignment: .center)
        }
        drawText("PLACEMENT 5", in: CGRect(x: 180, y: 720, width: 360, height: 34), size: 22, color: Palette.cyan, weight: .bold, alignment: .center)

        if cue <= 1 {
            drawLock(CGPoint(x: 360, y: 835), color: Palette.muted)
            drawText("공개 순위  비공개", in: CGRect(x: 170, y: 875, width: 380, height: 42), size: 28, color: Palette.muted, weight: .semibold, alignment: .center)
        } else {
            let reveal = easeOut(cp * 2)
            drawCheck(CGPoint(x: 228, y: 850), color: Palette.green, scale: 1.2)
            drawText("첫 공개 순위", in: CGRect(x: 265, y: 824, width: 250, height: 34), size: 20, color: Palette.muted, weight: .semibold)
            drawText("# 24", in: CGRect(x: 265, y: 855, width: 250, height: 60), size: 45, color: Palette.white.withAlphaComponent(reveal), weight: .bold)
        }
    }

    func drawLeagues(_ scene: Scene, time: Double, progress: Double) {
        let cue = cueOrdinal(scene, at: time)
        let dividerX: CGFloat = 360
        line(CGPoint(x: dividerX, y: 285), CGPoint(x: dividerX, y: 910), color: Palette.grid, width: 2, dash: [8, 10])
        drawText("SUB RANKING", in: CGRect(x: 55, y: 280, width: 270, height: 42), size: 25, color: Palette.cyan, weight: .bold, alignment: .center)
        drawText("MAIN RANKING", in: CGRect(x: 395, y: 280, width: 270, height: 42), size: 25, color: Palette.gold, weight: .bold, alignment: .center)
        drawText("환급 도전 중", in: CGRect(x: 95, y: 330, width: 190, height: 34), size: 20, color: Palette.muted, weight: .medium, alignment: .center)
        drawText("환급 완료만", in: CGRect(x: 435, y: 330, width: 190, height: 34), size: 20, color: Palette.muted, weight: .medium, alignment: .center)

        let subNodes = [CGPoint(x: 135, y: 450), CGPoint(x: 240, y: 535), CGPoint(x: 150, y: 635), CGPoint(x: 265, y: 740)]
        let mainNodes = [CGPoint(x: 480, y: 450), CGPoint(x: 575, y: 545), CGPoint(x: 465, y: 665), CGPoint(x: 585, y: 755)]
        for (index, point) in subNodes.enumerated() {
            circle(point, radius: 22, fill: Palette.surface, stroke: index == 1 ? Palette.cyan : Palette.cyanDim, lineWidth: index == 1 ? 3 : 1.5)
            drawText("#\(index + 6)", in: CGRect(x: point.x - 36, y: point.y - 11, width: 72, height: 25), size: 16, color: index == 1 ? Palette.white : Palette.muted, weight: .bold, alignment: .center)
        }
        for (index, point) in mainNodes.enumerated() {
            circle(point, radius: 22, fill: Palette.surface, stroke: Palette.gold.withAlphaComponent(index == 2 ? 1 : 0.5), lineWidth: index == 2 ? 3 : 1.5)
            drawText("#\(index + 2)", in: CGRect(x: point.x - 36, y: point.y - 11, width: 72, height: 25), size: 16, color: index == 2 ? Palette.white : Palette.muted, weight: .bold, alignment: .center)
        }
        drawUser(subNodes[1], color: Palette.cyan, scale: 0.75)
        if cue >= 1 {
            drawLock(CGPoint(x: 360, y: 500), color: Palette.gold, open: cue >= 2)
            pill("환급 완료", center: CGPoint(x: 360, y: 590), width: 140, color: Palette.gold)
        }
        let activeMessage = cue < 2 ? "MATCHING  ∥  RANKING" : "한 사람 · 하나의 활성 랭킹"
        drawText(activeMessage, in: CGRect(x: 90, y: 860, width: 540, height: 48), size: 26, color: cue < 2 ? Palette.muted : Palette.white, weight: .bold, alignment: .center)
    }

    func drawOfficial(_ scene: Scene, time: Double, progress: Double) {
        let cue = cueOrdinal(scene, at: time)
        let cp = cueProgress(scene, ordinal: cue, at: time)
        let times = ["15:00", "18:00", "21:00"]
        let centers = [CGPoint(x: 155, y: 365), CGPoint(x: 360, y: 365), CGPoint(x: 565, y: 365)]
        for index in 0..<3 {
            let selected = index == 1
            circle(centers[index], radius: 54, fill: Palette.surface, stroke: selected ? Palette.cyan : Palette.grid, lineWidth: selected ? 3 : 2)
            drawText(times[index], in: CGRect(x: centers[index].x - 55, y: centers[index].y - 15, width: 110, height: 34), size: 23, color: selected ? Palette.white : Palette.muted, weight: .bold, alignment: .center)
            drawText(selected ? "OFFICIAL" : "PRACTICE", in: CGRect(x: centers[index].x - 65, y: centers[index].y + 66, width: 130, height: 25), size: 14, color: selected ? Palette.cyan : Palette.muted, weight: .bold, alignment: .center)
        }

        if cue <= 1 {
            let barLabels = ["보정 점수", "고난도 정답", "활성 풀이 시간"]
            for index in 0..<3 {
                let y = 550 + CGFloat(index) * 85
                drawText("\(index + 1)", in: CGRect(x: 78, y: y + 6, width: 35, height: 30), size: 18, color: Palette.cyan, weight: .bold, alignment: .center)
                drawText(barLabels[index], in: CGRect(x: 128, y: y, width: 190, height: 36), size: 21, color: Palette.white, weight: .semibold)
                let target: CGFloat = [0.9, 0.72, 0.55][index]
                roundedRect(CGRect(x: 325, y: y + 8, width: 290, height: 15), radius: 7, fill: Palette.grid)
                roundedRect(CGRect(x: 325, y: y + 8, width: 290 * target * CGFloat(easeOut(progress * 2)), height: 15), radius: 7, fill: index == 0 ? Palette.cyan : Palette.cyanDim)
            }
            if cue == 1 {
                drawText("완전 동점 → 공동 순위", in: CGRect(x: 135, y: 835, width: 450, height: 44), size: 26, color: Palette.muted, weight: .bold, alignment: .center)
            }
        } else {
            let formulaY: CGFloat = 545
            drawText("Sᵢ = (N − rᵢ) / (N − 1)", in: CGRect(x: 90, y: formulaY, width: 540, height: 52), size: 31, color: Palette.white, weight: .semibold, alignment: .center)
            drawText("Eᵢ = 평균 예상 성과", in: CGRect(x: 90, y: formulaY + 70, width: 540, height: 45), size: 26, color: Palette.muted, weight: .semibold, alignment: .center)
            drawText("ΔMMR = K × ( Sᵢ − Eᵢ )", in: CGRect(x: 70, y: formulaY + 137, width: 580, height: 65), size: 40, color: Palette.cyan, weight: .bold, alignment: .center)
            let ks = [("배치", "48"), ("일반", "24"), ("2000+", "16")]
            for index in 0..<3 {
                let x = 150 + CGFloat(index) * 210
                pill("\(ks[index].0)  K=\(ks[index].1)", center: CGPoint(x: x, y: 825), width: 172, color: index == 0 ? Palette.cyan : Palette.muted)
            }
            let change = Int(6 * easeOut(cp * 1.6))
            drawText("1600  →  \(1600 + change)", in: CGRect(x: 190, y: 890, width: 340, height: 50), size: 31, color: Palette.white, weight: .bold, alignment: .center)
        }
    }

    func drawTakeover(_ scene: Scene, time: Double, progress: Double) {
        let cue = cueOrdinal(scene, at: time)
        let cp = cueProgress(scene, ordinal: cue, at: time)
        if cue <= 1 {
            let rows = [(1, "1칸", "2일"), (2, "2–3칸", "3일"), (3, "4–7칸", "6일")]
            for index in 0..<rows.count {
                let y = 360 + CGFloat(index) * 150
                let item = rows[index]
                circle(CGPoint(x: 125, y: y), radius: 32, fill: Palette.surface, stroke: Palette.cyan, lineWidth: 2)
                drawText("\(item.0)", in: CGRect(x: 95, y: y - 18, width: 60, height: 40), size: 25, color: Palette.white, weight: .bold, alignment: .center)
                arrow(CGPoint(x: 175, y: y), CGPoint(x: 330, y: y), color: Palette.cyanDim, width: 3)
                drawText(item.1, in: CGRect(x: 190, y: y - 42, width: 125, height: 33), size: 20, color: Palette.muted, weight: .bold, alignment: .center)
                roundedRect(CGRect(x: 370, y: y - 45, width: 205, height: 90), radius: 18, fill: Palette.surface, stroke: Palette.cyan.withAlphaComponent(0.7), lineWidth: 2)
                drawText(item.2, in: CGRect(x: 385, y: y - 24, width: 175, height: 54), size: 38, color: Palette.white, weight: .bold, alignment: .center)
            }
            drawText("범위 선택 → 일수 잠금 → 무작위 상대", in: CGRect(x: 80, y: 835, width: 560, height: 48), size: 26, color: Palette.cyan, weight: .bold, alignment: .center)
        } else if cue == 2 {
            circle(CGPoint(x: 360, y: 515), radius: 150, fill: Palette.surface, stroke: Palette.cyanDim, lineWidth: 3)
            let remaining = max(0, Int(24 * (1 - cp)))
            drawText("24", in: CGRect(x: 240, y: 425, width: 240, height: 110), size: 86, color: Palette.white, weight: .bold, alignment: .center)
            drawText("HOURS TO START", in: CGRect(x: 230, y: 540, width: 260, height: 38), size: 20, color: Palette.cyan, weight: .bold, alignment: .center)
            let endAngle = CGFloat(-90 + 360 * cp)
            let arc = NSBezierPath()
            arc.appendArc(withCenter: CGPoint(x: 360, y: 515), radius: 170, startAngle: -90, endAngle: endAngle)
            Palette.cyan.setStroke()
            arc.lineWidth = 8
            arc.stroke()
            pill("ACTIVE MATCH  1 / 1", center: CGPoint(x: 360, y: 790), width: 280, color: Palette.white)
            drawText("남은 시간  \(remaining)h", in: CGRect(x: 220, y: 850, width: 280, height: 45), size: 24, color: Palette.muted, weight: .semibold, alignment: .center)
        } else {
            let ladderX: CGFloat = 190
            let rows = 6
            let swap = cue == 3 ? easeOut((cp - 0.28) / 0.48) : 0
            for index in 0..<rows {
                let y = 345 + CGFloat(index) * 88
                let rank = index + 5
                line(CGPoint(x: ladderX, y: y), CGPoint(x: 530, y: y), color: Palette.grid, width: 2)
                drawText("#\(rank)", in: CGRect(x: 80, y: y - 17, width: 75, height: 35), size: 22, color: Palette.muted, weight: .bold, alignment: .right)
            }
            let defenderStart = CGPoint(x: 300, y: 345 + 2 * 88)
            let challengerStart = CGPoint(x: 420, y: 345 + 4 * 88)
            let defender = pointLerp(defenderStart, challengerStart, swap)
            let challenger = pointLerp(challengerStart, defenderStart, swap)
            drawUser(defender, color: Palette.gold, scale: 0.72, label: "DEFENDER")
            drawUser(challenger, color: Palette.cyan, scale: 0.72, label: "CHALLENGER")
            if cue == 3 {
                arrow(CGPoint(x: 555, y: challengerStart.y - 8), CGPoint(x: 555, y: defenderStart.y + 8), color: Palette.cyan, width: 4)
                drawText(swap < 0.6 ? "도전자 승리" : "순위 교환 · 잠금 소모", in: CGRect(x: 75, y: 855, width: 570, height: 46), size: 27, color: Palette.cyan, weight: .bold, alignment: .center)
            } else {
                let errorMode = cp > 0.58
                drawText(errorMode ? "SERVER ERROR → 원상 복구" : "완전 동점 → 방어자 승리", in: CGRect(x: 75, y: 855, width: 570, height: 46), size: 27, color: errorMode ? Palette.red : Palette.gold, weight: .bold, alignment: .center)
                if errorMode {
                    drawLock(CGPoint(x: 360, y: 925), color: Palette.green, open: true)
                }
            }
        }
    }

    func drawRefund(_ scene: Scene, time: Double, progress: Double) {
        let cue = cueOrdinal(scene, at: time)
        let cp = cueProgress(scene, ordinal: cue, at: time)
        if cue <= 2 {
            let startX: CGFloat = 90
            let endX: CGFloat = 630
            let y: CGFloat = 520
            line(CGPoint(x: startX, y: y), CGPoint(x: endX, y: y), color: Palette.grid, width: 8)
            let day = cue == 0 ? Int(29 * easeOut(cp * 1.5)) : (cue == 1 ? Int(30 * easeOut(cp * 1.4)) : 30)
            let fill = clamp(Double(day) / 30)
            line(CGPoint(x: startX, y: y), CGPoint(x: lerp(startX, endX, fill), y: y), color: fill >= 1 ? Palette.gold : Palette.cyan, width: 8)
            for mark in [0, 10, 20, 29, 30] {
                let x = lerp(startX, endX, Double(mark) / 30)
                line(CGPoint(x: x, y: y - 14), CGPoint(x: x, y: y + 14), color: Palette.white.withAlphaComponent(0.7), width: 2)
                drawText("\(mark)", in: CGRect(x: x - 25, y: y + 25, width: 50, height: 28), size: 16, color: Palette.muted, weight: .bold, alignment: .center)
            }
            circle(CGPoint(x: lerp(startX, endX, fill), y: y), radius: 18, fill: fill >= 1 ? Palette.gold : Palette.cyan, stroke: Palette.white, lineWidth: 2)
            drawText("DAY \(day)", in: CGRect(x: 210, y: 365, width: 300, height: 80), size: 54, color: fill >= 1 ? Palette.gold : Palette.white, weight: .bold, alignment: .center)

            let streakOk = cue >= 1 && cp > 0.18
            let daysOk = cue >= 1 && cp > 0.4
            let refundOk = cue >= 1 && cp > 0.7
            let items = [("유효 학습 연속 30일", streakOk), ("도전 가능 일수 30일+", daysOk), ("결제액 1회 환급", refundOk)]
            for index in 0..<items.count {
                let itemY = 665 + CGFloat(index) * 72
                drawCheck(CGPoint(x: 150, y: itemY), color: items[index].1 ? Palette.green : Palette.grid, scale: 0.9)
                drawText(items[index].0, in: CGRect(x: 190, y: itemY - 17, width: 400, height: 38), size: 23, color: items[index].1 ? Palette.white : Palette.muted, weight: .semibold)
            }
            if cue == 2 {
                pill("MMR · TIER 유지", center: CGPoint(x: 250, y: 910), width: 230, color: Palette.cyan)
                arrow(CGPoint(x: 385, y: 910), CGPoint(x: 470, y: 910), color: Palette.gold)
                pill("MAIN", center: CGPoint(x: 560, y: 910), width: 135, color: Palette.gold)
            }
        } else if cue == 3 {
            drawText("29 + 29", in: CGRect(x: 90, y: 360, width: 540, height: 90), size: 68, color: Palette.white, weight: .bold, alignment: .center)
            drawText("≠ 58", in: CGRect(x: 90, y: 455, width: 540, height: 90), size: 68, color: Palette.red, weight: .bold, alignment: .center)
            let reset = easeOut(cp * 1.6)
            arrow(CGPoint(x: 180, y: 640), CGPoint(x: 540, y: 640), color: Palette.cyan, width: 4)
            let values = [("학습", "29"), ("도전", "29"), ("연속", "0")]
            for index in 0..<3 {
                let x = 155 + CGFloat(index) * 205
                circle(CGPoint(x: x, y: 770), radius: 64, fill: Palette.surface, stroke: Palette.cyan, lineWidth: 2)
                drawText(values[index].0, in: CGRect(x: x - 60, y: 735, width: 120, height: 30), size: 18, color: Palette.muted, weight: .bold, alignment: .center)
                drawText(values[index].1, in: CGRect(x: x - 60, y: 770, width: 120, height: 55), size: 42, color: Palette.white.withAlphaComponent(reset), weight: .bold, alignment: .center)
            }
            pill("NEW PAYMENT CYCLE", center: CGPoint(x: 360, y: 920), width: 320, color: Palette.cyan)
        } else {
            let mainCenter = CGPoint(x: 360, y: 390)
            circle(mainCenter, radius: 108, fill: Palette.surface, stroke: Palette.gold, lineWidth: 3)
            drawText("MAIN", in: CGRect(x: 260, y: 355, width: 200, height: 55), size: 43, color: Palette.gold, weight: .bold, alignment: .center)
            drawText("BONUS DAYS", in: CGRect(x: 260, y: 414, width: 200, height: 30), size: 16, color: Palette.muted, weight: .bold, alignment: .center)
            let actions = [("TAKEOVER", Palette.cyan), ("SHIELD", Palette.gold), ("REVIEW", Palette.white)]
            for index in 0..<3 {
                let angle = -.pi / 2 + Double(index) * (.pi * 2 / 3)
                let p = CGPoint(x: mainCenter.x + 220 * cos(angle), y: 650 + 150 * sin(angle))
                circle(p, radius: 52, fill: Palette.surface, stroke: actions[index].1, lineWidth: 2)
                drawText(actions[index].0, in: CGRect(x: p.x - 60, y: p.y - 12, width: 120, height: 30), size: 15, color: actions[index].1, weight: .bold, alignment: .center)
            }
            let blocked = cue == 4 || cp < 0.56
            drawLock(CGPoint(x: 360, y: 860), color: blocked ? Palette.red : Palette.green, open: !blocked)
            drawText(
                blocked ? "잔여 일수 / 잠금 / 경기 → 새 결제 차단" : "모두 0 · 경기 없음 → 새 패키지",
                in: CGRect(x: 85, y: 910, width: 550, height: 55),
                size: 23,
                color: blocked ? Palette.red : Palette.green,
                weight: .bold,
                alignment: .center
            )
            if !blocked {
                pill("새 결제 → SUB로 복귀", center: CGPoint(x: 360, y: 990), width: 300, color: Palette.cyan)
            }
        }
    }

    func drawOutro(_ scene: Scene, time: Double, progress: Double) {
        let center = CGPoint(x: 360, y: 610)
        let nodes = [
            (CGPoint(x: 360, y: 360), "공식 모의고사", "MMR", Palette.cyan),
            (CGPoint(x: 575, y: 735), "TAKEOVER", "공개 위치", Palette.white),
            (CGPoint(x: 145, y: 735), "환급 성공", "소속 리그", Palette.gold),
        ]
        for index in 0..<3 {
            let next = (index + 1) % 3
            arrow(nodes[index].0, nodes[next].0, color: Palette.cyanDim.withAlphaComponent(0.65), width: 3)
        }
        for node in nodes {
            circle(node.0, radius: 78, fill: Palette.surface, stroke: node.3, lineWidth: 3)
            drawText(node.1, in: CGRect(x: node.0.x - 78, y: node.0.y - 24, width: 156, height: 32), size: 19, color: node.3, weight: .bold, alignment: .center)
            drawText(node.2, in: CGRect(x: node.0.x - 78, y: node.0.y + 13, width: 156, height: 28), size: 17, color: Palette.muted, weight: .semibold, alignment: .center)
        }
        drawUser(center, color: Palette.white, scale: 1.2)
        if cueOrdinal(scene, at: time) >= 1 {
            pill("이상 징후 → 보류 · 소명 · 검토", center: CGPoint(x: 360, y: 915), width: 420, color: Palette.muted)
        }
    }

    func drawCaptions(time: Double) {
        let top: CGFloat = 1040
        roundedRect(CGRect(x: 0, y: top, width: width, height: height - top), radius: 0, fill: NSColor.black.withAlphaComponent(0.76))
        line(CGPoint(x: 48, y: top), CGPoint(x: 672, y: top), color: Palette.cyan.withAlphaComponent(0.8), width: 2)
        if let cue = activeCue(at: time) {
            drawText("KOREAN NARRATION", in: CGRect(x: 50, y: top + 22, width: 300, height: 25), size: 14, color: Palette.cyan, weight: .bold)
            drawText(cue.text, in: CGRect(x: 50, y: top + 56, width: 620, height: 145), size: 27, color: Palette.white, weight: .medium, alignment: .center, lineSpacing: 7)
        }
    }

    func drawProgress(time: Double) {
        let ratio = clamp(time / timeline.duration)
        roundedRect(CGRect(x: 0, y: height - 7, width: width, height: 7), radius: 0, fill: Palette.grid)
        roundedRect(CGRect(x: 0, y: height - 7, width: width * CGFloat(ratio), height: 7), radius: 0, fill: Palette.cyan)
    }
}

func makeBitmapContext(pixelBuffer: CVPixelBuffer, width: Int, height: Int) throws -> CGContext {
    CVPixelBufferLockBaseAddress(pixelBuffer, [])
    guard let base = CVPixelBufferGetBaseAddress(pixelBuffer) else {
        CVPixelBufferUnlockBaseAddress(pixelBuffer, [])
        throw NSError(domain: "MatthsVideo", code: 1, userInfo: [NSLocalizedDescriptionKey: "Missing pixel buffer base address"])
    }
    guard let context = CGContext(
        data: base,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue
    ) else {
        CVPixelBufferUnlockBaseAddress(pixelBuffer, [])
        throw NSError(domain: "MatthsVideo", code: 2, userInfo: [NSLocalizedDescriptionKey: "Could not create bitmap context"])
    }
    return context
}

func renderPoster(timeline: Timeline, time: Double, poster: URL) throws {
    let posterWidth = timeline.width
    let posterHeight = timeline.height
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let posterContext = CGContext(
        data: nil,
        width: posterWidth,
        height: posterHeight,
        bitsPerComponent: 8,
        bytesPerRow: posterWidth * 4,
        space: colorSpace,
        bitmapInfo: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue
    ) else {
        throw NSError(domain: "MatthsVideo", code: 9)
    }
    let renderer = Renderer(timeline: timeline)
    renderer.render(time: time, context: posterContext)
    guard let image = posterContext.makeImage() else {
        throw NSError(domain: "MatthsVideo", code: 10)
    }
    let bitmap = NSBitmapImageRep(cgImage: image)
    guard let png = bitmap.representation(using: .png, properties: [:]) else {
        throw NSError(domain: "MatthsVideo", code: 11)
    }
    try png.write(to: poster)
}

func renderSilentVideo(timeline: Timeline, output: URL, poster: URL) throws {
    let fileManager = FileManager.default
    if fileManager.fileExists(atPath: output.path) {
        try fileManager.removeItem(at: output)
    }
    let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
    let settings: [String: Any] = [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: timeline.width,
        AVVideoHeightKey: timeline.height,
        AVVideoCompressionPropertiesKey: [
            AVVideoAverageBitRateKey: 5_500_000,
            AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
            AVVideoMaxKeyFrameIntervalKey: timeline.fps * 2,
        ],
    ]
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    input.expectsMediaDataInRealTime = false
    let attributes: [String: Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: timeline.width,
        kCVPixelBufferHeightKey as String: timeline.height,
        kCVPixelBufferIOSurfacePropertiesKey as String: [:],
    ]
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: attributes)
    guard writer.canAdd(input) else {
        throw NSError(domain: "MatthsVideo", code: 3, userInfo: [NSLocalizedDescriptionKey: "Cannot add video input"])
    }
    writer.add(input)
    guard writer.startWriting() else {
        throw writer.error ?? NSError(domain: "MatthsVideo", code: 4)
    }
    writer.startSession(atSourceTime: .zero)

    let renderer = Renderer(timeline: timeline)
    let frameCount = Int(ceil(timeline.duration * Double(timeline.fps)))
    for frame in 0..<frameCount {
        while !input.isReadyForMoreMediaData {
            Thread.sleep(forTimeInterval: 0.002)
        }
        guard let pool = adaptor.pixelBufferPool else {
            throw NSError(domain: "MatthsVideo", code: 5, userInfo: [NSLocalizedDescriptionKey: "Missing pixel buffer pool"])
        }
        var optionalBuffer: CVPixelBuffer?
        let status = CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &optionalBuffer)
        guard status == kCVReturnSuccess, let pixelBuffer = optionalBuffer else {
            throw NSError(domain: "MatthsVideo", code: 6, userInfo: [NSLocalizedDescriptionKey: "Could not allocate pixel buffer"])
        }
        let context = try makeBitmapContext(pixelBuffer: pixelBuffer, width: timeline.width, height: timeline.height)
        context.clear(CGRect(x: 0, y: 0, width: timeline.width, height: timeline.height))
        renderer.render(time: Double(frame) / Double(timeline.fps), context: context)
        CVPixelBufferUnlockBaseAddress(pixelBuffer, [])
        let presentationTime = CMTime(value: CMTimeValue(frame), timescale: CMTimeScale(timeline.fps))
        if !adaptor.append(pixelBuffer, withPresentationTime: presentationTime) {
            throw writer.error ?? NSError(domain: "MatthsVideo", code: 7)
        }
        if frame % 300 == 0 {
            let percent = Int((Double(frame) / Double(frameCount)) * 100)
            print("RENDER \(percent)%  frame \(frame)/\(frameCount)")
            fflush(stdout)
        }
    }
    input.markAsFinished()
    let finishSemaphore = DispatchSemaphore(value: 0)
    writer.finishWriting {
        finishSemaphore.signal()
    }
    finishSemaphore.wait()
    guard writer.status == .completed else {
        throw writer.error ?? NSError(domain: "MatthsVideo", code: 8)
    }

    try renderPoster(timeline: timeline, time: 3.0, poster: poster)
}

func exportWithAudio(timeline: Timeline, silentVideo: URL, bgm: URL, output: URL) throws {
    let fileManager = FileManager.default
    if fileManager.fileExists(atPath: output.path) {
        try fileManager.removeItem(at: output)
    }
    let composition = AVMutableComposition()
    let videoAsset = AVURLAsset(url: silentVideo)
    guard
        let sourceVideoTrack = videoAsset.tracks(withMediaType: .video).first,
        let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)
    else {
        throw NSError(domain: "MatthsVideo", code: 12, userInfo: [NSLocalizedDescriptionKey: "Missing rendered video track"])
    }
    let duration = CMTime(seconds: timeline.duration, preferredTimescale: 600)
    try videoTrack.insertTimeRange(CMTimeRange(start: .zero, duration: duration), of: sourceVideoTrack, at: .zero)
    videoTrack.preferredTransform = sourceVideoTrack.preferredTransform

    guard let voiceTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
        throw NSError(domain: "MatthsVideo", code: 13)
    }
    for cue in timeline.cues {
        let asset = AVURLAsset(url: URL(fileURLWithPath: cue.audio))
        guard let source = asset.tracks(withMediaType: .audio).first else {
            throw NSError(domain: "MatthsVideo", code: 14, userInfo: [NSLocalizedDescriptionKey: "Missing narration audio: \(cue.audio)"])
        }
        let cueDuration = CMTime(seconds: cue.end - cue.start, preferredTimescale: 600)
        try voiceTrack.insertTimeRange(
            CMTimeRange(start: .zero, duration: cueDuration),
            of: source,
            at: CMTime(seconds: cue.start, preferredTimescale: 600)
        )
    }

    let bgmAsset = AVURLAsset(url: bgm)
    guard
        let bgmSource = bgmAsset.tracks(withMediaType: .audio).first,
        let bgmTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
    else {
        throw NSError(domain: "MatthsVideo", code: 15, userInfo: [NSLocalizedDescriptionKey: "Missing BGM"])
    }
    try bgmTrack.insertTimeRange(CMTimeRange(start: .zero, duration: duration), of: bgmSource, at: .zero)

    let mix = AVMutableAudioMix()
    let voiceParams = AVMutableAudioMixInputParameters(track: voiceTrack)
    voiceParams.setVolume(1.0, at: .zero)
    let bgmParams = AVMutableAudioMixInputParameters(track: bgmTrack)
    bgmParams.setVolume(0.13, at: .zero)
    bgmParams.setVolumeRamp(
        fromStartVolume: 0.0,
        toEndVolume: 0.13,
        timeRange: CMTimeRange(start: .zero, duration: CMTime(seconds: 1.5, preferredTimescale: 600))
    )
    bgmParams.setVolumeRamp(
        fromStartVolume: 0.13,
        toEndVolume: 0.0,
        timeRange: CMTimeRange(start: CMTime(seconds: max(0, timeline.duration - 2), preferredTimescale: 600), duration: CMTime(seconds: 2, preferredTimescale: 600))
    )
    mix.inputParameters = [voiceParams, bgmParams]

    guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
        throw NSError(domain: "MatthsVideo", code: 16)
    }
    exporter.outputURL = output
    exporter.outputFileType = .mp4
    exporter.audioMix = mix
    exporter.timeRange = CMTimeRange(start: .zero, duration: duration)
    exporter.shouldOptimizeForNetworkUse = true
    let semaphore = DispatchSemaphore(value: 0)
    exporter.exportAsynchronously {
        semaphore.signal()
    }
    semaphore.wait()
    guard exporter.status == .completed else {
        throw exporter.error ?? NSError(domain: "MatthsVideo", code: 17)
    }
}

let arguments = CommandLine.arguments
if arguments.count == 4, arguments[1] == "--poster-only" {
    do {
        let data = try Data(contentsOf: URL(fileURLWithPath: arguments[2]))
        let timeline = try JSONDecoder().decode(Timeline.self, from: data)
        try renderPoster(timeline: timeline, time: 3.0, poster: URL(fileURLWithPath: arguments[3]))
        print("POSTER COMPLETE")
        exit(0)
    } catch {
        fputs("ERROR: \(error)\n", stderr)
        exit(1)
    }
}

guard arguments.count == 6 else {
    fputs("Usage: RenderRulesVideo timeline.json bgm.wav silent.mp4 final.mp4 poster.png\n", stderr)
    exit(2)
}

do {
    let timelineURL = URL(fileURLWithPath: arguments[1])
    let bgmURL = URL(fileURLWithPath: arguments[2])
    let silentURL = URL(fileURLWithPath: arguments[3])
    let finalURL = URL(fileURLWithPath: arguments[4])
    let posterURL = URL(fileURLWithPath: arguments[5])
    let data = try Data(contentsOf: timelineURL)
    let timeline = try JSONDecoder().decode(Timeline.self, from: data)
    try renderSilentVideo(timeline: timeline, output: silentURL, poster: posterURL)
    print("VIDEO RENDER COMPLETE")
    fflush(stdout)
    try exportWithAudio(timeline: timeline, silentVideo: silentURL, bgm: bgmURL, output: finalURL)
    print("AUDIO MIX COMPLETE")
} catch {
    fputs("ERROR: \(error)\n", stderr)
    exit(1)
}
