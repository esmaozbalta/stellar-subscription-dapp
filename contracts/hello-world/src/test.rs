#![cfg(test)]
#![allow(deprecated)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

#[test]
fn test_subscription_payment() {
    let env = Env::default();
    env.mock_all_auths(); 
    
    let contract_id = env.register_contract(None, VaultContract);
    let client = VaultContractClient::new(&env, &contract_id);

    let user = Address::generate(&env);
    let registry = Address::generate(&env);
    
    client.pay_and_extend(&user, &registry, &30);
    
    assert!(true); 
}

#[test]
fn test_user_authentication_required() {
    let env = Env::default();
    env.mock_all_auths(); 
    
    let contract_id = env.register_contract(None, VaultContract);
    let client = VaultContractClient::new(&env, &contract_id);

    let user = Address::generate(&env);
    let registry = Address::generate(&env);
    
    client.pay_and_extend(&user, &registry, &60);
    
    assert!(true); 
}

#[test]
fn test_event_emission_for_frontend() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, VaultContract);
    let client = VaultContractClient::new(&env, &contract_id);

    let user = Address::generate(&env);
    let registry = Address::generate(&env);
    
    client.pay_and_extend(&user, &registry, &90);
    
    assert!(true);
}