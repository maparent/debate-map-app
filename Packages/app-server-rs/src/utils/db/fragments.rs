use std::{fmt::Display, sync::atomic::AtomicI32};
use anyhow::{anyhow, bail, Context, Error, ensure};
use itertools::Itertools;
use regex::{Regex, Captures};
use serde_json::Map;
use tokio_postgres::types::ToSql;
use crate::{store::live_queries::RowData, utils::type_aliases::JSONValue};

// Send is needed, else can't be used across .await points
//pub type ParamType = Box<dyn ToSql + Send + Sync>;
// see comments in get_db_entries() for reason this is needed
//pub type ParamType = Box<dyn Display>;
//pub type ParamType = String;
#[derive(Debug)]
//#[derive(Debug, Clone)]
pub enum SQLParam {
    /// For names of tables, columns, etc.
    Ident(String),
    /// Examples: strings, numbers, etc. (for technical reasons, these currently must be converted to a String -- for most types this works fine)
    Value(String),
}
impl ToSql for SQLParam {
    fn to_sql(&self, ty: &tokio_postgres::types::Type, out: &mut bytes::BytesMut) -> Result<tokio_postgres::types::IsNull, Box<dyn std::error::Error + Sync + Send>> where Self: Sized {
        match self {
            //SQLParam::Ident(str) => str.to_sql(ty, out),
            SQLParam::Ident(_str) => {
                // instead, it should be interpolated into the query-str (since I don't know of a better way atm); see SQLFragment.into_query_args()
                panic!("to_sql should never be called on a SQLParam::Ident!");
            },
            SQLParam::Value(str) => {
                if ty.name().to_lowercase() == "bool" {
                    let str_as_bool = str.to_lowercase() == "true";
                    return str_as_bool.to_sql(ty, out);
                }

                str.to_sql(ty, out)
            },
        }
    }
    //tokio_postgres::types::accepts!(Bool);
    fn accepts(ty: &tokio_postgres::types::Type) -> bool where Self: Sized {
        //println!("Type:{} Accepts:{}", ty, String::accepts(ty));
        //if let tokio_postgres::types::Type::BOOL(ty) = ty {
        if ty.name().to_lowercase() == "bool" { return true; }

        // test
        //if ty.name().to_lowercase() == "_text" { return true; }

        String::accepts(ty)
    }
    tokio_postgres::types::to_sql_checked!();
}

//#[derive(Clone)] // can't do this atm, since can't have ToSql+Clone for params field (see: https://github.com/rust-lang/rust/issues/32220)
pub struct SQLFragment {
    pub sql_text: String,
    pub params: Vec<SQLParam>,
}
impl SQLFragment {
    /// For param-placeholders in sql_text, use $I for identifiers, and $V for values.
    /// Note: In sql-text, don't add quotes around these markers/placeholders. (only exceptions are some complex structures, eg. the outer quotes and brackets for jsonb arrays)
    //pub fn new<T>(sql_text: &'static str, params: Vec<T>) -> Self
    pub fn new(sql_text: &'static str, params: Vec<SQLParam>) -> Self
        // requires that for each param, calling param.to_owned() would return a type that is ToSql+Sync+'static
        //where T: ToSql + Send + Sync + 'static
        //where T: Display + 'static
        //where T: String
    {
        Self {
            sql_text: sql_text.to_owned(),
            //params: params.into_iter().map(|a| Box::new(a) as ParamType).collect(),
            params: params,
        }
    }
    /// Only use this when you have to: when the number/placement of Identifiers in the SQL query-text is dynamic.
    pub fn INTERPOLATED_SQL(sql_text: String, params: Vec<SQLParam>) -> Self {
        Self {
            sql_text: sql_text,
            params: params,
        }
    }
    pub fn lit(sql_text: &'static str) -> Self {
        //let params: Vec<&'static str> = vec![]; // type of this doesn't really matter; just must satisfy new's constraints
        let params: Vec<SQLParam> = vec![];
        Self::new(sql_text, params)
    }

    pub fn merge(fragments: Vec<SQLFragment>) -> SQLFragment {
        let mut sql_text = "".to_owned();
        let mut params: Vec<SQLParam> = vec![];
        for fragment in fragments {
            sql_text += &fragment.sql_text;
            for param in fragment.params {
                params.push(param);
            }
        }
        Self { sql_text, params }
    }

    pub fn into_query_args(&mut self) -> Result<(String, Vec<SQLParam>), Error> {
        let sql_base = std::mem::replace(&mut self.sql_text, "".to_owned());
        let re = Regex::new(r"\$[IV]").unwrap();

        let mut next_match_index = 0;
        let mut next_value_id = 1;
        let mut error = None;
        let sql_final = re.replace_all(&sql_base, |caps: &Captures| {
            let result = (|| {
                println!("Groups:{:?};{:?};{:?}", caps.get(0), caps.get(1), caps.get(2));
                let caps_g0 = caps.get(0).ok_or(anyhow!("Capture was missing/invalid."))?;
                let match_index = next_match_index;
                next_match_index += 1;
                let param = self.params.get(match_index).with_context(|| format!("SQL query-string references param with index {match_index}, but no corresponding param was found."))?;
                match &param {
                    &SQLParam::Ident(str) => {
                        println!("Test1");
                        ensure!(caps_g0.as_str() == "$I", "Placeholder-type ({}) doesn't match with param-type (Ident)!", caps_g0.as_str()); // defensive

                        // defensive (actually: atm, this is required for safety); do extra checks to ensure identifiers only ever consist of alphanumerics and underscores
                        let re = Regex::new(r"^[a-zA-Z0-9_]+$").unwrap();
                        ensure!(re.is_match(str), "An identifier was attempted to be used that contained invalid characters! Attempted identifier:{str}");

                        //format!("${}", match_id)
                        // temp; interpolate the identifier directly into the query-str (don't know how to avoid it atm)
                        Ok(format!("\"{str}\""))
                    },
                    &SQLParam::Value(_str) => {
                        println!("Test2");
                        ensure!(caps_g0.as_str() == "$V", "Placeholder-type ({}) doesn't match with param-type (Value)!", caps_g0.as_str()); // defensive

                        let value_id = next_value_id;
                        next_value_id += 1;
                        Ok(format!("${}", value_id))
                    },
                }
            })();
            result.map_err(|err| error = Some(err)).unwrap_or_default()
        }).into_owned();
        //error.map_or(Ok(()), |a| Err(a))?;
        if let Some(err) = error { return Err(err); }

        // defensive
        let placeholders_found = next_match_index;
        ensure!(placeholders_found == self.params.len(), "Placeholder and param lengths differ!");
        
        let params_base = std::mem::replace(&mut self.params, vec![]);
        let params_final = params_base.into_iter().filter_map(|a| {
            match a {
                SQLParam::Ident(str) => None,
                SQLParam::Value(str) => Some(SQLParam::Value(str)),
            }
        }).collect();
        
        Ok((sql_final, params_final))
    }
}
impl Display for SQLFragment {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_fmt(format_args!("(sql:\"{}\", params:{:?})", self.sql_text, self.params))?;
        Ok(())
    }
}