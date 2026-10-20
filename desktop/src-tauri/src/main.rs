// Hides the extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, RunEvent, WebviewWindow};

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
        Ok(port) => goto(&window, &format!("http://127.0.0.1:{port}/")),
        Err(e) => show_error(&window, &app, &e),
    }
}

fn main() {
    tauri::Builder::default()
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
                if let Some(mut child) = app.state::<Backend>().0.lock().unwrap().take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        });
}
