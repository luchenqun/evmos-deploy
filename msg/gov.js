import { createEIP712, generateFee, generateMessage, generateTypes } from "@tharsis/eip712";
import { createAnyMessage, createTransaction } from "@tharsis/proto";
import * as coin from "@tharsis/proto/dist/proto/cosmos/base/v1beta1/coin.js";
import * as gov from "@tharsis/proto/dist/proto/cosmos/gov/v1beta1/gov.js";
import * as govTx from "@tharsis/proto/dist/proto/cosmos/gov/v1beta1/tx.js";
import * as cmparams from "@tharsis/proto/dist/proto/cosmos/params/v1beta1/params.js";

const MSG_SUBMIT_PROPOSAL_TYPES = {
  MsgValue: [
    { name: "content", type: "TypeContent" },
    { name: "initial_deposit", type: "TypeInitialDeposit[]" },
    { name: "proposer", type: "string" },
  ],
  TypeContent: [
    { name: "type", type: "string" },
    { name: "value", type: "TypeContentValue" },
  ],
  TypeInitialDeposit: [
    { name: "denom", type: "string" },
    { name: "amount", type: "string" },
  ],
};

const createTxMsgDeposit = (chain, sender, fee, memo, params) => {
  const feeObject = generateFee(fee.amount, fee.denom, fee.gas, sender.accountAddress);
  const MSG_DEPOSIT_TYPES = {
    MsgValue: [
      { name: "proposal_id", type: "uint64" },
      { name: "depositor", type: "string" },
      { name: "amount", type: "TypeAmount[]" },
    ],
    TypeAmount: [
      { name: "denom", type: "string" },
      { name: "amount", type: "string" },
    ],
  };
  const types = generateTypes(MSG_DEPOSIT_TYPES);
  const msg = {
    type: "cosmos-sdk/MsgDeposit",
    value: {
      proposal_id: params.proposalId,
      depositor: params.depositor,
      amount: params.amount,
    },
  };
  const messages = generateMessage(sender.accountNumber.toString(), sender.sequence.toString(), chain.cosmosChainId, memo, feeObject, msg);
  const eipToSign = createEIP712(types, chain.chainId, messages);

  const message = {
    path: "cosmos.gov.v1beta1.MsgDeposit",
    message: new govTx.cosmos.gov.v1beta1.MsgDeposit({
      proposal_id: params.proposalId,
      depositor: params.depositor,
      amount: [new coin.cosmos.base.v1beta1.Coin(params.amount[0])],
    }),
  };
  const tx = createTransaction(message, memo, fee.amount, fee.denom, parseInt(fee.gas, 10), "ethsecp256", sender.pubkey, sender.sequence, sender.accountNumber, chain.cosmosChainId);
  return {
    signDirect: tx.signDirect,
    legacyAmino: tx.legacyAmino,
    eipToSign,
  };
};

const createTxMsgTextProposal = (chain, sender, fee, memo, params) => {
  const feeObject = generateFee(fee.amount, fee.denom, fee.gas, sender.accountAddress);
  const MSG_TEXT_PROPOSAL_TYPES = {
    ...MSG_SUBMIT_PROPOSAL_TYPES,
    TypeContentValue: [
      { name: "title", type: "string" },
      { name: "description", type: "string" },
    ],
  };
  const types = generateTypes(MSG_TEXT_PROPOSAL_TYPES);
  const proposal = {
    path: "cosmos.gov.v1beta1.TextProposal",
    message: new gov.cosmos.gov.v1beta1.TextProposal(params.content.value),
  };
  const msg = {
    type: "cosmos-sdk/MsgSubmitProposal",
    value: {
      content: {
        type: "cosmos-sdk/TextProposal",
        value: proposal.message,
      },
      initial_deposit: params.initial_deposit,
      proposer: params.proposer,
    },
  };
  const messages = generateMessage(sender.accountNumber.toString(), sender.sequence.toString(), chain.cosmosChainId, memo, feeObject, msg);
  const eipToSign = createEIP712(types, chain.chainId, messages);

  const message = {
    path: "cosmos.gov.v1beta1.MsgSubmitProposal",
    message: new govTx.cosmos.gov.v1beta1.MsgSubmitProposal({
      content: createAnyMessage(proposal),
      initial_deposit: [new coin.cosmos.base.v1beta1.Coin(params.initial_deposit[0])],
      proposer: params.proposer,
    }),
  };
  const tx = createTransaction(message, memo, fee.amount, fee.denom, parseInt(fee.gas, 10), "ethsecp256", sender.pubkey, sender.sequence, sender.accountNumber, chain.cosmosChainId);
  return {
    signDirect: tx.signDirect,
    legacyAmino: tx.legacyAmino,
    eipToSign,
  };
};

const createTxMsgParameterChangeProposal = (chain, sender, fee, memo, params) => {
  console.log("params", JSON.stringify(params, undefined, 2));
  const feeObject = generateFee(fee.amount, fee.denom, fee.gas, sender.accountAddress);
  const MSG_TEXT_PROPOSAL_TYPES = {
    ...MSG_SUBMIT_PROPOSAL_TYPES,
    TypeContentValue: [
      { name: "title", type: "string" },
      { name: "description", type: "string" },
      { name: "changes", type: "TypeContentValueChanges[]" },
    ],
    TypeContentValueChanges: [
      { name: "subspace", type: "string" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
  };
  const types = generateTypes(MSG_TEXT_PROPOSAL_TYPES);
  const proposal = {
    path: "cosmos.params.v1beta1.ParameterChangeProposal",
    message: new cmparams.cosmos.params.v1beta1.ParameterChangeProposal({
      title: params.content.value.title,
      description: params.content.value.description,
      changes: params.content.value.changes.map(
        (change) =>
          new cmparams.cosmos.params.v1beta1.ParamChange({
            subspace: change.subspace,
            key: change.key,
            value: change.value,
          })
      ),
    }),
  };

  const msg = {
    type: "cosmos-sdk/MsgSubmitProposal",
    value: {
      content: {
        type: "cosmos-sdk/ParameterChangeProposal",
        value: proposal.message,
      },
      initial_deposit: params.initial_deposit,
      proposer: params.proposer,
    },
  };
  const messages = generateMessage(sender.accountNumber.toString(), sender.sequence.toString(), chain.cosmosChainId, memo, feeObject, msg);
  const eipToSign = createEIP712(types, chain.chainId, messages);

  const message = {
    path: "cosmos.gov.v1beta1.MsgSubmitProposal",
    message: new govTx.cosmos.gov.v1beta1.MsgSubmitProposal({
      content: createAnyMessage(proposal),
      initial_deposit: [new coin.cosmos.base.v1beta1.Coin(params.initial_deposit[0])],
      proposer: params.proposer,
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
  createTxMsgDeposit,
  createTxMsgTextProposal,
  createTxMsgParameterChangeProposal,
};
