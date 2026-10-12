mod files;
mod workspaces;
use files::{FileData, FileError, SaveInput};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::PathBuf, sync::Mutex};
use tauri::{Emitter, Manager, State};
use workspaces::Workspace;

type Result<T> = std::result::Result<T, FileError>;
#[derive(Default)]
struct AppState {
    roots: HashMap<String, PathBuf>,
    files: HashMap<String, PathBuf>,
    watchers: Vec<RecommendedWatcher>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
    name: String,
    path: String,
    is_directory: bool,
}
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Draft {
    id: String,
    path: String,
    text: String,
    base_content: String,
    base_revision: String,
    bom: bool,
    line_ending: String,
}
fn lock<'a>(state: &'a State<'_, Mutex<AppState>>) -> Result<std::sync::MutexGuard<'a, AppState>> {
    state
        .lock()
        .map_err(|_| FileError::new("ioError", "文件服务暂不可用"))
}
fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| FileError::new("ioError", error.to_string()))?;
    fs::create_dir_all(&path)?;
    Ok(path)
}
fn watch(app: &tauri::AppHandle, state: &mut AppState, path: &std::path::Path) {
    let handle = app.clone();
    if let Ok(mut watcher) =
        notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
            if event.is_ok() {
                let _ = handle.emit("disk-change", ());
            }
        })
    {
        if watcher.watch(path, RecursiveMode::NonRecursive).is_ok() {
            state.watchers.push(watcher);
        }
    }
}
fn register(app: &tauri::AppHandle, state: &mut AppState, path: PathBuf) -> Result<FileData> {
    let file = files::read_file(&path)?;
    if !state.files.contains_key(&file.id) {
        if let Some(parent) = path.parent() {
            watch(app, state, parent);
        }
    }
    state.files.insert(file.id.clone(), path);
    Ok(file)
}
#[tauri::command]
fn list_workspaces(
    app: tauri::AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<Workspace>> {
    let mut state = lock(&state)?;
    state.roots = workspaces::load(&data_dir(&app)?)?;
    Ok(workspaces::list(&state.roots))
}
#[tauri::command]
fn remove_workspace(
    app: tauri::AppHandle,
    state: State<'_, Mutex<AppState>>,
    id: String,
) -> Result<()> {
    let mut state = lock(&state)?;
    let mut roots = state.roots.clone();
    roots.remove(&id);
    workspaces::store(&data_dir(&app)?, &roots)?;
    state.roots = roots;
    // Open documents retain their individual authorization and unsaved edits.
    Ok(())
}
#[tauri::command]
async fn choose_workspace(
    app: tauri::AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<Option<Workspace>> {
    let choice = rfd::AsyncFileDialog::new()
        .set_title("添加目录到工作区")
        .pick_folder()
        .await;
    let Some(choice) = choice else {
        return Ok(None);
    };
    let path = choice.path().canonicalize()?;
    let workspace = workspaces::describe(&path);
    let mut state = lock(&state)?;
    let mut roots = state.roots.clone();
    roots.insert(workspace.id.clone(), path);
    workspaces::store(&data_dir(&app)?, &roots)?;
    state.roots = roots;
    Ok(Some(workspace))
}
#[tauri::command]
async fn choose_file(
    app: tauri::AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<Option<FileData>> {
    let choice = rfd::AsyncFileDialog::new()
        .set_title("打开文本文件")
        .pick_file()
        .await;
    let Some(choice) = choice else {
        return Ok(None);
    };
    // Validate the selected path before canonicalizing so symbolic links stay rejected.
    files::validate_file(choice.path())?;
    register(&app, &mut *lock(&state)?, choice.path().canonicalize()?).map(Some)
}
#[tauri::command]
fn list_directory(
    state: State<'_, Mutex<AppState>>,
    workspace_id: String,
    relative: String,
) -> Result<Vec<Entry>> {
    let state = lock(&state)?;
    let root = state
        .roots
        .get(&workspace_id)
        .ok_or_else(|| FileError::new("outsideWorkspace", "工作区未授权"))?;
    let directory = if relative.is_empty() {
        root.clone()
    } else {
        files::resolve(root, &relative)?
    };
    let mut entries = Vec::new();
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let kind = entry.file_type()?;
        let name = entry.file_name().to_string_lossy().to_string();
        if kind.is_symlink()
            || matches!(
                name.as_str(),
                ".git" | "node_modules" | "target" | ".DS_Store"
            )
        {
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(root)
            .unwrap()
            .to_string_lossy()
            .to_string();
        entries.push(Entry {
            name,
            path: relative,
            is_directory: kind.is_dir(),
        });
    }
    entries.sort_by(|a, b| {
        b.is_directory
            .cmp(&a.is_directory)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}
#[tauri::command]
fn open_document(
    app: tauri::AppHandle,
    state: State<'_, Mutex<AppState>>,
    workspace_id: String,
    relative: String,
) -> Result<FileData> {
    let mut state = lock(&state)?;
    let root = state
        .roots
        .get(&workspace_id)
        .ok_or_else(|| FileError::new("outsideWorkspace", "工作区未授权"))?;
    let path = files::resolve(root, &relative)?;
    register(&app, &mut state, path)
}
#[tauri::command]
fn read_document(state: State<'_, Mutex<AppState>>, id: String) -> Result<FileData> {
    let state = lock(&state)?;
    let path = state
        .files
        .get(&id)
        .ok_or_else(|| FileError::new("outsideWorkspace", "文件未授权"))?;
    files::read_file(path)
}
#[tauri::command]
fn save_document(
    app: tauri::AppHandle,
    state: State<'_, Mutex<AppState>>,
    input: SaveInput,
) -> Result<FileData> {
    let state = lock(&state)?;
    let path = state
        .files
        .get(&input.id)
        .ok_or_else(|| FileError::new("outsideWorkspace", "文件未授权"))?;
    files::save_file(path, &input, &data_dir(&app)?.join("backups"))
}
#[tauri::command]
async fn save_as(
    app: tauri::AppHandle,
    state: State<'_, Mutex<AppState>>,
    name: String,
    text: String,
) -> Result<Option<FileData>> {
    let choice = rfd::AsyncFileDialog::new()
        .set_title("另存为")
        .set_file_name(&name)
        .save_file()
        .await;
    let Some(choice) = choice else {
        return Ok(None);
    };
    // Create only: avoid overwriting an unreviewed external file in this initial version.
    files::create_file(choice.path(), &text)?;
    register(&app, &mut *lock(&state)?, choice.path().canonicalize()?).map(Some)
}
#[tauri::command]
fn write_draft(
    app: tauri::AppHandle,
    state: State<'_, Mutex<AppState>>,
    draft: Draft,
) -> Result<()> {
    let state = lock(&state)?;
    let path = state
        .files
        .get(&draft.id)
        .ok_or_else(|| FileError::new("outsideWorkspace", "文件未授权"))?;
    if path.to_string_lossy() != draft.path {
        return Err(FileError::new("outsideWorkspace", "草稿路径不匹配"));
    }
    let directory = data_dir(&app)?.join("drafts");
    fs::create_dir_all(&directory)?;
    let bytes =
        serde_json::to_vec(&draft).map_err(|error| FileError::new("ioError", error.to_string()))?;
    use std::io::Write;
    let mut temp = tempfile::NamedTempFile::new_in(&directory)?;
    temp.write_all(&bytes)?;
    temp.as_file().sync_all()?;
    temp.persist(directory.join(format!("{}.json", draft.id)))
        .map_err(|error| FileError::from(error.error))?;
    Ok(())
}
#[tauri::command]
fn load_drafts(app: tauri::AppHandle) -> Result<Vec<Draft>> {
    let directory = data_dir(&app)?.join("drafts");
    if !directory.exists() {
        return Ok(vec![]);
    }
    let mut drafts = vec![];
    for entry in fs::read_dir(directory)? {
        let bytes = fs::read(entry?.path())?;
        if let Ok(draft) = serde_json::from_slice::<Draft>(&bytes) {
            drafts.push(draft);
        }
    }
    Ok(drafts)
}
fn draft_path(app: &tauri::AppHandle, id: &str) -> Result<PathBuf> {
    if id.len() != 64 || !id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(FileError::new("outsideWorkspace", "草稿标识无效"));
    }
    Ok(data_dir(app)?.join("drafts").join(format!("{id}.json")))
}
#[tauri::command]
fn restore_draft(
    app: tauri::AppHandle,
    state: State<'_, Mutex<AppState>>,
    id: String,
) -> Result<Option<FileData>> {
    let draft: Draft = serde_json::from_slice(&fs::read(draft_path(&app, &id)?)?)
        .map_err(|error| FileError::new("ioError", error.to_string()))?;
    match register(&app, &mut *lock(&state)?, PathBuf::from(draft.path)) {
        Ok(file) => Ok(Some(file)),
        Err(error) if error.code == "deleted" => Ok(None),
        Err(error) => Err(error),
    }
}
#[tauri::command]
fn discard_draft(app: tauri::AppHandle, id: String) -> Result<()> {
    let path = draft_path(&app, &id)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}
#[tauri::command]
fn load_image(state: State<'_, Mutex<AppState>>, id: String, relative: String) -> Result<String> {
    let state = lock(&state)?;
    let source = state
        .files
        .get(&id)
        .ok_or_else(|| FileError::new("outsideWorkspace", "文件未授权"))?;
    let parent = source.parent().unwrap();
    let path = files::resolve(parent, &relative)?;
    let mime = match path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => {
            return Err(FileError::new(
                "unsupportedFile",
                "仅预览 PNG/JPEG/GIF/WebP 图片",
            ))
        }
    };
    if fs::metadata(&path)?.len() > files::MAX_BYTES {
        return Err(FileError::new("tooLarge", "图片过大"));
    }
    let bytes = fs::read(path)?;
    // Hex transfer keeps the Rust dependency surface small; JS converts to a Blob.
    Ok(format!(
        "{};{}",
        mime,
        bytes
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>()
    ))
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(AppState::default()))
        .invoke_handler(tauri::generate_handler![
            choose_workspace,
            list_workspaces,
            remove_workspace,
            choose_file,
            list_directory,
            open_document,
            read_document,
            save_document,
            save_as,
            write_draft,
            load_drafts,
            restore_draft,
            discard_draft,
            load_image
        ])
        .run(tauri::generate_context!())
        .expect("启动墨码失败");
}
