#!/usr/bin/env -S node --enable-source-maps
import 'dotenv/config';
import { ethers, type TransactionRequest } from 'ethers';

function getenvStrict(name: string): string {
	const v = process.env[name];
	if (!v || String(v).trim() === '') throw new Error(`Missing required env var: ${name}`);
	return v;
}

function toWeiEth(amount: string | number): bigint {
	return ethers.parseEther(String(amount));
}

async function main(): Promise<void> {
	console.log(`Timestamp: ${new Date().toISOString()}`);
	const rpcUrl = getenvStrict('ETH_RPC_URL');
	const chainId = BigInt(getenvStrict('CHAIN_ID'));
	const privateKey = getenvStrict('PRIVATE_KEY');
	const to = getenvStrict('TO_ADDRESS');
	const amountEth = getenvStrict('AMOUNT_ETH');

	const provider = new ethers.JsonRpcProvider(rpcUrl, Number(chainId));
	await provider.getBlockNumber();

	const wallet = new ethers.Wallet(privateKey, provider);

	const maxPriorityFeeGwei = process.env.MAX_PRIORITY_FEE_GWEI ?? '2';
	const maxFeeGwei = process.env.MAX_FEE_GWEI ?? '60';
	const maxPriorityFeePerGas = ethers.parseUnits(String(maxPriorityFeeGwei), 'gwei');
	const maxFeePerGas = ethers.parseUnits(String(maxFeeGwei), 'gwei');

	const txRequest: TransactionRequest = {
		chainId: Number(chainId),
		to,
		value: toWeiEth(amountEth),
		type: 2,
		maxPriorityFeePerGas,
		maxFeePerGas,
	};

	let gasLimit: bigint;
	try {
		gasLimit = await provider.estimateGas({
			from: await wallet.getAddress(),
			to: txRequest.to!,
			value: txRequest.value!,
		});
	} catch (e: any) {
		throw new Error(`Gas estimation failed: ${e?.message || e}`);
	}

	gasLimit = (gasLimit * 11n) / 10n;

	const tx = await wallet.sendTransaction({ ...txRequest, gasLimit });
	console.log(`Transaction sent: ${tx.hash}`);

	const wait = (process.env.WAIT_FOR_RECEIPT ?? 'true').toLowerCase();
	if (['1', 'true', 'yes'].includes(wait)) {
		const receipt = await tx.wait();
		console.log(`Receipt status: ${receipt!.status} | Block: ${receipt!.blockNumber}`);
	}
}

main().catch((e) => {
	// eslint-disable-next-line no-console
	console.error('Error:', (e as any)?.message || e);
	process.exit(1);
});
