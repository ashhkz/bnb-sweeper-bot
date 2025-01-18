import { providers, Wallet } from "ethers";
import { formatEther } from "ethers/lib/utils.js";
import { gasPriceToGwei } from "./utils.js";

import "log-timestamp";
import "dotenv/config";

// Load environment variables
const NETWORK_RPC_URL = process.env.BSC_RPC_URL;
const PRIVATE_KEY_ZERO_GAS = process.env.PRIVATE_KEY_ZERO_GAS || "";
const RECEIVER_WALLET = process.env.RECEIVER_WALLET || "";

// Validate environment variables
if (!PRIVATE_KEY_ZERO_GAS) {
  console.warn(
    "Must provide PRIVATE_KEY_ZERO_GAS environment variable, corresponding to the compromised wallet."
  );
  process.exit(1);
}

if (!RECEIVER_WALLET) {
  console.warn("Must provide RECEIVER_WALLET environment variable.");
  process.exit(1);
}

// Initialize provider and wallet
const provider = new providers.JsonRpcProvider(NETWORK_RPC_URL);
const walletZeroGas = new Wallet(PRIVATE_KEY_ZERO_GAS, provider);

console.log(`Zero Gas Account: ${walletZeroGas.address}`);
console.log(`Receiver Wallet: ${RECEIVER_WALLET}`);

async function sweep(wallet) {
  const balance = await wallet.getBalance();
  if (balance.isZero()) {
    console.log(" Balance is zero");
    return;
  }

  // Fetch the recommended gas price from the network
  const recommendedGasPrice = await provider.getGasPrice();
  
  // Cap the gas price at 10 gwei (10 * 10^9 wei)
  const gasPrice = recommendedGasPrice.lt(10e9) 
    ? recommendedGasPrice 
    : ethers.BigNumber.from(10e9); // 10 gwei cap

  // Calculate gas cost for the transaction (21,000 gas limit)
  const gasCost = gasPrice.mul(21000);

  // If the balance is less than the gas cost, do not proceed
  if (balance.lte(gasCost)) {
    console.log(` Balance too low to send (balance=${formatEther(balance)}, gasCost=${gasPriceToGwei(gasCost)} gwei)`);
    return;
  }

  // Send all the balance minus the gas fee
  const amountToSend = balance.sub(gasCost);

  try {
    console.log(` Sweeping ${formatEther(amountToSend)} to ${RECEIVER_WALLET}`);
    const tx = await wallet.sendTransaction({
      to: RECEIVER_WALLET,  // Send funds to the target receiver wallet
      value: amountToSend,   // Send the calculated amount after deducting gas
      gasLimit: 21000,       // Standard gas limit for BNB transfers
      gasPrice,
    });
    console.log(
      ` Sent tx with nonce ${tx.nonce} sweeping ${formatEther(amountToSend)} BNB at gas price ${gasPriceToGwei(gasPrice)} gwei: ${tx.hash}`
    );
  } catch (err) {
    console.log(` Error sending tx: ${err.message ?? err}`);
  }
}

async function main() {
  console.log(`Connected to ${NETWORK_RPC_URL}`);
  provider.on("block", async (blockNumber) => {
    console.log(`New block ${blockNumber}`);
    await sweep(walletZeroGas);  // Sweep the funds on each new block
  });
}

main();
