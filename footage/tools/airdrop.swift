// airdrop: open the macOS AirDrop window with the given files (pick the iPhone, done).
// build: swiftc -O airdrop.swift -o .airdrop      usage: tools/.airdrop file1 file2 ...
import AppKit

final class Delegate: NSObject, NSSharingServiceDelegate {
    func sharingService(_ s: NSSharingService, didShareItems items: [Any]) {
        print("sent \(items.count) file(s)"); exit(0)
    }
    func sharingService(_ s: NSSharingService, didFailToShareItems items: [Any], error: Error) {
        print("not sent: \(error.localizedDescription)"); exit(1)
    }
}

let urls = CommandLine.arguments.dropFirst().map { URL(fileURLWithPath: $0) }
guard !urls.isEmpty else { print("usage: airdrop file ..."); exit(2) }
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = Delegate()
guard let service = NSSharingService(named: .sendViaAirDrop), service.canPerform(withItems: urls) else {
    print("AirDrop not available"); exit(1)
}
service.delegate = delegate
DispatchQueue.main.async {
    app.activate(ignoringOtherApps: true)
    service.perform(withItems: urls)
}
app.run()
