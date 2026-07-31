import AppKit
import AVFoundation
import Foundation

let arguments = CommandLine.arguments
guard arguments.count == 3 else {
    fputs("Usage: InspectVideo video.mp4 output-directory\n", stderr)
    exit(2)
}

let videoURL = URL(fileURLWithPath: arguments[1])
let outputDirectory = URL(fileURLWithPath: arguments[2], isDirectory: true)
let asset = AVURLAsset(url: videoURL)
let duration = CMTimeGetSeconds(asset.duration)
let videoTracks = asset.tracks(withMediaType: .video)
let audioTracks = asset.tracks(withMediaType: .audio)

print("duration=\(String(format: "%.3f", duration))")
print("video_tracks=\(videoTracks.count)")
print("audio_tracks=\(audioTracks.count)")
if let videoTrack = videoTracks.first {
    let transformed = videoTrack.naturalSize.applying(videoTrack.preferredTransform)
    print("dimensions=\(Int(abs(transformed.width)))x\(Int(abs(transformed.height)))")
    print("nominal_fps=\(String(format: "%.2f", videoTrack.nominalFrameRate))")
}

try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero
let sampleTimes = [3.0, 28.0, 46.0, 70.0, 91.0, 110.0, 126.0, 145.0, 165.0, 185.0, 201.0].filter { $0 < duration }

for (index, seconds) in sampleTimes.enumerated() {
    var actual = CMTime.zero
    let image = try generator.copyCGImage(
        at: CMTime(seconds: seconds, preferredTimescale: 600),
        actualTime: &actual
    )
    let bitmap = NSBitmapImageRep(cgImage: image)
    guard let data = bitmap.representation(using: .png, properties: [:]) else {
        throw NSError(domain: "MatthsInspect", code: 1)
    }
    let output = outputDirectory.appendingPathComponent(String(format: "qa_%02d_%03ds.png", index + 1, Int(seconds)))
    try data.write(to: output)
    print("frame=\(output.lastPathComponent) actual=\(String(format: "%.3f", CMTimeGetSeconds(actual)))")
}
