import fs from "fs-extra";
import path from "path";
import { createMessageSend, createTxRawEIP712, signatureToWeb3Extension } from "@tharsis/transactions";
import { generateEndpointBroadcast, generatePostBodyBroadcast } from "@tharsis/provider";
import signUtil from "@metamask/eth-sig-util";
import { Wallet } from "@ethersproject/wallet";
import { evmosToEth, ethToEvmos } from "@tharsis/address-converter";
import API from "./api/index.js";

const api = new API("http://127.0.0.1", 26657, 1317);

const txHexBytes = async (privateKeyHex, chain, fee, memo, params) => {
  const privateKey = Buffer.from(privateKeyHex.replace("0x", ""), "hex");
  const wallet = new Wallet(privateKey);
  const address = ethToEvmos(wallet.address);
  const account = await api.authAccount(address);
  const sender = {
    accountAddress: address,
    sequence: account.account.base_account.sequence,
    accountNumber: account.account.base_account.account_number,
    pubkey: account.account.base_account.pub_key.key,
  };

  const msg = createMessageSend(chain, sender, fee, memo, params);
  const signature = signUtil.signTypedData({
    privateKey,
    data: msg.eipToSign,
    version: "V4",
  });

  // The chain and sender objects are the same as the previous example
  let extension = signatureToWeb3Extension(chain, sender, signature);

  // Create the txRaw
  let rawTx = createTxRawEIP712(msg.legacyAmino.body, msg.legacyAmino.authInfo, extension);
  let txBytes = JSON.parse(generatePostBodyBroadcast(rawTx)).tx_bytes;

  return "0x" + Buffer.from(txBytes).toString("hex");
};

(async () => {
  let privateKey = ""; // put hex private key without prefix 0x
  if (!privateKey) {
    try {
      const keySeed = await fs.readJSON("./nodes/node0/evmosd/key_seed.json");
      privateKey = Wallet.fromMnemonic(keySeed.secret)._signingKey().privateKey.toLowerCase().replace("0x", "");
    } catch (error) {}
  }

  const genesis = await api.genesis();
  const chain = {
    chainId: parseInt(genesis.genesis.chain_id.split("_")[1].split("-")[0]),
    cosmosChainId: genesis.genesis.chain_id,
  };

  let fee = {
    amount: "10000000",
    denom: "aevmos",
    gas: "200000",
  };

  let memo = "hello world";

  try {
    {
      memo = "transfer token";
      const params = {
        destinationAddress: "evmos1llllqxkm0ruf2x4z3ncxe6um3zv2986s568sjh",
        amount: "1",
        denom: "aevmos",
      };
      const data = await txHexBytes(privateKey, chain, fee, memo, params);
      const reply = await api.txCommit(data);
      console.log(reply.hash);
    }
  } catch (error) {
    console.log(error);
  }
})();
