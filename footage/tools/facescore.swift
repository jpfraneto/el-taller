// facescore: how good is the face in each photo (Apple Vision, no extra installs).
// usage: facescore a.jpg b.jpg ...   → one JSON line per image:
//   {"file", "faces", "quality", "yaw", "roll", "eyes", "box": [x, y, w, h]}   (biggest face; box normalized, origin bottom-left)
// quality: VNDetectFaceCaptureQualityRequest (0–1: sharpness, lighting, pose, expression).
// eyes: eye opening = height/width of the eye landmarks, averaged over both eyes (~0.25+ open, <0.15 closed).
import Foundation
import Vision
import ImageIO

func eyeOpen(_ r: VNFaceLandmarkRegion2D?) -> Double? {
    guard let p = r?.normalizedPoints, p.count >= 4 else { return nil }
    let xs = p.map { Double($0.x) }, ys = p.map { Double($0.y) }
    let w = (xs.max()! - xs.min()!), h = (ys.max()! - ys.min()!)
    return w > 0 ? h / w : nil
}

for path in CommandLine.arguments.dropFirst() {
    var out: [String: Any] = ["file": path, "faces": 0]
    defer {
        if let d = try? JSONSerialization.data(withJSONObject: out), let s = String(data: d, encoding: .utf8) { print(s) }
    }
    guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
          let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { continue }
    let lm = VNDetectFaceLandmarksRequest()
    let q = VNDetectFaceCaptureQualityRequest()
    let h = VNImageRequestHandler(cgImage: img)
    do { try h.perform([lm]) } catch { continue }
    guard let faces = lm.results, !faces.isEmpty else { continue }
    let face = faces.max { $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height }!
    q.inputFaceObservations = [face]
    try? h.perform([q])
    out["faces"] = faces.count
    out["quality"] = q.results?.first?.faceCaptureQuality.map { Double($0) } ?? 0
    out["yaw"] = face.yaw?.doubleValue ?? 0
    out["roll"] = face.roll?.doubleValue ?? 0
    let e = [eyeOpen(face.landmarks?.leftEye), eyeOpen(face.landmarks?.rightEye)].compactMap { $0 }
    out["eyes"] = e.isEmpty ? 0 : e.reduce(0, +) / Double(e.count)
    // Looking at the camera: pupils centered in the eyes (gaze) and the nose centered in the face (head turn).
    // Both 0 = straight at the lens; ~0.15+ = clearly looking aside.
    func center(_ r: VNFaceLandmarkRegion2D?) -> (Double, Double)? {
        guard let p = r?.normalizedPoints, !p.isEmpty else { return nil }
        return (p.map { Double($0.x) }.reduce(0, +) / Double(p.count), p.map { Double($0.y) }.reduce(0, +) / Double(p.count))
    }
    func span(_ r: VNFaceLandmarkRegion2D?) -> (Double, Double)? {
        guard let p = r?.normalizedPoints, p.count >= 2 else { return nil }
        let xs = p.map { Double($0.x) }; return (xs.min()!, xs.max()!)
    }
    var gaze: [Double] = []
    for (eye, pupil) in [(face.landmarks?.leftEye, face.landmarks?.leftPupil), (face.landmarks?.rightEye, face.landmarks?.rightPupil)] {
        if let (lo, hi) = span(eye), let (px, _) = center(pupil), hi > lo { gaze.append(abs((px - lo) / (hi - lo) - 0.5)) }
    }
    out["gaze"] = gaze.isEmpty ? 1 : gaze.reduce(0, +) / Double(gaze.count)
    if let (nx, _) = center(face.landmarks?.noseCrest) ?? center(face.landmarks?.nose),
       let (lo, hi) = span(face.landmarks?.faceContour), hi > lo {
        out["head"] = abs((nx - lo) / (hi - lo) - 0.5)
    } else { out["head"] = 1 }
    let b = face.boundingBox
    out["box"] = [b.origin.x, b.origin.y, b.width, b.height].map { Double($0) }
}
