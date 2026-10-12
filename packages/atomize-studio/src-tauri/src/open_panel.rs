#[tauri::command]
pub async fn open_atomize_file(window: tauri::Window) -> Result<Option<String>, String> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        use tauri::Manager;
        use tauri_plugin_fs::FsExt;

        let (sender, receiver) = std::sync::mpsc::channel();
        // A raw pointer isn't Send, so the parent window crosses to the main thread as an address.
        #[cfg(target_os = "macos")]
        let pick = {
            let parent = window.ns_window().map(|window| window as usize).unwrap_or(0);
            move || macos::pick_yaml_file(parent, sender)
        };
        // GTK widgets aren't Send either, so the parent is looked up on the main thread.
        #[cfg(target_os = "linux")]
        let pick = {
            let parent = window.clone();
            move || linux::pick_yaml_file(parent.gtk_window().ok(), sender)
        };
        window.app_handle().run_on_main_thread(pick).map_err(|error| error.to_string())?;
        let path = tauri::async_runtime::spawn_blocking(move || receiver.recv())
            .await
            .map_err(|error| error.to_string())?
            .map_err(|error| error.to_string())?;
        if let Some(path) = &path {
            if let Some(scope) = window.try_fs_scope() { scope.allow_file(path).map_err(|error| error.to_string())?; }
            window.state::<tauri::scope::Scopes>().allow_file(path).map_err(|error| error.to_string())?;
        }
        Ok(path)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = window;
        Err("UNSUPPORTED".into())
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use std::sync::mpsc::Sender;

    use block2::RcBlock;
    use objc2::{rc::Retained, MainThreadMarker};
    use objc2_app_kit::{NSModalResponse, NSModalResponseOK, NSOpenPanel, NSWindow};
    use objc2_foundation::{NSArray, NSString};

    /// Runs on the main thread, as AppKit requires. The panel is a sheet on Studio's window, so it
    /// slides down from under the title bar like other macOS dialogs; without that window it opens
    /// on its own. `done` receives the chosen path, or `None` when cancelled.
    pub fn pick_yaml_file(parent: usize, done: Sender<Option<String>>) {
        let Some(mtm) = MainThreadMarker::new() else {
            let _ = done.send(None);
            return;
        };
        let panel = NSOpenPanel::openPanel(mtm);
        panel.setCanChooseFiles(true);
        panel.setCanChooseDirectories(false);
        panel.setAllowsMultipleSelection(false);
        panel.setShowsHiddenFiles(true);
        panel.setMessage(Some(&NSString::from_str("Choose an Atomize YAML File. Hidden folders such as .atomize are shown.")));
        // allowedContentTypes needs UniformTypeIdentifiers; file extensions are enough here.
        #[allow(deprecated)]
        panel.setAllowedFileTypes(Some(&NSArray::from_retained_slice(&[NSString::from_str("yaml"), NSString::from_str("yml")])));

        // SAFETY: `parent` is the NSWindow address Tauri gave for Studio's window, which outlives the panel.
        let parent: Option<Retained<NSWindow>> = unsafe { Retained::retain(parent as *mut NSWindow) };
        let Some(parent) = parent else {
            let path = (panel.runModal() == NSModalResponseOK).then(|| chosen_path(&panel)).flatten();
            let _ = done.send(path);
            return;
        };
        let sheet = panel.clone();
        let handler = RcBlock::new(move |response: NSModalResponse| {
            let path = (response == NSModalResponseOK).then(|| chosen_path(&sheet)).flatten();
            let _ = done.send(path);
        });
        panel.beginSheetModalForWindow_completionHandler(&parent, &handler);
    }

    fn chosen_path(panel: &NSOpenPanel) -> Option<String> {
        panel.URL()?.path().map(|path| path.to_string())
    }
}

#[cfg(target_os = "linux")]
mod linux {
    use std::sync::mpsc::Sender;

    use gtk::prelude::*;

    /// Runs on the GTK main thread. GTK's own file chooser, with dot-folders shown, modal on Studio's
    /// window. `done` receives the chosen path, or `None` when cancelled.
    pub fn pick_yaml_file(parent: Option<gtk::ApplicationWindow>, done: Sender<Option<String>>) {
        let dialog = gtk::FileChooserDialog::with_buttons(
            Some("Open an Atomize YAML File"),
            parent.as_ref(),
            gtk::FileChooserAction::Open,
            &[("_Cancel", gtk::ResponseType::Cancel), ("_Open", gtk::ResponseType::Accept)],
        );
        dialog.set_modal(true);
        dialog.set_select_multiple(false);
        dialog.set_show_hidden(true);
        let filter = gtk::FileFilter::new();
        filter.set_name(Some("Atomize YAML"));
        filter.add_pattern("*.yaml");
        filter.add_pattern("*.yml");
        dialog.add_filter(filter);
        // Closing the dialog emits a second response; only the first answer is read.
        dialog.connect_response(move |dialog, response| {
            let path = (response == gtk::ResponseType::Accept)
                .then(|| dialog.filename())
                .flatten()
                .map(|path| path.to_string_lossy().into_owned());
            let _ = done.send(path);
            dialog.close();
        });
        dialog.show();
    }
}
