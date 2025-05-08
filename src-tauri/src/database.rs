use std::{fs, path::Path};

use log::{debug, error};
use sqlx::{sqlite::SqlitePoolOptions, Executor, Row, SqliteConnection, SqlitePool};

use crate::model::{book::BOOK_TABLE, word::WORD_TABLE};

const DB_FILE: &str = "data.db";

pub struct Database {
    pub pool: SqlitePool,
}

impl Database {
    pub async fn new<P>(dir: P) -> Self
    where
        P: AsRef<Path>,
    {
        let file = dir.as_ref().join(DB_FILE);
        if !fs::exists(&file).unwrap() {
            fs::File::create(&file).expect("fail to create db file");
        }
        let filepath = file.to_str().unwrap();
        debug!("db file: {}", filepath);
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_lazy(&format!("sqlite://{}", filepath))
            .expect("fail to connect to database");
        if let Err(e) = pool.execute("PRAGMA journal_mode=WAL").await {
            error!("fail to execute sql. {:?}", e);
        }
        pool.execute("PRAGMA case_sensitive_like=ON").await.unwrap();
        let db = Self { pool };
        db.upgrade().await;
        db
    }

    async fn upgrade(&self) {
        let mut tx = self.pool.begin().await.unwrap();
        let mut version = get_user_version(&mut tx).await;
        let init_version = version;
        let mut sqls: Vec<String> = vec![];
        if version == 0 {
            sqls.extend_from_slice(&vec![
                format!("DROP TABLE IF EXISTS {}", WORD_TABLE),
                format!(
                    "CREATE TABLE {} (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT    NOT NULL,
                create_time INTEGER NOT NULL
            );",
                    WORD_TABLE
                ),
                format!("CREATE UNIQUE INDEX word_name ON {} (name)", WORD_TABLE),
                format!(
                    "CREATE INDEX word_create_time ON {} (create_time);",
                    WORD_TABLE
                ),
            ]);
            version = 1;
        }
        if version == 1 {
            sqls.extend_from_slice(&vec![format!(
                "ALTER TABLE {} ADD COLUMN \"familiar\" INTEGER NOT NULL DEFAULT 0",
                WORD_TABLE
            )]);
            version = 2;
        }
        if version == 2 {
            sqls.extend_from_slice(&vec![
                "DROP INDEX IF EXISTS word_name".to_string(),
                format!(
                    "ALTER TABLE {} ADD COLUMN \"book_id\" INTEGER NOT NULL DEFAULT 0",
                    WORD_TABLE
                ),
                format!(
                    "CREATE UNIQUE INDEX word_book_id_name ON {} (book_id, name)",
                    WORD_TABLE
                ),
                format!("DROP TABLE IF EXISTS {}", BOOK_TABLE),
                format!(
                    "CREATE TABLE {} (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT    NOT NULL,
                create_time INTEGER NOT NULL
            )",
                    BOOK_TABLE
                ),
            ]);
            version = 3;
        }
        for sql in &sqls {
            sqlx::query(sql.as_str())
                .execute(&mut *tx)
                .await
                .expect(&format!("fail to exec sql: {}", sql));
        }
        if init_version != version {
            set_user_version(&mut *tx, version).await;
        }
        tx.commit().await.unwrap();
    }
}

async fn get_user_version(conn: &mut SqliteConnection) -> i32 {
    let row = conn
        .fetch_one("PRAGMA user_version")
        .await
        .expect("fail to get user_version");
    let version: i32 = row.get("user_version");
    version
}

async fn set_user_version(conn: &mut SqliteConnection, version: i32) {
    let sql = format!("PRAGMA user_version = {}", version);
    sqlx::query(&sql)
        .execute(conn)
        .await
        .expect("fail to set user_version");
}
