// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WebKitGTK on Linux Wayland (incl. Intel) often exits immediately unless
    // the DMABUF renderer is disabled. Must be set before GTK/WebKit init.
    #[cfg(target_os = "linux")]
    {
        // SAFETY: single-threaded, before any other threads or WebKit init.
        unsafe {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    oropis_lib::run();
}
