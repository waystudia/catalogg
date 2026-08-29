import AppKit
import Foundation
import Vision

struct BarcodeObservation: Codable {
    let payload: String
    let symbology: String
    let confidence: Float
    let x: CGFloat
    let y: CGFloat
    let width: CGFloat
    let height: CGFloat
}

guard CommandLine.arguments.count == 2 else {
    FileHandle.standardError.write(Data("Usage: recognize-barcodes.swift IMAGE\n".utf8))
    exit(2)
}

let imageURL = URL(fileURLWithPath: CommandLine.arguments[1])
guard
    let image = NSImage(contentsOf: imageURL),
    let tiff = image.tiffRepresentation,
    let bitmap = NSBitmapImageRep(data: tiff),
    let cgImage = bitmap.cgImage
else {
    FileHandle.standardError.write(Data("Could not load image: \(imageURL.path)\n".utf8))
    exit(1)
}

let request = VNDetectBarcodesRequest()
request.symbologies = [.ean8, .ean13, .upce, .code128, .code39, .code93, .itf14, .qr]

do {
    try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
    let observations = (request.results ?? []).compactMap { result -> BarcodeObservation? in
        guard let payload = result.payloadStringValue, !payload.isEmpty else { return nil }
        let box = result.boundingBox
        return BarcodeObservation(
            payload: payload,
            symbology: result.symbology.rawValue,
            confidence: result.confidence,
            x: box.origin.x,
            y: box.origin.y,
            width: box.size.width,
            height: box.size.height
        )
    }
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    FileHandle.standardOutput.write(try encoder.encode(observations))
    FileHandle.standardOutput.write(Data("\n".utf8))
} catch {
    FileHandle.standardError.write(Data("Barcode recognition failed: \(error)\n".utf8))
    exit(1)
}
