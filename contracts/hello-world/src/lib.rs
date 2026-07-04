#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Env, Address, symbol_short};

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