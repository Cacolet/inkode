use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
};

pub const MAX_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileData {
    pub id: String,
    pub path: String,
    pub name: String,
    pub text: String,
    pub revision: String,
    pub bom: bool,
    pub line_ending: String,
    pub read_only: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileError {
    pub code: String,
    pub message: String,
}
impl FileError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}
impl From<std::io::Error> for FileError {
    fn from(error: std::io::Error) -> Self {
        let code = match error.kind() {
            std::io::ErrorKind::NotFound => "deleted",
            std::io::ErrorKind::PermissionDenied => "permissionDenied",
            _ => "ioError",
        };
        Self::new(code, error.to_string())
    }
}

pub fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub fn validate_file(path: &Path) -> Result<(), FileError> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(FileError::new(
            "unsupportedFile",
            "不能编辑符号链接或非普通文件",
        ));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if metadata.nlink() > 1 {
            return Err(FileError::new("unsupportedFile", "硬链接文件请先另存副本"));
        }
    }
    if metadata.len() > MAX_BYTES {
        return Err(FileError::new("tooLarge", "初版支持 10 MiB 以内的文本文件"));
    }
    Ok(())
}

pub fn read_file(path: &Path) -> Result<FileData, FileError> {
    validate_file(path)?;
    let bytes = fs::read(path)?;
    let revision = hash(&bytes);
    let bom = bytes.starts_with(&[0xef, 0xbb, 0xbf]);
    let payload = if bom { &bytes[3..] } else { &bytes };
    if payload.contains(&0) {
        return Err(FileError::new("binaryFile", "该文件不是可编辑的文本文件"));
    }
    let raw = std::str::from_utf8(payload)
        .map_err(|_| FileError::new("unsupportedEncoding", "初版仅支持 UTF-8 编码"))?;
    let crlf = raw.matches("\r\n").count();
    let lf = raw.matches('\n').count();
    let bare_cr = raw.replace("\r\n", "").contains('\r');
    let mixed = (crlf > 0 && crlf != lf) || bare_cr;
    let line_ending = if mixed {
        "MIXED"
    } else if crlf > 0 {
        "CRLF"
    } else {
        "LF"
    };
    let path_string = path.to_string_lossy().to_string();
    Ok(FileData {
        id: hash(path_string.as_bytes()),
        path: path_string,
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into(),
        text: raw.replace("\r\n", "\n"),
        revision,
        bom,
        line_ending: line_ending.into(),
        read_only: mixed || fs::metadata(path)?.permissions().readonly(),
    })
}

pub fn resolve(root: &Path, relative: &str) -> Result<PathBuf, FileError> {
    let relative = Path::new(relative);
    if relative.is_absolute()
        || relative
            .components()
            .any(|part| !matches!(part, Component::Normal(_) | Component::CurDir))
    {
        return Err(FileError::new("outsideWorkspace", "路径超出工作区"));
    }
    let mut joined = root.to_path_buf();
    for component in relative.components() {
        joined.push(component);
        if fs::symlink_metadata(&joined)?.file_type().is_symlink() {
            return Err(FileError::new("outsideWorkspace", "初版不访问符号链接"));
        }
    }
    let canonical = joined.canonicalize()?;
    if !canonical.starts_with(root) {
        return Err(FileError::new("outsideWorkspace", "路径超出工作区"));
    }
    Ok(canonical)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveInput {
    pub id: String,
    pub expected_revision: String,
    pub text: String,
    pub bom: bool,
    pub line_ending: String,
}

pub fn save_file(path: &Path, input: &SaveInput, backup_dir: &Path) -> Result<FileData, FileError> {
    validate_file(path)?;
    let original = fs::read(path)?;
    if hash(&original) != input.expected_revision {
        return Err(FileError::new(
            "revisionConflict",
            "磁盘文件已变化，请先处理外部修改",
        ));
    }
    if input.line_ending != "LF" && input.line_ending != "CRLF" {
        return Err(FileError::new(
            "unsupportedEncoding",
            "混合换行文件需要先转换副本",
        ));
    }
    let text = if input.line_ending == "CRLF" {
        input.text.replace('\n', "\r\n")
    } else {
        input.text.clone()
    };
    let mut bytes = Vec::new();
    if input.bom {
        bytes.extend_from_slice(&[0xef, 0xbb, 0xbf]);
    }
    bytes.extend_from_slice(text.as_bytes());
    if bytes.len() as u64 > MAX_BYTES {
        return Err(FileError::new("tooLarge", "文件内容超过 10 MiB"));
    }
    let parent = path
        .parent()
        .ok_or_else(|| FileError::new("ioError", "文件没有父目录"))?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    temporary
        .as_file()
        .set_permissions(fs::metadata(path)?.permissions())?;
    temporary.write_all(&bytes)?;
    temporary.as_file().sync_all()?;
    fs::create_dir_all(backup_dir)?;
    fs::write(backup_dir.join(format!("{}.bak", input.id)), &original)?;
    if hash(&fs::read(path)?) != input.expected_revision {
        return Err(FileError::new("revisionConflict", "保存前磁盘文件再次变化"));
    }
    temporary
        .persist(path)
        .map_err(|error| FileError::from(error.error))?;
    read_file(path)
}

pub fn create_file(path: &Path, text: &str) -> Result<(), FileError> {
    if text.len() as u64 > MAX_BYTES {
        return Err(FileError::new("tooLarge", "文件内容超过 10 MiB"));
    }
    let parent = path
        .parent()
        .ok_or_else(|| FileError::new("ioError", "文件没有父目录"))?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    temporary.write_all(text.as_bytes())?;
    temporary.as_file().sync_all()?;
    temporary
        .persist_noclobber(path)
        .map_err(|error| FileError::from(error.error))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_bom_crlf_and_rejects_stale_save() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.md");
        let original = b"\xef\xbb\xbf# title\r\nhello\r\n";
        fs::write(&path, original).unwrap();
        let file = read_file(&path).unwrap();
        let input = SaveInput {
            id: file.id,
            expected_revision: file.revision,
            text: file.text,
            bom: file.bom,
            line_ending: file.line_ending,
        };
        save_file(&path, &input, &dir.path().join("backups")).unwrap();
        assert_eq!(fs::read(&path).unwrap(), original);
        fs::write(&path, "external").unwrap();
        assert_eq!(
            save_file(&path, &input, &dir.path().join("backups"))
                .unwrap_err()
                .code,
            "revisionConflict"
        );
        assert_eq!(fs::read_to_string(&path).unwrap(), "external");
    }
    #[test]
    fn protects_workspace_and_non_utf8() {
        let dir = tempfile::tempdir().unwrap();
        assert!(resolve(dir.path(), "../outside").is_err());
        fs::write(dir.path().join("binary"), [0, 1]).unwrap();
        assert_eq!(
            read_file(&dir.path().join("binary")).unwrap_err().code,
            "binaryFile"
        );
        fs::write(dir.path().join("mixed"), "a\r\nb\n").unwrap();
        assert!(read_file(&dir.path().join("mixed")).unwrap().read_only);
    }
    #[test]
    fn new_file_is_atomic_and_never_overwrites_existing_target() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("new.md");
        create_file(&path, "first").unwrap();
        assert!(create_file(&path, "second").is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), "first");
    }
}
