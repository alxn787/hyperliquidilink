## Ethereum signer (MetaMask-like) in TypeScript (Node.js)

This project lets you sign Ethereum transactions and messages (like MetaMask) using TypeScript/Node, then optionally send them or call an API with the signature.

### 1) Install

```bash
# From repo root
npm install
```

### 2) Configure environment

Copy `env.example` to `.env` and fill in the values:

```bash
cp env.example .env
```

Required:
- `ETH_RPC_URL`: Your RPC URL (Infura/Alchemy/Ankr or self-hosted)
- `CHAIN_ID`: Network chain ID (1 mainnet, 8453 Base, 137 Polygon, 11155111 Sepolia)
- `PRIVATE_KEY`: The account private key used for signing

Optional per script are documented below.

> Keep your private key secure. Do not commit `.env`.

### 3) Send an EIP-1559 transaction

Script: `scripts/sign_and_send_tx.ts`

Environment variables used:
- `TO_ADDRESS` (required): recipient address
- `AMOUNT_ETH` (required): ether amount to send (e.g., `0.001`)
- `MAX_PRIORITY_FEE_GWEI` (optional, default `2`)
- `MAX_FEE_GWEI` (optional, default `60`)
- `WAIT_FOR_RECEIPT` (optional, default `true`)

Run:

```bash
npm run tx
```

Output includes the transaction hash and receipt (if waiting).

### 4) Sign message and call an API

Script: `scripts/sign_message_and_call_api.ts`

Environment variables:
- `TARGET_API_URL` (required): API endpoint to POST to
- `SIGN_MODE` (optional): `personal` (default) or `typed`
- `MESSAGE` (used when `SIGN_MODE=personal`)
- `TYPED_DATA_JSON` (used when `SIGN_MODE=typed`, must be valid EIP-712 JSON)
- `API_PAYLOAD_JSON` (optional): JSON string payload to send

Run (personal_sign):

```bash
SIGN_MODE=personal MESSAGE="Sign this to auth" npm run sign
```

Run (EIP-712 typed):

```bash
SIGN_MODE=typed TYPED_DATA_JSON='{
  "types": {
    "EIP712Domain": [
      {"name":"name","type":"string"},
      {"name":"version","type":"string"},
      {"name":"chainId","type":"uint256"}
    ],
    "Mail": [
      {"name":"from","type":"address"},
      {"name":"to","type":"address"},
      {"name":"contents","type":"string"}
    ]
  },
  "primaryType": "Mail",
  "domain": {"name":"MyDapp","version":"1","chainId":1},
  "message": {
    "from":"0x0000000000000000000000000000000000000001",
    "to":"0x0000000000000000000000000000000000000002",
    "contents":"Hello"
  }
}' npm run sign
```

Headers sent to your API:
- `X-Eth-Address`: signer address
- `X-Eth-Signature`: hex signature (`0x…`)

Your server can recover the signer and authorize the request.

### 5) Hyperliquid Staking Link (Automated)

Automates Hyperliquid account linking by signing EIP-712 `LinkStakingUser` actions and submitting them.

#### Setup

Copy `env.example` to `.env` and configure:

```bash
# Trading account
TRADING_PRIVATE_KEY=your_trading_account_private_key
TRADING_USER_ADDRESS=staking_account_to_link_to

# Staking account
STAKING_PRIVATE_KEY=your_staking_account_private_key
STAKING_USER_ADDRESS=trading_account_to_link_to

HYPERLIQUID_TESTNET=true
```

#### Bidirectional Linking

The linking process requires **two signatures** (one from each account).

**Step 1 - Trading account initiates:**
```bash
npm run link:trading
```

**Step 2 - Staking account finalizes (use same nonce):**
```bash
NONCE=1761995511314 npm run link:staking
```

Both scripts sign with EIP-712 `HyperliquidTransaction:LinkStakingUser` and post to the Hyperliquid API. The staking script automatically sets `isFinalize=true`.

**Quick test (generate fresh nonce):**
```bash
# Step 1
npm run link:trading
# Copy the nonce from output, then:
NONCE=<copied_nonce> npm run link:staking
```

### Notes
- EIP-1559 gas values are conservative defaults; tune for your network.
- Works with any RPC that supports `eth_sendRawTransaction` and `eth_feeHistory`.
- The message signing matches MetaMask flows: `personal_sign` and `eth_signTypedData_v4` (EIP-712).
