pub mod types;

pub use types::*;

use std::fs;
use std::io;
use std::path::Path;

/// Read a Unity file from disk and normalize line endings (CRLF → LF).
///
/// All Unity YAML parsing depends on LF-only content — regex patterns use literal \n
/// for block header matching, and split('\n') is used for grep line indexing.
pub fn read_unity_file<P: AsRef<Path>>(path: P) -> io::Result<String> {
    let content = fs::read_to_string(path)?;
    if content.contains('\r') {
        Ok(content.replace("\r\n", "\n"))
    } else {
        Ok(content)
    }
}

#[cfg(test)]
mod io_tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_read_unity_file_normalizes_crlf() {
        let mut tmp = tempfile::NamedTempFile::new().unwrap();
        tmp.write_all(b"--- !u!1 &100\r\nGameObject:\r\n  m_Name: Test\r\n").unwrap();
        let content = read_unity_file(tmp.path()).unwrap();
        assert!(!content.contains('\r'), "CRLF should be normalized to LF");
        assert!(content.contains("--- !u!1 &100\nGameObject:\n  m_Name: Test\n"));
    }

    #[test]
    fn test_read_unity_file_preserves_lf() {
        let mut tmp = tempfile::NamedTempFile::new().unwrap();
        tmp.write_all(b"--- !u!1 &100\nGameObject:\n  m_Name: Test\n").unwrap();
        let content = read_unity_file(tmp.path()).unwrap();
        assert_eq!(content, "--- !u!1 &100\nGameObject:\n  m_Name: Test\n");
    }

    #[test]
    fn test_read_unity_file_nonexistent() {
        let result = read_unity_file("/nonexistent/path/12345.unity");
        assert!(result.is_err());
    }
}
