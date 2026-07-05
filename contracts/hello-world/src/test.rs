#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

#[test]
fn test_registry_extend() {
    let env = Env::default();
    let contract_id = env.register_contract(None, SubscriptionRegistry);
    let client = SubscriptionRegistryClient::new(&env, &contract_id);
    let user = Address::generate(&env);

    assert_eq!(client.get_exp(&user), 0);
    client.extend(&user, &30);
    assert!(client.get_exp(&user) > 0);
}

#[test]
fn test_inter_contract_communication() {
    let env = Env::default();
    env.mock_all_auths();

    let registry_id = env.register_contract(None, SubscriptionRegistry);
    let registry_client = SubscriptionRegistryClient::new(&env, &registry_id);

    let executor_id = env.register_contract(None, PaymentExecutor);
    let executor_client = PaymentExecutorClient::new(&env, &executor_id);
    let user = Address::generate(&env);

    executor_client.pay_and_extend(&user, &registry_id, &30);
    assert!(registry_client.get_exp(&user) > 0);
    assert_eq!(
        registry_client.get_status(&user),
        String::from_str(&env, "Active")
    );
}

#[test]
fn test_initial_state_is_zero() {
    let env = Env::default();
    let contract_id = env.register_contract(None, SubscriptionRegistry);
    let client = SubscriptionRegistryClient::new(&env, &contract_id);
    let user = Address::generate(&env);

    assert_eq!(client.get_exp(&user), 0);
    assert_eq!(
        client.get_status(&user),
        String::from_str(&env, "Inactive")
    );
}
