import CoreGraphics
import Foundation
import ImageIO
import Vision

struct RecognizedLine: Codable {
  let text: String
  let confidence: Float
  let x: CGFloat
  let y: CGFloat
  let width: CGFloat
  let height: CGFloat
}

guard CommandLine.arguments.count == 2 else {
  FileHandle.standardError.write(Data("Usage: recognize-text.swift IMAGE\n".utf8))
  exit(2)
}

let imageURL = URL(fileURLWithPath: CommandLine.arguments[1])
guard
  let source = CGImageSourceCreateWithURL(imageURL as CFURL, nil),
  let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
else {
  FileHandle.standardError.write(Data("Could not decode image: \(imageURL.path)\n".utf8))
  exit(3)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["ru-RU", "en-US"]
request.usesLanguageCorrection = true
request.minimumTextHeight = 0.006

do {
  try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
} catch {
  FileHandle.standardError.write(Data("Vision OCR failed: \(error)\n".utf8))
  exit(4)
}

let lines = (request.results ?? []).compactMap { observation -> RecognizedLine? in
  guard let candidate = observation.topCandidates(1).first else { return nil }
  let box = observation.boundingBox
  return RecognizedLine(
    text: candidate.string,
    confidence: candidate.confidence,
    x: box.origin.x,
    y: box.origin.y,
    width: box.size.width,
    height: box.size.height
  )
}.sorted { left, right in
  let leftTop = left.y + left.height
  let rightTop = right.y + right.height
  if abs(leftTop - rightTop) > 0.01 { return leftTop > rightTop }
  return left.x < right.x
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
let payload = try encoder.encode(lines)
FileHandle.standardOutput.write(payload)
FileHandle.standardOutput.write(Data("\n".utf8))
