import { createEIP712, generateFee, generateMessage, generateTypes } from "@tharsis/eip712";
import { createAnyMessage, createTransaction } from "@tharsis/proto";
import * as coin from "@tharsis/proto/dist/proto/cosmos/base/v1beta1/coin.js";
import * as ed25519 from "@tharsis/proto/dist/proto/cosmos/crypto/ed25519/keys.js";
import * as staking from "@tharsis/proto/dist/proto/cosmos/staking/v1beta1/staking.js";
import * as stakingTx from "@tharsis/proto/dist/proto/cosmos/staking/v1beta1/tx.js";

// {
//   console.log("Create Validator");
//   const { privateKey } = await nodeKey("node4");
//   const memo = "create validator";
//   const params = {
//     description: {
//       moniker: "node4",
//       identity: "xxx",
//       website: "xxx",
//       security_contact: "xxx",
//       details: "xxxx",
//     },
//     commission: {
//       rate: "1000000000000000000",
//       max_rate: "1000000000000000000",
//       max_change_rate: "1000000000000000000",
//     },
//     min_self_delegation: "100000000000000000000",
//     delegator_address: "evmos1u6npgxr47mvg0s0zrdvgr8kf4z5tf23dzkkuzs",
//     validator_address: "evmosvaloper1u6npgxr47mvg0s0zrdvgr8kf4z5tf23d0cevrd",
//     pubkey: {
//       type: "xxx",
//       value: {
//         key: 44,
//       },
//     },
//     value: {
//       denom: "agov",
//       amount: "100000000000000000000",
//     },
//   };
//   const data = await txHexBytes(privateKey, chain, fee, memo, staking.createTxMsgCreateValidator, params);
//   const reply = await api.txCommit(data);
//   console.log("hash", reply.hash, data);
// }

const createTxMsgCreateValidator = (chain, sender, fee, memo, params) => {
  const feeObject = generateFee(fee.amount, fee.denom, fee.gas, sender.accountAddress);
  const MSG_CREATE_VALIDATOR_TYPES = {
    MsgValue: [
      { name: "description", type: "TypeDescription" },
      { name: "commission", type: "TypeCommission" },
      { name: "min_self_delegation", type: "string" },
      { name: "delegator_address", type: "string" },
      { name: "validator_address", type: "string" },
      { name: "pubkey", type: "TypePubkey" },
      { name: "value", type: "TypeValue" },
    ],
    TypeDescription: [
      { name: "moniker", type: "string" },
      { name: "identity", type: "string" },
      { name: "website", type: "string" },
      { name: "security_contact", type: "string" },
      { name: "details", type: "string" },
    ],
    TypeCommission: [
      { name: "rate", type: "string" },
      { name: "max_rate", type: "string" },
      { name: "max_change_rate", type: "string" },
    ],
    TypePubkey: [
      { name: "type", type: "string" },
      { name: "value", type: "TypePubkeyValue" },
    ],
    TypePubkeyValue: [{ name: "key", type: "uint8" }],
    TypeValue: [
      { name: "denom", type: "string" },
      { name: "amount", type: "string" },
    ],
  };
  const types = generateTypes(MSG_CREATE_VALIDATOR_TYPES);
  const msg = {
    type: "cosmos-sdk/MsgCreateValidator",
    value: params,
  };
  const messages = generateMessage(sender.accountNumber.toString(), sender.sequence.toString(), chain.cosmosChainId, memo, feeObject, msg);
  const eipToSign = createEIP712(types, chain.chainId, messages);

  const pubkeyMsg = {
    path: "cosmos.crypto.ed25519.PubKey",
    message: new ed25519.cosmos.crypto.ed25519.PubKey({
      key: Uint8Array.from(params.pubkey.value.key || Buffer.from(params.pubkey.value.key, "hex")),
    }),
  };
  const message = {
    path: "cosmos.staking.v1beta1.MsgCreateValidator",
    message: new stakingTx.cosmos.staking.v1beta1.MsgCreateValidator({
      description: new staking.cosmos.staking.v1beta1.Description(params.description),
      commission: new staking.cosmos.staking.v1beta1.CommissionRates(params.commission),
      min_self_delegation: params.min_self_delegation,
      delegator_address: params.delegator_address,
      validator_address: params.validator_address,
      pubkey: createAnyMessage(pubkeyMsg),
      value: new coin.cosmos.base.v1beta1.Coin(params.value),
    }),
  };
  const tx = createTransaction(message, memo, fee.amount, fee.denom, parseInt(fee.gas, 10), "ethsecp256", sender.pubkey, sender.sequence, sender.accountNumber, chain.cosmosChainId);

  return {
    signDirect: tx.signDirect,
    legacyAmino: tx.legacyAmino,
    eipToSign,
  };
};

export default {
  createTxMsgCreateValidator,
};
