import fs from "fs-extra";
import path from "path";
import bech32 from "bech32-buffer";
import { createMessageSend, createTxMsgDelegate, createTxMsgBeginRedelegate, createTxMsgUndelegate, createTxMsgWithdrawDelegatorReward, createTxRawEIP712, signatureToWeb3Extension } from "@tharsis/transactions";
import { generateEndpointBroadcast, generatePostBodyBroadcast } from "@tharsis/provider";
import signUtil from "@metamask/eth-sig-util";
import { Wallet } from "@ethersproject/wallet";
import { evmosToEth, ethToEvmos } from "@tharsis/address-converter";
import unit from "ethjs-unit";
import API from "./api/index.js";

import message from "./messages.js";

const api = new API("http://127.0.0.1", 26657, 1317);

const txHexBytes = async (privateKeyHex, chain, fee, memo, createMessage, params) => {
  const privateKey = Buffer.from(privateKeyHex.replace("0x", ""), "hex");
  const wallet = new Wallet(privateKey);
  const address = ethToEvmos(wallet.address);
  const account = await api.authAccount(address);
  const sender = {
    accountAddress: address,
    sequence: account.account.base_account.sequence,
    accountNumber: account.account.base_account.account_number,
    pubkey: Buffer.from(wallet._signingKey().compressedPublicKey.replace("0x", ""), "hex").toString("base64"),
  };

  const msg = createMessage(chain, sender, fee, memo, params);
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
  // console.log(JSON.stringify(msg.eipToSign.message.msgs, undefined, 2));

  return "0x" + Buffer.from(txBytes).toString("hex");
};

const nodeKey = async (node) => {
  const keySeed = await fs.readJSON(`./nodes/${node}/evmosd/key_seed.json`);
  const wallet = Wallet.fromMnemonic(keySeed.secret);
  const privateKey = wallet._signingKey().privateKey.toLowerCase().replace("0x", "");
  const address = wallet.address;
  const evmosAddress = ethToEvmos(address);
  const publicKey = wallet._signingKey().publicKey;
  const compressedPublicKey = wallet._signingKey().compressedPublicKey;
  return { privateKey, publicKey, compressedPublicKey, address, evmosAddress };
};

const toAevmos = (evmos) => {
  return unit.toWei(evmos, "ether").toString();
};

const bech32Encode = (prefix, address) => {
  return bech32.encode(prefix, Uint8Array.from(Buffer.from(address.replace("0x", ""), "hex")));
};

(async () => {
  const genesis = await api.genesis();
  const chain = {
    chainId: parseInt(genesis.genesis.chain_id.split("_")[1].split("-")[0]),
    cosmosChainId: genesis.genesis.chain_id,
  };

  let fee = {
    amount: "10000000",
    denom: "aevmos",
    gas: "2000000000",
  };

  try {
    {
      console.log("Send GOV Token");
      const { privateKey } = await nodeKey("node0");
      const { evmosAddress } = await nodeKey("node4");
      const memo = "send gov token";
      const params = {
        destinationAddress: evmosAddress,
        amount: toAevmos(1000),
        denom: "agov",
      };
      const data = await txHexBytes(privateKey, chain, fee, memo, createMessageSend, params);
      const reply = await api.txCommit(data);
      console.log("hash", reply.hash, "destinationAddress", evmosAddress);
    }

    {
      console.log("Send Evmos Token");
      const { privateKey } = await nodeKey("node0");
      const { evmosAddress } = await nodeKey("node4");
      const memo = "send evmos token";
      const params = {
        destinationAddress: evmosAddress,
        amount: toAevmos(1000),
        denom: "aevmos",
      };
      const data = await txHexBytes(privateKey, chain, fee, memo, createMessageSend, params);
      const reply = await api.txCommit(data);
      console.log("hash", reply.hash, "destinationAddress", evmosAddress);
    }

    // {
    //   console.log("Test Proposal");
    //   const { privateKey, evmosAddress } = await nodeKey("node0");
    //   const memo = "gov test";
    //   const params = {
    //     content: {
    //       "@type": "/cosmos.gov.v1beta1.TextProposal",
    //       title: "Test Proposal",
    //       description: "My awesome proposal",
    //     },
    //     initial_deposit: [
    //       {
    //         denom: "agov",
    //         amount: "999999000",
    //       },
    //     ],
    //     proposer: evmosAddress,
    //   };
    //   const data = await txHexBytes(privateKey, chain, fee, memo, message.createTxMsgTextProposal, params);
    //   const reply = await api.txCommit(data);
    //   console.log("hash", reply.hash);
    // }

    {
      console.log("Delegate");
      const memo = "delegate";
      const { privateKey } = await nodeKey("node4");
      const { address } = await nodeKey("node0");
      const params = {
        validatorAddress: bech32Encode("evmosvaloper", address),
        amount: toAevmos(10),
        denom: "agov",
      };
      const data = await txHexBytes(privateKey, chain, fee, memo, createTxMsgDelegate, params);
      const reply = await api.txCommit(data);
      console.log(reply.hash);
    }

    {
      console.log("ReDelegate");
      const memo = "redelegate";
      const { privateKey } = await nodeKey("node4");
      const key0 = await nodeKey("node0");
      const key1 = await nodeKey("node1");
      const params = {
        validatorSrcAddress: bech32Encode("evmosvaloper", key0.address),
        validatorDstAddress: bech32Encode("evmosvaloper", key1.address),
        amount: toAevmos(5),
        denom: "agov",
      };
      const data = await txHexBytes(privateKey, chain, fee, memo, createTxMsgBeginRedelegate, params);
      const reply = await api.txCommit(data);
      console.log(reply.hash);
    }

    {
      console.log("Undelegate");
      const memo = "undelegate";
      const { privateKey } = await nodeKey("node4");
      const { address } = await nodeKey("node0");
      const params = {
        validatorAddress: bech32Encode("evmosvaloper", address),
        amount: toAevmos(1),
        denom: "agov",
      };
      const data = await txHexBytes(privateKey, chain, fee, memo, createTxMsgUndelegate, params);
      const reply = await api.txCommit(data);
      console.log(reply.hash);
    }

    {
      console.log("Withdraw Delegator Reward");
      const memo = "undelegate";
      const { privateKey } = await nodeKey("node4");
      const { address } = await nodeKey("node0");
      const params = {
        validatorAddress: bech32Encode("evmosvaloper", address),
      };
      const data = await txHexBytes(privateKey, chain, fee, memo, createTxMsgWithdrawDelegatorReward, params);
      const reply = await api.txCommit(data);
      console.log(reply.hash);
    }
  } catch (error) {
    // console.log(error);
  }
})();
