#![no_std]
#![allow(deprecated)]
use soroban_sdk::{contract, contractimpl, symbol_short, Address, Env};

#[contract]
pub struct VaultContract;

#[contractimpl]
impl VaultContract {
    pub fn pay_and_extend(env: Env, user: Address, _registry: Address, days: u64) {
        user.require_auth();

        env.events().publish((symbol_short!("pay"), symbol_short!("success")), days);
    }
}

#[cfg(test)]
mod test;