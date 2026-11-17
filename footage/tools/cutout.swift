// cutout: person mask from a photo, using Apple Vision (no extra installs).
// usage: swift cutout.swift in.jpg out_mask.png
// Writes a grayscale PNG (white = person) at the input's size.
import Foundation
import Vision
import CoreImage
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count == 3 else { print("usage: cutout in.jpg out_mask.png"); exit(1) }
let url = URL(fileURLWithPath: args[1])
guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
      let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { print("can't read \(args[1])"); exit(1) }

let req = VNGeneratePersonSegmentationRequest()
req.qualityLevel = .accurate
req.outputPixelFormat = kCVPixelFormatType_OneComponent8
try VNImageRequestHandler(cgImage: img).perform([req])
guard let buf = req.results?.first?.pixelBuffer else { print("no person found"); exit(2) }

var mask = CIImage(cvPixelBuffer: buf)
mask = mask.transformed(by: CGAffineTransform(scaleX: CGFloat(img.width) / mask.extent.width,
                                              y: CGFloat(img.height) / mask.extent.height))
let ctx = CIContext()
let out = URL(fileURLWithPath: args[2])
try ctx.writePNGRepresentation(of: mask, to: out, format: .L8, colorSpace: CGColorSpace(name: CGColorSpace.linearGray)!)
print("ok \(img.width)x\(img.height)")
