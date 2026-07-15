import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { restoreStateCurrent, saveWindowState, StateFlags } from "@tauri-apps/plugin-window-state";

type TauriUpdate = NonNullable<Awaited<ReturnType<typeof check>>>;

export const isMicrosoftStoreBuild = import.meta.env.VITE_MICROSOFT_STORE === "true";

export type NativeUpdateInfo = {
  kind: "native";
  version: string;
  currentVersion: string;
  notes?: string;
  date?: string;
  update: TauriUpdate;
};

export type UpdateInstallProgress = {
  status: "started" | "downloading" | "finished";
  downloaded?: number;
  total?: number;
};

export type WindowSizeSnapshot = {
  width: number;
  height: number;
};

export async function hideWindow(): Promise<void> {
  try {
    await getCurrentWindow().hide();
  } catch {
    // Browser preview mode.
  }
}

export async function setAlwaysOnTop(value: boolean): Promise<void> {
  try {
    await getCurrentWindow().setAlwaysOnTop(value);
  } catch {
    // Browser preview mode.
  }
}

export async function startWindowResize(): Promise<void> {
  try {
    await getCurrentWindow().startResizeDragging("SouthEast");
  } catch {
    // Browser preview mode.
  }
}

export async function expandWindowForReceipt(): Promise<WindowSizeSnapshot | null> {
  try {
    const currentWindow = getCurrentWindow();
    const [size, scaleFactor] = await Promise.all([currentWindow.innerSize(), currentWindow.scaleFactor()]);
    const previous = {
      width: Math.round(size.width / scaleFactor),
      height: Math.round(size.height / scaleFactor)
    };
    const width = Math.max(previous.width, 460);
    const height = Math.max(previous.height, 720);
    if (width !== previous.width || height !== previous.height) {
      await currentWindow.setSize(new LogicalSize(width, height));
    }
    return previous;
  } catch {
    return null;
  }
}

export async function restoreWindowSize(snapshot: WindowSizeSnapshot | null): Promise<void> {
  if (!snapshot) return;
  try {
    await getCurrentWindow().setSize(new LogicalSize(snapshot.width, snapshot.height));
  } catch {
    // Browser preview mode.
  }
}

export async function getCurrentAppVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return "0.1.19";
  }
}

export async function checkNativeUpdate(): Promise<NativeUpdateInfo | null> {
  try {
    const update = await check({ timeout: 30_000 });
    if (!update) return null;
    return {
      kind: "native",
      version: update.version,
      currentVersion: update.currentVersion,
      notes: update.body,
      date: update.date,
      update
    };
  } catch {
    return null;
  }
}

export async function installNativeUpdate(
  updateInfo: NativeUpdateInfo,
  onProgress: (progress: UpdateInstallProgress) => void
): Promise<void> {
  let downloaded = 0;
  let total: number | undefined;
  await updateInfo.update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        downloaded = 0;
        total = event.data.contentLength ?? undefined;
        onProgress({ status: "started", downloaded, total });
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress({ status: "downloading", downloaded, total });
        break;
      case "Finished":
        onProgress({ status: "finished", downloaded, total });
        break;
    }
  });
  await relaunch();
}

export async function openExternalUrl(url: string): Promise<void> {
  try {
    await invoke("open_external_url", { url });
  } catch {
    window.location.href = url;
  }
}

export async function enableAutostartOnce(): Promise<void> {
  try {
    if (!(await isEnabled())) {
      await enable();
    }
  } catch {
    // Browser preview mode or unsupported environment.
  }
}

export async function restoreWindowState(): Promise<void> {
  try {
    await restoreStateCurrent(StateFlags.ALL);
  } catch {
    // Browser preview mode.
  }
}

export async function saveCurrentWindowState(): Promise<void> {
  try {
    await saveWindowState(StateFlags.ALL);
  } catch {
    // Browser preview mode.
  }
}
