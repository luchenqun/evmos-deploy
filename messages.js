import { createEIP712, generateFee, generateMessage, generateTypes, createMsgSend, MSG_SEND_TYPES } from "@tharsis/eip712";
import { createMsgSend as protoMsgSend, createTransaction } from "@tharsis/proto";
import * as govTx from "@tharsis/proto/dist/proto/cosmos/gov/v1beta1/tx.js";
import * as gov from "@tharsis/proto/dist/proto/cosmos/gov/v1beta1/gov.js";
import * as coin from "@tharsis/proto/dist/proto/cosmos/base/v1beta1/coin.js";
const createTxMsgTextProposal = (chain, sender, fee, memo, message) => {
  const feeObject = generateFee(fee.amount, fee.denom, fee.gas, sender.accountAddress);
  const MSG_TYPES = {
    MsgValue: [
      { name: "content", type: "TypeContent" },
      { name: "initial_deposit", type: "TypeInitialDeposit[]" },
      { name: "proposer", type: "string" },
    ],
    TypeContent: [
      { name: "@type", type: "string" },
      { name: "title", type: "string" },
      { name: "description", type: "string" },
    ],
    TypeInitialDeposit: [
      { name: "denom", type: "string" },
      { name: "amount", type: "string" },
    ],
  };
  const types = generateTypes(MSG_TYPES);
  const messageSend = {
    type: "cosmos-sdk/MsgSubmitProposal",
    value: message,
  };
  const messages = generateMessage(sender.accountNumber.toString(), sender.sequence.toString(), chain.cosmosChainId, memo, feeObject, messageSend);
  const eipToSign = createEIP712(types, chain.chainId, messages);

  const content = new gov.cosmos.gov.v1beta1.TextProposal(message.content);
  const value = new coin.cosmos.base.v1beta1.Coin(message.initial_deposit[0]);
  const msgSend = {
    message: new govTx.cosmos.gov.v1beta1.MsgSubmitProposal({
      content,
      initial_deposit: [value],
      proposer: message.proposer,
    }),
    path: "cosmos.gov.v1beta1.MsgSubmitProposal",
  };
  const tx = createTransaction(msgSend, memo, fee.amount, fee.denom, parseInt(fee.gas, 10), "ethsecp256", sender.pubkey, sender.sequence, sender.accountNumber, chain.cosmosChainId);
  // console.log("tx", JSON.stringify(eipToSign));
  return {
    signDirect: tx.signDirect,
    legacyAmino: tx.legacyAmino,
    eipToSign,
  };
};

export default {
  createTxMsgTextProposal,
};
