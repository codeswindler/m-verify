import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { restoreStateCurrent, saveWindowState, StateFlags } from "@tauri-apps/plugin-window-state";

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

export async function startWindowDrag(): Promise<void> {
  try {
    await getCurrentWindow().startDragging();
  } catch {
    // Browser preview mode.
  }
}

export async function getCurrentAppVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return "0.1.1";
  }
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
