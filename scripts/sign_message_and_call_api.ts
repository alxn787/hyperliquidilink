#!/usr/bin/env -S node --enable-source-maps
import 'dotenv/config';
import axios, { type AxiosResponse } from 'axios';
import { ethers, type TypedDataDomain, type TypedDataField } from 'ethers';

function getenvStrict(name: string): string {
	const v = process.env[name];
	if (!v || String(v).trim() === '') throw new Error(`Missing required env var: ${name}`);
	return v;
}

async function signPersonal(message: string, wallet: ethers.Wallet): Promise<{ signature: string; address: string }> {
	const signature = await wallet.signMessage(message);
	return { signature, address: await wallet.getAddress() };
}

async function signTyped(
	typedData: { domain: TypedDataDomain; types: Record<string, Array<TypedDataField>>; message: Record<string, unknown> },
	wallet: ethers.Wallet,
): Promise<{ signature: string; address: string }> {
	const { domain, types, message } = typedData;
	const signature = await wallet.signTypedData(domain, types, message);
	return { signature, address: await wallet.getAddress() };
}

async function callApi(
	url: string,
	signature: string,
	address: string,
	payload: Record<string, unknown> = {},
): Promise<AxiosResponse> {
	const headers = {
		'X-Eth-Address': address,
		'X-Eth-Signature': signature,
		'Content-Type': 'application/json',
	};
	return axios.post(url, payload, { headers, timeout: 30000 });
}

async function main(): Promise<void> {
	console.log(`Timestamp: ${new Date().toISOString()}`);
	const rpcUrl = getenvStrict('ETH_RPC_URL');
	const privateKey = getenvStrict('PRIVATE_KEY');
	const apiUrl = getenvStrict('TARGET_API_URL');

	const provider = new ethers.JsonRpcProvider(rpcUrl);
	await provider.getBlockNumber();
	const wallet = new ethers.Wallet(privateKey, provider);

	const mode = (process.env.SIGN_MODE || 'personal').toLowerCase();
	let result: { signature: string; address: string };
	if (mode === 'personal') {
		const message = process.env.MESSAGE || 'Hello from Node signer';
		result = await signPersonal(message, wallet);
	} else if (mode === 'typed') {
		const raw = getenvStrict('TYPED_DATA_JSON');
		const parsed = JSON.parse(raw) as {
			domain: TypedDataDomain;
			types: Record<string, Array<TypedDataField>>;
			message: Record<string, unknown>;
		};
		result = await signTyped(parsed, wallet);
	} else {
		throw new Error("SIGN_MODE must be 'personal' or 'typed'");
	}

	console.log(`Signed by: ${result.address}`);
	console.log(`Signature: ${result.signature}`);

	const payloadRaw = process.env.API_PAYLOAD_JSON || '{}';
	const payload = JSON.parse(payloadRaw) as Record<string, unknown>;
	const response = await callApi(apiUrl, result.signature, result.address, payload);
	console.log(`API status: ${response.status}`);
	console.log(response.data);
}

main().catch((e: any) => {
	// eslint-disable-next-line no-console
	console.error('Error:', e?.response?.data || e?.message || e);
	process.exit(1);
});
