#!/usr/bin/env -S node --enable-source-maps
import 'dotenv/config';
import axios, { type AxiosResponse } from 'axios';
import { ethers } from 'ethers';

function getenvStrict(name: string): string {
	const v = process.env[name];
	if (!v || String(v).trim() === '') throw new Error(`Missing required env var: ${name}`);
	return v;
}

interface LinkAction {
	hyperliquidChain: string;
	isFinalize: boolean;
	nonce: bigint;
	signatureChainId: string;
	type: string;
	user: string;
}

interface HyperliquidLinkPayload {
	action: LinkAction;
	expiresAfter: null;
	isFrontend: true;
	nonce: bigint;
	signature: {
		r: string;
		s: string;
		v: number;
	};
	vaultAddress: null;
}

async function signLinkAction(
	action: LinkAction,
	wallet: ethers.Wallet,
	testnet: boolean = true,
): Promise<{ r: string; s: string; v: number }> {
	// Parse signatureChainId as hex
	const chainId = parseInt(action.signatureChainId);

	// EIP-712 domain from SDK - CRITICAL: must be "HyperliquidSignTransaction" not "HyperliquidTransaction"
	const domain: ethers.TypedDataDomain = {
		name: 'HyperliquidSignTransaction',
		version: '1',
		chainId,
		verifyingContract: '0x0000000000000000000000000000000000000000',
	};

	const types: Record<string, Array<ethers.TypedDataField>> = {
		'HyperliquidTransaction:LinkStakingUser': [
			{ name: 'hyperliquidChain', type: 'string' },
			{ name: 'user', type: 'address' },
			{ name: 'isFinalize', type: 'bool' },
			{ name: 'nonce', type: 'uint64' },
		],
	};

	const value = {
		hyperliquidChain: action.hyperliquidChain, // "Testnet" | "Mainnet"
		user: action.user.toLowerCase(), // lowercase address
		isFinalize: action.isFinalize,
		nonce: BigInt(action.nonce), // keep as bigint, ethers handles it
	};

	const signature = await wallet.signTypedData(domain, types, value);
	const sig = ethers.Signature.from(signature);

	// Extra sanity: verify locally that recovery returns our wallet (should always pass)
	const recovered = ethers.verifyTypedData(domain, types, value, signature);
	const expected = await wallet.getAddress();
	if (recovered.toLowerCase() !== expected.toLowerCase()) {
		throw new Error(
			`Local EIP-712 recovery mismatch. recovered=${recovered} expected=${expected}`,
		);
	}

	return { r: sig.r, s: sig.s, v: sig.v };
}

async function submitLinkAction(
	payload: HyperliquidLinkPayload,
	testnet: boolean = true,
): Promise<AxiosResponse> {
	const baseUrl = testnet
		? 'https://api-ui.hyperliquid-testnet.xyz'
		: 'https://api-ui.hyperliquid.xyz';

	const url = `${baseUrl}/exchange`;

	const headers = {
		Accept: '*/*',
		'Accept-Language': 'en-GB,en;q=0.6',
		Connection: 'keep-alive',
		'Content-Type': 'application/json',
		Origin: testnet ? 'https://app.hyperliquid-testnet.xyz' : 'https://app.hyperliquid.xyz',
		Referer: testnet ? 'https://app.hyperliquid-testnet.xyz/' : 'https://app.hyperliquid.xyz/',
		'Sec-Fetch-Dest': 'empty',
		'Sec-Fetch-Mode': 'cors',
		'Sec-Fetch-Site': 'same-site',
		'Sec-GPC': '1',
		'User-Agent':
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
		'sec-ch-ua': '"Brave";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
		'sec-ch-ua-mobile': '?0',
		'sec-ch-ua-platform': '"macOS"',
	};

	return axios.post(url, payload, { headers, timeout: 30000 });
}

async function signAndSubmitLink(
	privateKey: string,
	userAddress: string,
	isFinalize: boolean,
	testnet: boolean,
	nonce?: bigint,
): Promise<void> {
	const wallet = new ethers.Wallet(privateKey);
	const finalNonce = nonce || BigInt(Date.now());

	console.log(`Signing with account: ${wallet.address}`);
	console.log(`User: ${userAddress}`);
	console.log(`isFinalize: ${isFinalize}`);
	console.log(`Nonce: ${finalNonce}`);

	const signatureChainIdHex = testnet ? '0x3e6' : '0x1';
	const action: LinkAction = {
		hyperliquidChain: testnet ? 'Testnet' : 'Mainnet',
		isFinalize,
		nonce: finalNonce,
		signatureChainId: signatureChainIdHex,
		type: 'linkStakingUser',
		user: userAddress,
	};

	const sig = await signLinkAction(action, wallet, testnet);
	console.log('Signature:', sig);

	const serializablePayload = {
		action: {
			hyperliquidChain: action.hyperliquidChain,
			isFinalize: action.isFinalize,
			nonce: Number(action.nonce),
			signatureChainId: action.signatureChainId,
			type: action.type,
			user: action.user,
		},
		expiresAfter: null,
		isFrontend: true,
		nonce: Number(finalNonce),
		signature: sig,
		vaultAddress: null,
	};

	console.log('Submitting to Hyperliquid...');
	const response = await submitLinkAction(serializablePayload as any, testnet);
	console.log('Response status:', response.status);
	console.log('Response data:', response.data);
}

async function main(): Promise<void> {
	console.log(`Timestamp: ${new Date().toISOString()}`);
	const isFinalize = process.env.IS_FINALIZE === 'true';
	const testnet = process.env.HYPERLIQUID_TESTNET !== 'false';
	const nonceArg = process.env.NONCE;
	const nonce = nonceArg ? BigInt(nonceArg) : undefined;

	if (isFinalize) {
		// Sign as staking account
		const stakingKey = getenvStrict('STAKING_PRIVATE_KEY');
		const tradingAddress = getenvStrict('STAKING_USER_ADDRESS').toLowerCase();
		await signAndSubmitLink(stakingKey, tradingAddress, true, testnet, nonce);
	} else {
		// Sign as trading account
		const tradingKey = getenvStrict('TRADING_PRIVATE_KEY');
		const stakingAddress = getenvStrict('TRADING_USER_ADDRESS').toLowerCase();
		await signAndSubmitLink(tradingKey, stakingAddress, false, testnet, nonce);
	}
}

main().catch((e: any) => {
	// eslint-disable-next-line no-console
	console.error('Error:', e?.response?.data || e?.message || e);
	process.exit(1);
});

