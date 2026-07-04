#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Env, Address, symbol_short, IntoVal};

#[contracttype]
pub enum DataKey {
    Expiration(Address),
}

#[contract]
pub struct SubscriptionRegistry;

#[contractimpl]
impl SubscriptionRegistry {
    pub fn extend(env: Env, user: Address, days: u64) {
        let key = DataKey::Expiration(user.clone());
        let current_exp: u64 = env.storage().persistent().get(&key).unwrap_or(0);
        
        let now = env.ledger().timestamp();
        let base_time = if current_exp > now { current_exp } else { now };
        
        let new_exp = base_time + (days * 86400);
        env.storage().persistent().set(&key, &new_exp);
        
        env.events().publish((symbol_short!("sub"), symbol_short!("extend")), (user, new_exp));
    }

    pub fn get_exp(env: Env, user: Address) -> u64 {
        env.storage().persistent().get(&DataKey::Expiration(user)).unwrap_or(0)
    }
}

#[contract]
pub struct PaymentExecutor;

#[contractimpl]
impl PaymentExecutor {
    pub fn pay_and_extend(env: Env, user: Address, registry_id: Address, days: u64) {
        user.require_auth();

        let args = soroban_sdk::vec![&env, user.into_val(&env), days.into_val(&env)];
        env.invoke_contract::<()>(&registry_id, &symbol_short!("extend"), args);
        
        env.events().publish((symbol_short!("pay"), symbol_short!("success")), user);
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{Env, testutils::Address as _};

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
    }
    
    #[test]
    fn test_initial_state_is_zero() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SubscriptionRegistry);
        let client = SubscriptionRegistryClient::new(&env, &contract_id);
        let user = Address::generate(&env);

        assert_eq!(client.get_exp(&user), 0);
    }
}