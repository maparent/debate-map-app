use std::collections::{HashMap, HashSet};

use rust_shared::{utils::{auth::jwt_utils_base::UserJWTData, general_::extensions::ToOwnedV}, anyhow::Error};
use tracing::{warn, info};

use crate::{db::{access_policies::AccessPolicy, _shared::access_policy_target::AccessPolicyTarget}, links::db_live_cache::{get_admin_user_ids_cached, get_access_policy_cached}};

// sync:sql[RLSHelpers.sql]

pub(super) fn is_user_creator(jwt_data: &Option<UserJWTData>, creator_id: &str) -> bool {
    if let Some(jwt_data) = jwt_data && jwt_data.id == creator_id { true } else { false }
}

pub(super) fn is_user_admin(jwt_data: &Option<UserJWTData>) -> bool {
    try_is_user_admin(jwt_data).unwrap_or_else(|err| {
        warn!("Got error in try_is_user_admin (should only happen rarely): {:?}", err);
        false
    })
}
pub(super) fn try_is_user_admin(jwt_data: &Option<UserJWTData>) -> Result<bool, Error> {
    match jwt_data {
        Some(jwt_data) => {
            let admin_user_ids: HashSet<String> = get_admin_user_ids_cached()?;
            //info!("admin_user_ids: {:?} @me_id:{}", admin_user_ids, jwt_data.id);
            Ok(admin_user_ids.contains(&jwt_data.id.o()))
        },
        None => Ok(false),
    }
}

pub(super) fn does_policy_allow_access(jwt_data: &Option<UserJWTData>, policy_id: &str, policy_field: &str) -> bool {
    try_does_policy_allow_access(jwt_data, policy_id, policy_field).unwrap_or_else(|err| {
        warn!("Got error in try_does_policy_allow_access (should only happen rarely): {:?}", err);
        false
    })
}
pub(super) fn try_does_policy_allow_access(jwt_data: &Option<UserJWTData>, policy_id: &str, policy_field: &str) -> Result<bool, Error> {
    let policy: AccessPolicy = get_access_policy_cached(policy_id)?;
    if policy.permissions_for_type(policy_field)?.access
        && policy.permission_extends_for_user_and_type(jwt_data.as_ref().map(|a| a.id.o()), policy_field)?.map(|a| a.access.clone()) != Some(false) {
        return Ok(true);
    }

    if policy.permission_extends_for_user_and_type(jwt_data.as_ref().map(|a| a.id.o()), policy_field)?.map(|a| a.access) == Some(true) {
        return Ok(true);
    }

    Ok(false)
}

pub(super) fn do_policies_allow_access(jwt_data: &Option<UserJWTData>, policy_targets: &Vec<AccessPolicyTarget>) -> bool {
    try_do_policies_allow_access(jwt_data, policy_targets).unwrap_or_else(|err| {
        warn!("Got error in try_do_policies_allow_access (should only happen rarely): {:?}", err);
        false
    })
}
pub(super) fn try_do_policies_allow_access(jwt_data: &Option<UserJWTData>, policy_targets: &Vec<AccessPolicyTarget>) -> Result<bool, Error> {
    // The `c_accessPolicyTargets` fields should always have at least one entry in them; if not, something is wrong, so play it safe and reject access.
	// (Most tables enforce non-emptiness of this field with a row constraint, but nodeTags is an exception; its associated nodes may be deleted, leaving it without any targets.)
	// (This line thus serves to prevent "orphaned node-tags" from being visible by non-admins, as well as a general-purpose "second instance" of the non-emptiness check.)
    if policy_targets.is_empty() {
        return Ok(false);
    }
    
    for target in policy_targets {
        if !does_policy_allow_access(jwt_data, &target.policy_id, &target.policy_subfield) {
            return Ok(false);
        }
    }

    Ok(true)
}

/*pub(super) async fn is_current_user_creator_or_admin_or_policy_allows_access<T>(jwt_data: Option<UserJWTData>, policy: AccessPolicy, policy_field: &str, creator_id: String) -> Result<bool, Error> {
    Ok(
        is_current_user_creator(jwt_data.clone(), creator_id).await
        || is_current_user_admin(jwt_data.clone()).await
        || does_policy_allow_access(jwt_data, policy, policy_field).await
    )
}*/