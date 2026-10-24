// Hides the extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, RunEvent, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::UpdaterExt;

/// Port tried first. A stable origin matters: the UI keeps its settings in the webview's
/// localStorage, which is per origin (scheme + host + PORT). A random port every launch would
/// forget your settings every launch. Only if this port is taken do we fall back to a random one.
const PREFERRED_PORT: u16 = 47821;
const STARTUP_TIMEOUT: Duration = Duration::from_secs(180);

struct Backend(Mutex<Option<Child>>);

fn pick_port() -> u16 {
    for addr in [format!("127.0.0.1:{PREFERRED_PORT}"), "127.0.0.1:0".to_string()] {
        if let Ok(l) = TcpListener::bind(&addr) {
            if let Ok(a) = l.local_addr() {
                return a.port();
            }
        }
    }
    PREFERRED_PORT
}

fn backend_exe(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().resource_dir().map_err(|e| e.to_string())?.join("backend");
    let exe = dir.join(if cfg!(windows) { "resector-backend.exe" } else { "resector-backend" });
    if exe.exists() {
        Ok(exe)
    } else {
        Err(format!("Backend not found at {}", exe.display()))
    }
}

fn start_backend(app: &AppHandle) -> Result<u16, String> {
    let exe = backend_exe(app)?;
    let resources = app.path().resource_dir().map_err(|e| e.to_string())?;
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&data_dir).map_err(|e| format!("Cannot create {}: {e}", data_dir.display()))?;

    let port = pick_port();
    let mut cmd = Command::new(&exe);
    cmd.current_dir(exe.parent().unwrap())
        .env("RESECTOR_PORT", port.to_string())
        .env("DATA_DIR", &data_dir)
        .env("FRONTEND_DIR", resources.join("frontend"))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null()); // the backend writes its own log: <data dir>/logs/backend.log

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }

    let child = cmd.spawn().map_err(|e| format!("Could not start the backend: {e}"))?;
    *app.state::<Backend>().0.lock().unwrap() = Some(child);
    Ok(port)
}

/// uvicorn opens its socket only after the app's startup finished (database ready, embedding
/// model warmed up), so "port accepts connections" means "backend ready".
fn wait_ready(app: &AppHandle, port: u16) -> Result<(), String> {
    let addr: SocketAddr = ([127, 0, 0, 1], port).into();
    let start = Instant::now();
    loop {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok() {
            return Ok(());
        }
        if let Some(child) = app.state::<Backend>().0.lock().unwrap().as_mut() {
            if let Ok(Some(status)) = child.try_wait() {
                return Err(format!("The backend exited during startup ({status})."));
            }
        }
        if start.elapsed() > STARTUP_TIMEOUT {
            return Err("The backend did not become ready in time.".into());
        }
        thread::sleep(Duration::from_millis(300));
    }
}

/// Appends a line to <data dir>/logs/shell.log (the app has no console, so this is how we see
/// update problems).
fn shell_log(app: &AppHandle, msg: &str) {
    use std::io::Write;
    if let Ok(dir) = app.path().app_data_dir() {
        let dir = dir.join("logs");
        let _ = std::fs::create_dir_all(&dir);
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(dir.join("shell.log")) {
            let secs = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let _ = writeln!(f, "[{secs}] {msg}");
        }
    }
}

fn kill_backend(app: &AppHandle) {
    if let Some(mut child) = app.state::<Backend>().0.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

/// Asks GitHub Releases (see plugins.updater in tauri.conf.json) whether a newer signed version exists.
/// If so, asks the user; on "Update now" it downloads, stops the backend (Windows cannot overwrite a
/// running exe), installs and restarts. Network problems are ignored: the app just keeps working.
async fn check_for_update(app: AppHandle) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    shell_log(&app, &format!("update check: running version {}", app.package_info().version));
    let Some(update) = app.updater()?.check().await? else {
        shell_log(&app, "update check: no newer version");
        return Ok(());
    };
    shell_log(&app, &format!("update check: found version {}", update.version));
    let notes: String = update.body.clone().unwrap_or_default().chars().take(600).collect();
    let msg = format!(
        "ReSector {} is available (you have {}).\n\n{}\n\nYour data and settings are kept.",
        update.version,
        app.package_info().version,
        notes
    );
    let accepted = app
        .dialog()
        .message(msg)
        .title("Update available")
        .buttons(MessageDialogButtons::OkCancelCustom("Update now".into(), "Later".into()))
        .blocking_show();
    if !accepted {
        shell_log(&app, "update: user chose Later");
        return Ok(());
    }
    shell_log(&app, "update: downloading");
    let bytes = update.download(|_chunk, _total| {}, || {}).await?;
    shell_log(&app, "update: installing");
    kill_backend(&app);
    update.install(bytes)?;
    app.restart() // on Windows install() already exited the process and the installer relaunches the app
}

fn goto(window: &WebviewWindow, url: &str) {
    let _ = window.eval(&format!("window.location.replace({})", serde_json::to_string(url).unwrap()));
}

fn show_error(window: &WebviewWindow, app: &AppHandle, msg: &str) {
    let log = app
        .path()
        .app_data_dir()
        .map(|p| p.join("logs").join("backend.log").display().to_string())
        .unwrap_or_default();
    let full = format!("{msg}\n\nLog file:\n{log}");
    let _ = window.eval(&format!("window.showError({})", serde_json::to_string(&full).unwrap()));
}

fn launch(app: AppHandle) {
    thread::sleep(Duration::from_millis(700)); // let the splash page finish loading
    let Some(window) = app.get_webview_window("main") else { return };

    // UI development: `RESECTOR_DEV_URL=http://localhost:3000 npm run dev` skips the bundled backend.
    if let Ok(url) = std::env::var("RESECTOR_DEV_URL") {
        goto(&window, &url);
        return;
    }

    match start_backend(&app).and_then(|port| wait_ready(&app, port).map(|_| port)) {
        Ok(port) => {
            goto(&window, &format!("http://127.0.0.1:{port}/"));
            thread::sleep(Duration::from_secs(4)); // let the UI appear before any prompt
            if let Err(e) = tauri::async_runtime::block_on(check_for_update(app.clone())) {
                shell_log(&app, &format!("update check failed: {e}"));
            }
        }
        Err(e) => show_error(&window, &app, &e),
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            app.manage(Backend(Mutex::new(None)));
            let handle = app.handle().clone();
            thread::spawn(move || launch(handle));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building ReSector")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                kill_backend(app);
            }
        });
}
