import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { restoreStateCurrent, saveWindowState, StateFlags } from "@tauri-apps/plugin-window-state";

type TauriUpdate = NonNullable<Awaited<ReturnType<typeof check>>>;

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

export async function getCurrentAppVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return "0.1.17";
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
