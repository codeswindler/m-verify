# Microsoft Store Release

M-Verify has a dedicated MSIX build for Microsoft Store distribution. It keeps the floating window, tray, always-on-top, printing, resizing, single-instance behavior, and start-with-Windows behavior of the direct desktop build.

## Store identity

These values come from Partner Center under **Product management > Product identity** and must match the package manifest exactly:

```text
Package/Identity/Name: PulseCloud.M-Verify
Package/Identity/Publisher: CN=5444A18A-5CD7-4EBC-BEF6-8730E6535F64
Package/Properties/PublisherDisplayName: Pulse Cloud
Store ID: 9NB6KLQG3DPM
Store URL: https://apps.microsoft.com/detail/9NB6KLQG3DPM
```

The identity is public Store metadata. It is not a signing secret.

## Build the package

Install the normal Tauri prerequisites and the Windows 10/11 SDK, which supplies `MakeAppx.exe`. From the repository root, run:

```powershell
pnpm install
pnpm --filter @m-verify/desktop tauri:build:store
```

The script:

1. Builds the production frontend with the hosted M-Verify API.
2. Builds the Tauri release executable.
3. Generates the required Store tile assets.
4. Creates the MSIX with the Partner Center identity.
5. Unpacks it again and verifies its identity and version.

The result is:

```text
downloads/M-Verify-<version>-x64.msix
```

The MSIX version is derived from the desktop version. For example, desktop `0.1.18` becomes Store package version `0.1.18.0`. Increase the desktop version before every Store update because package versions must increase.

## Upload in Partner Center

1. Open **Product release > Packages**.
2. Upload the generated `.msix` file.
3. Select **Windows 10/11 Desktop** when Partner Center asks for the device family.
4. Complete the package validation messages and save the Packages section.
5. Add test credentials in certification notes using a temporary enabled business account. Do not put credentials in public listing text.

Suggested certification note:

```text
M-Verify is a Tauri/Win32 full-trust desktop client for authorized business staff to verify M-Pesa payments. The runFullTrust capability is required for the floating desktop window, system tray, always-on-top control, Windows printing, persisted window position, and external receipt sharing. The app declares a desktop startup task so it can run after user sign-in. It communicates only with https://m-verify.theleasemaster.com/api for authenticated business functions.
```

## Signing and updates

Do not sign the Partner Center upload with a self-signed certificate. Microsoft signs an approved MSIX submission with a trusted Store certificate. A locally unsigned MSIX cannot be installed by double-clicking, but it is the correct artifact for this Store submission flow.

Store-installed builds receive updates through Microsoft Store and do not run M-Verify's standalone updater. Direct website installations continue to use the NSIS `.exe` and the API updater metadata.

## Startup behavior

The MSIX declares `windows.startupTask` with `Enabled="true"`. It becomes active after the app is first launched and can still be disabled by the user in Windows Startup Apps settings. The Store build does not also create the standalone registry autostart entry, preventing duplicate startup registrations.
