use serde::Serialize;

#[derive(Serialize)]
pub struct AppError(String);

impl<E> From<E> for AppError
where
    E: Into<anyhow::Error>,
{
    fn from(value: E) -> Self {
        Self(format!("{}", value.into()))
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
