use crate::error::Result;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, QueryBuilder, Row, Sqlite, SqliteConnection};
use tracing::error;

use super::RowID;

pub const WORD_TABLE: &str = "word";

#[derive(FromRow, Clone, Serialize, Deserialize)]
pub struct WordModel {
    pub id: RowID,
    pub name: String,
    pub familiar: u32,
    pub create_time: i64,
}

impl WordModel {
    pub async fn insert(&mut self, conn: &mut SqliteConnection) -> Result<i64> {
        let sql = format!(
            "INSERT INTO {}(name, familiar, create_time) VALUES(?, ?, ?)",
            WORD_TABLE
        );
        let id = sqlx::query(&sql)
            .bind(&self.name)
            .bind(&self.familiar)
            .bind(&self.create_time)
            .execute(conn)
            .await?
            .last_insert_rowid();
        self.id = id;
        Ok(id)
    }

    pub async fn list(
        conn: &mut SqliteConnection,
        page: usize,
        size: usize,
        order: Option<String>,
    ) -> Result<Vec<WordModel>> {
        let order_field = if let Some(v) = order {
            match v.as_str() {
                "time" => "create_time DESC",
                "name" => "name ASC",
                _ => "id ASC",
            }
        } else {
            "id ASC"
        };
        let sql = format!(
            "SELECT * FROM {} ORDER BY {} LIMIT {} OFFSET {}",
            WORD_TABLE,
            order_field,
            size,
            (page - 1) * size
        );
        let query = sqlx::query_as(&sql);
        let list: Vec<WordModel> = query.fetch_all(conn).await?;
        Ok(list)
    }

    pub async fn count(conn: &mut SqliteConnection) -> Result<u32> {
        let sql = format!("SELECT count(id) AS c FROM {}", WORD_TABLE);
        let query = sqlx::query(&sql);
        let row = query.fetch_one(conn).await?;
        let total: u32 = row.get("c");
        Ok(total)
    }

    pub async fn exist_by_name(conn: &mut SqliteConnection, name: &str) -> Result<bool> {
        let sql = format!("SELECT id FROM {} WHERE name = ? LIMIT 1", WORD_TABLE);
        let rows = sqlx::query(&sql).bind(name).fetch_all(conn).await?;
        Ok(!rows.is_empty())
    }

    pub async fn update(&self, conn: &mut SqliteConnection, fields: Vec<&str>) -> Result<()> {
        let mut set_sqls: Vec<String> = vec![];
        for field in &fields {
            set_sqls.push(format!("{} = ?", field));
        }
        let set_clause = set_sqls.join(", ");
        let sql = format!("UPDATE {} SET {} WHERE id = ?", WORD_TABLE, set_clause);
        let mut query = sqlx::query(&sql);
        for field in fields {
            match field {
                "familiar" => query = query.bind(&self.familiar),
                _ => {
                    error!("Invalid field: {}", field);
                }
            }
        }
        query = query.bind(&self.id);
        query.execute(conn).await?;
        Ok(())
    }

    pub async fn delete(conn: &mut SqliteConnection, ids: &[RowID]) -> Result<()> {
        let mut qb: QueryBuilder<Sqlite> =
            QueryBuilder::new(format!("DELETE FROM {} WHERE 1 = 1", WORD_TABLE));
        if !ids.is_empty() {
            qb.push(" AND id IN (");
            let mut sp = qb.separated(",");
            for i in 0..ids.len() {
                if i == ids.len() - 1 {
                    sp.push_bind_unseparated(ids[i]);
                } else {
                    sp.push_bind(ids[i]);
                }
            }
            sp.push_unseparated(")");
        }
        qb.build().execute(conn).await?;
        Ok(())
    }
}
