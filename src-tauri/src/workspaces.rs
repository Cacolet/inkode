use crate::files::{hash, FileError};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
};

type Result<T> = std::result::Result<T, FileError>;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub path: String,
}
pub fn describe(path: &Path) -> Workspace {
    Workspace {
        id: hash(path.to_string_lossy().as_bytes()),
        name: path
            .file_name()
            .unwrap_or(path.as_os_str())
            .to_string_lossy()
            .into(),
        path: path.to_string_lossy().into(),
    }
}
pub fn list(roots: &HashMap<String, PathBuf>) -> Vec<Workspace> {
    let mut items: Vec<_> = roots.values().map(|path| describe(path)).collect();
    items.sort_by(|a, b| a.path.cmp(&b.path));
    items
}
pub fn load(directory: &Path) -> Result<HashMap<String, PathBuf>> {
    let bytes = match fs::read(directory.join("workspaces.json")) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(HashMap::new()),
        Err(error) => return Err(error.into()),
    };
    let paths: Vec<PathBuf> = serde_json::from_slice(&bytes)
        .map_err(|error| FileError::new("ioError", format!("目录列表读取失败：{error}")))?;
    // Keep unavailable directories visible so the user can remove or reconnect them.
    // A replaced symlink must not silently grant access to a different directory.
    Ok(paths
        .into_iter()
        .filter(|path| match path.canonicalize() {
            Ok(actual) => actual == *path,
            Err(_) => true,
        })
        .map(|path| (describe(&path).id, path))
        .collect())
}
pub fn store(directory: &Path, roots: &HashMap<String, PathBuf>) -> Result<()> {
    let mut paths: Vec<_> = roots.values().collect();
    paths.sort();
    let bytes =
        serde_json::to_vec(&paths).map_err(|error| FileError::new("ioError", error.to_string()))?;
    let mut temporary = tempfile::NamedTempFile::new_in(directory)?;
    temporary.write_all(&bytes)?;
    temporary.as_file().sync_all()?;
    temporary
        .persist(directory.join("workspaces.json"))
        .map_err(|error| FileError::new("ioError", error.to_string()))?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn persists_multiple_roots_deduplicates_and_removes_without_deleting_files() {
        let data = tempfile::tempdir().unwrap();
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        let first = first.path().canonicalize().unwrap();
        let second = second.path().canonicalize().unwrap();
        fs::write(first.join("keep.md"), "keep me").unwrap();
        let mut roots = load(data.path()).unwrap();
        for path in [&first, &second, &first] {
            roots.insert(describe(path).id, path.clone());
        }
        store(data.path(), &roots).unwrap();
        let mut restored = load(data.path()).unwrap();
        assert_eq!(restored.len(), 2);
        restored.remove(&describe(&first).id);
        store(data.path(), &restored).unwrap();
        assert_eq!(load(data.path()).unwrap().len(), 1);
        assert_eq!(
            fs::read_to_string(first.join("keep.md")).unwrap(),
            "keep me"
        );
    }
    #[test]
    fn unavailable_roots_remain_removable() {
        let data = tempfile::tempdir().unwrap();
        let missing = data.path().join("missing");
        let roots = HashMap::from([(describe(&missing).id, missing)]);
        store(data.path(), &roots).unwrap();
        assert_eq!(load(data.path()).unwrap().len(), 1);
    }
}
