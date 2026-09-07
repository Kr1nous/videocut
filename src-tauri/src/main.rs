#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;

use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

struct Sidecar(Mutex<Option<Child>>);

fn project_root() -> PathBuf {
    let mut dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    if dir.ends_with("src-tauri") {
        dir.pop();
    }
    dir
}

fn user_data_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    PathBuf::from(home).join("Library/Application Support/剪辑台")
}

fn which(bin: &str) -> Option<PathBuf> {
    let out = Command::new("/usr/bin/which").arg(bin).output().ok()?;
    if !out.status.success() {
        return None;
    }
    let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if p.is_empty() {
        None
    } else {
        Some(PathBuf::from(p))
    }
}

fn payload_dir(app: &tauri::AppHandle) -> PathBuf {
    let res = app
        .path()
        .resource_dir()
        .unwrap_or_else(|_| project_root().join("src-tauri/resources"));
    if res.join("sidecar/index.js").exists() {
        return res;
    }
    let nested = res.join("resources");
    if nested.join("sidecar/index.js").exists() {
        return nested;
    }
    res
}

fn find_node(resource_dir: Option<&PathBuf>) -> PathBuf {
    if let Some(dir) = resource_dir {
        let bundled = dir.join("node");
        if bundled.exists() {
            return bundled;
        }
    }
    if let Some(p) = which("node") {
        return p;
    }
    let home_node = PathBuf::from(std::env::var("HOME").unwrap_or_default()).join("homebrew/bin/node");
    for path in [
        PathBuf::from("/usr/local/bin/node"),
        PathBuf::from("/opt/homebrew/bin/node"),
        home_node,
    ] {
        if path.exists() {
            return path;
        }
    }
    PathBuf::from("node")
}

fn pipe_output(child: &mut Child) {
    if let Some(stdout) = child.stdout.take() {
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                eprintln!("[sidecar] {line}");
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                eprintln!("[sidecar] {line}");
            }
        });
    }
}

fn spawn_sidecar(app: &tauri::AppHandle) -> std::io::Result<Child> {
    let data = user_data_dir();
    std::fs::create_dir_all(&data).ok();

    let mut cmd = if cfg!(debug_assertions) {
        let root = project_root();
        let tsx = root.join("node_modules/.bin/tsx");
        let mut c = Command::new(tsx);
        c.arg("src/main/sidecar.ts").current_dir(&root);
        c
    } else {
        let res = payload_dir(app);
        let node = find_node(Some(&res));
        let script = res.join("sidecar/index.js");
        let mut c = Command::new(node);
        c.arg(&script);
        c.env("CUT_STUDIO_CLI", res.join("cli"));
        c.env("CUT_STUDIO_ROOT", &res);
        c.current_dir(&res);
        c
    };

    cmd.env("CUT_STUDIO_USER_DATA", &data);
    cmd.env("CUT_STUDIO_API_PORT", "4878");
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd.spawn()?;
    pipe_output(&mut child);
    Ok(child)
}

fn build_menu(app: &tauri::AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let new_item = MenuItemBuilder::with_id("new", "新建项目…")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let open_item = MenuItemBuilder::with_id("open", "打开项目…")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let import_item = MenuItemBuilder::with_id("import", "导入素材…")
        .accelerator("CmdOrCtrl+I")
        .build(app)?;
    let terminal_item = MenuItemBuilder::with_id("terminal", "终端")
        .accelerator("CmdOrCtrl+`")
        .build(app)?;
    let undo_item = MenuItemBuilder::with_id("undo", "撤销")
        .accelerator("CmdOrCtrl+Z")
        .build(app)?;
    let redo_item = MenuItemBuilder::with_id("redo", "重做")
        .accelerator("Shift+CmdOrCtrl+Z")
        .build(app)?;

    let app_menu = SubmenuBuilder::new(app, "剪辑台")
        .about(Some(AboutMetadata {
            name: Some("剪辑台".into()),
            ..Default::default()
        }))
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let file_menu = SubmenuBuilder::new(app, "文件")
        .item(&new_item)
        .item(&open_item)
        .separator()
        .item(&import_item)
        .separator()
        .close_window()
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "编辑")
        .item(&undo_item)
        .item(&redo_item)
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "显示")
        .item(&terminal_item)
        .separator()
        .fullscreen()
        .build()?;

    MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .build()
}

#[tauri::command]
fn show_in_folder(path: String) -> Result<(), String> {
    Command::new("open")
        .args(["-R", &path])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn open_privacy_settings() -> Result<(), String> {
    let urls = [
        "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AllFiles",
        "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
    ];
    for url in urls {
        if Command::new("open")
            .arg(url)
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
        {
            return Ok(());
        }
    }
    Err("无法打开系统设置".into())
}

fn main() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![show_in_folder, open_privacy_settings])
        .setup(|app| {
            let menu = build_menu(app.handle())?;
            app.set_menu(menu)?;
            let child = match spawn_sidecar(app.handle()) {
                Ok(child) => Some(child),
                Err(e) => {
                    eprintln!("failed to spawn sidecar: {e}");
                    None
                }
            };
            app.manage(Sidecar(Mutex::new(child)));
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            let payload = match id {
                "new" => "menu:new",
                "open" => "menu:open",
                "import" => "menu:import",
                "terminal" => "menu:terminal",
                "undo" => "menu:undo",
                "redo" => "menu:redo",
                _ => return,
            };
            let _ = app.emit("menu", payload);
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if cfg!(target_os = "macos") {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        });

    let context = tauri::generate_context!();
    let app = builder
        .build(context)
        .expect("error while building 剪辑台");
    app.run(|app, event| {
        match event {
            RunEvent::Reopen { has_visible_windows, .. } => {
                if !has_visible_windows {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
            }
            RunEvent::Exit | RunEvent::ExitRequested { .. } => {
                if let Some(state) = app.try_state::<Sidecar>() {
                    if let Ok(mut slot) = state.0.lock() {
                        if let Some(child) = slot.as_mut() {
                            let _ = child.kill();
                        }
                    }
                }
            }
            _ => {}
        }
    });
}
