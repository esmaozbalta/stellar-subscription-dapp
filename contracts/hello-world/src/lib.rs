#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, IntoVal, String,
};

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
        let base_time = if current_exp > now {
            current_exp
        } else {
            now
        };

        let new_exp = base_time + (days * 86400);
        env.storage().persistent().set(&key, &new_exp);

        env.events()
            .publish((symbol_short!("sub"), symbol_short!("extend")), (user, new_exp));
    }

    pub fn get_exp(env: Env, user: Address) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::Expiration(user))
            .unwrap_or(0)
    }

    pub fn get_status(env: Env, user: Address) -> String {
        let exp = Self::get_exp(env.clone(), user);
        let now = env.ledger().timestamp();

        if exp > now {
            String::from_str(&env, "Active")
        } else {
            String::from_str(&env, "Inactive")
        }
    }
}

#[contract]
pub struct PaymentExecutor;

#[contractimpl]
impl PaymentExecutor {
    pub fn pay_and_extend(env: Env, user: Address, registry_id: Address, days: u64) {
        user.require_auth();

        let args = soroban_sdk::vec![&env, user.into_val(&env), days.into_val(&env)];

        env.invoke_contract::<()>(
            &registry_id,
            &symbol_short!("extend"),
            args,
        );

        env.events()
            .publish((symbol_short!("pay"), symbol_short!("success")), user);
    }
}

#[cfg(test)]
mod test;
