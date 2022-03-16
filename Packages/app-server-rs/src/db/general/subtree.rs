use anyhow::Context;
use async_graphql::{Object, Result, Schema, Subscription, ID, async_stream, OutputType, scalar, EmptySubscription, SimpleObject};
use futures_util::{Stream, stream, TryFutureExt, StreamExt, Future};
use hyper::{Body, Method};
use rust_macros::wrap_slow_macros;
use serde::{Serialize, Deserialize};
use serde_json::json;
use tokio_postgres::{Client};
use std::path::Path;
use std::{time::Duration, pin::Pin, task::Poll};

use crate::proxy_to_asjs::{HyperClient, APP_SERVER_JS_URL};
use crate::utils::general::{handle_generic_gql_collection_request, GQLSet, handle_generic_gql_doc_request};
use crate::utils::filter::{Filter};
use crate::utils::type_aliases::{JSONValue};

// queries
// ==========

wrap_slow_macros!{

#[derive(Default)]
pub struct QueryShard_General_Subtree;
#[Object]
impl QueryShard_General_Subtree {
    async fn subtree(&self, _ctx: &async_graphql::Context<'_>, root_node_id: String, max_depth: Option<usize>) -> Result<String> {
        Ok("todo1".to_owned())
    }
}

}