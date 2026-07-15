use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

struct TopState(Mutex<bool>);

fn is_allowed_external_url(url: &str) -> bool {
    url.starts_with("https://m-verify.theleasemaster.com/") || url.starts_with("https://wa.me/")
}

#[cfg(target_os = "windows")]
fn open_url_with_system_handler(url: &str) -> Result<(), String> {
    use std::{ffi::OsStr, os::windows::ffi::OsStrExt, ptr};
    use windows_sys::Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL};

    let operation = OsStr::new("open")
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    let target = OsStr::new(url)
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();

    let result = unsafe {
        ShellExecuteW(
            ptr::null_mut(),
            operation.as_ptr(),
            target.as_ptr(),
            ptr::null(),
            ptr::null(),
            SW_SHOWNORMAL,
        )
    };

    if result as isize <= 32 {
        return Err(format!(
            "Windows could not open the link (code {})",
            result as isize
        ));
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn open_url_with_system_handler(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = std::process::Command::new("xdg-open");

    command
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    if !is_allowed_external_url(&url) {
        return Err("This external link is not allowed".to_string());
    }

    open_url_with_system_handler(&url)
}

#[cfg(test)]
mod tests {
    use super::is_allowed_external_url;

    #[test]
    fn allows_only_known_external_hosts() {
        assert!(is_allowed_external_url(
            "https://wa.me/?text=Verified%20payment"
        ));
        assert!(is_allowed_external_url(
            "https://m-verify.theleasemaster.com/downloads/M-Verify-Setup.exe"
        ));
        assert!(!is_allowed_external_url(
            "https://wa.me.evil.example/?text=receipt"
        ));
        assert!(!is_allowed_external_url(
            "file:///C:/Users/william/Documents"
        ));
    }
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn create_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show M-Verify", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "Hide to tray", true, None::<&str>)?;
    let always_on_top = MenuItem::with_id(
        app,
        "always_on_top",
        "Toggle always on top",
        true,
        None::<&str>,
    )?;
    let logout = MenuItem::with_id(app, "logout", "Show login", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &hide, &always_on_top, &logout, &quit])?;

    let mut tray = TrayIconBuilder::new()
        .tooltip("M-Verify")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" | "logout" => show_main_window(app),
            "hide" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            "always_on_top" => {
                if let Some(window) = app.get_webview_window("main") {
                    let next = {
                        let state = app.state::<TopState>();
                        let mut value = state.0.lock().expect("top state lock poisoned");
                        *value = !*value;
                        *value
                    };
                    let _ = window.set_always_on_top(next);
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    tray.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }));
    }

    builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(TopState(Mutex::new(true)))
        .invoke_handler(tauri::generate_handler![open_external_url])
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_autostart::MacosLauncher;
                app.handle().plugin(tauri_plugin_autostart::init(
                    MacosLauncher::LaunchAgent,
                    Some(vec![]),
                ))?;
                create_tray(app)?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running M-Verify");
}
