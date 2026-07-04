# ⬛ VAULT. | Decentralized Cloud Storage Subscription

> A mobile-first, high-fidelity Web3 subscription dApp built on the Stellar Soroban network.

Vault is a decentralized application designed to manage recurring cloud storage subscriptions using Stellar's Soroban smart contracts. Moving away from cluttered Web3 interfaces, Vault adopts a strict minimalist, architectural design philosophy—focusing on clean lines, typography, and a seamless user experience. 

Under the hood, it leverages advanced Rust-based smart contract architecture, featuring secure inter-contract communication and real-time event streaming, entirely verified by automated CI/CD pipelines.

---

## 🔗 Live Deployment & On-Chain Proofs

- **Live Application:**
- **Video Walkthrough:**
- **Network:** Stellar Testnet
- **Deployed Contract ID:** `CAIQLS5V2ZPJW3IZTB6VHOX5AEFMSIDORAYA37GYXQZF3L4OVO5MQJRE`
- **Deployment Transaction Hash:** `08310e522774c16870e1bade5513177a8ad137fb561d0e0442af909cdec4bd44`
- **Explorer Link:** [View on Stellar Expert](https://stellar.expert/explorer/testnet/tx/08310e522774c16870e1bade5513177a8ad137fb561d0e0442af909cdec4bd44)

---

## 🏗️ Architecture & Technical Implementation

Vault is separated into a robust Rust backend and a modern React frontend, meeting all advanced evaluation criteria.

### 1. Smart Contracts (Soroban / Rust)
The protocol utilizes a multi-contract architecture to ensure separation of concerns:
* **SubscriptionRegistry Contract:** Acts as the decentralized database. It securely stores and extends the expiration timestamps of user subscriptions.
* **PaymentExecutor Contract:** Handles the user authentication and acts as the proxy.
* **Inter-Contract Communication:** The `PaymentExecutor` successfully uses `env.invoke_contract()` to communicate with the `SubscriptionRegistry` in a single transactional flow.
* **Event Streaming:** Critical actions emit on-chain events allowing frontends to react instantly.

### 2. Frontend Application (React / TypeScript)
* **Design Philosophy:** Engineered with a high-end minimalist aesthetic (black/white palette, generous whitespace, sharp typography).
* **Mobile-First:** Built entirely responsive, ensuring the dApp looks and functions flawlessly on mobile devices.
* **Freighter API Integration:** Seamless wallet connection, session management, and transaction signing.
* **State Management & UX:** Comprehensive loading states during contract invocation and clean error handling UI.

### 3. DevOps & Testing (CI/CD)
* **Unit Testing:** The smart contracts are covered by rigorous unit tests ensuring initial states, registry extensions, and cross-contract authorizations function perfectly.
* **GitHub Actions:** A fully automated CI/CD pipeline triggers on every push to the main branch, compiling the WASM targets and running `cargo test` on an Ubuntu runner.

---

## ✅ Evaluation Checklist Mastered

- [x] **10+ Meaningful Commits:** Granular, descriptive Git history.
- [x] **Advanced Contracts:** Multi-contract setup.
- [x] **Inter-Contract Communication:** Demonstrated via `invoke_contract` logic.
- [x] **Event Streaming:** On-chain events published.
- [x] **Mobile-Responsive UI:** Production-grade, mobile-first frontend.
- [x] **Error & Loading States:** Graceful degradation and real-time user feedback.
- [x] **Unit Tests:** 3 comprehensive tests verifying contract integrity.
- [x] **CI/CD Pipeline:** GitHub Actions workflow successfully implemented.
- [x] **On-Chain Deployment:** Testnet deployment completed with Contract ID and Tx Hash.

---

## 💻 Local Development Setup

To run this project locally, follow these steps:

**1. Clone the repository:**
```bash
git clone [https://github.com/esmaozbalta/stellar-subscription-dapp.git](https://github.com/esmaozbalta/stellar-subscription-dapp.git)
cd stellar-subscription-dapp
```

**2. Smart Contract Testing:**
```bash
cargo test
```

**3. Frontend Installation & Start:**
```bash
cd frontend
npm install
npm run dev
```