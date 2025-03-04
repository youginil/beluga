use std::{path::Path, str::FromStr};

use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode},
    ConnectOptions, Connection, Row, SqliteConnection,
};
use tracing::debug;

use crate::model::word::WORD_TABLE;

const DB_FILE: &str = "data.db";

pub struct Database {
    pub conn: SqliteConnection,
}

impl Database {
    pub async fn new<P>(dir: P) -> Self
    where
        P: AsRef<Path>,
    {
        let file = dir.as_ref().join(DB_FILE);
        let filepath = file.to_str().unwrap();
        debug!("db file: {}", filepath);
        let exists = file.exists();
        let mut conn = match SqliteConnectOptions::from_str(&format!("sqlite://{}", filepath))
            .unwrap()
            .journal_mode(SqliteJournalMode::Wal)
            .pragma("case_sensitive_like", "1")
            .create_if_missing(true)
            .connect()
            .await
        {
            Ok(v) => v,
            Err(e) => {
                panic!("fail to connect to db file. {}", e);
            }
        };
        if !exists {
            set_user_version(&mut conn, 0).await;
        }
        let mut db = Self { conn };
        db.upgrade().await;
        db
    }

    async fn upgrade(&mut self) {
        let mut tx = self.conn.begin().await.unwrap();
        let mut version = get_user_version(&mut *tx).await;
        let init_version = version;
        if version == 0 {
            let sqls: Vec<String> = vec![
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
            ];
            for sql in &sqls {
                sqlx::query(sql.as_str())
                    .execute(&mut *tx)
                    .await
                    .expect(&format!("fail to exec sql: {}", sql));
            }
            version = 1;
        }
        if version == 1 {
            let sqls: Vec<String> = vec![format!(
                "ALTER TABLE {} ADD COLUMN \"familiar\" INTEGER NOT NULL DEFAULT 0",
                WORD_TABLE
            )];
            for sql in &sqls {
                sqlx::query(sql.as_str())
                    .execute(&mut *tx)
                    .await
                    .expect(&format!("fail to exec sql: {}", sql));
            }
            version = 2;
        }
        if init_version != version {
            set_user_version(&mut *tx, version).await;
        }
        tx.commit().await.unwrap();
    }
}

async fn get_user_version(conn: &mut SqliteConnection) -> i32 {
    let row = sqlx::query("PRAGMA user_version")
        .fetch_one(conn)
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
