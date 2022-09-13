import { createEIP712, generateFee, generateMessage, generateTypes } from "@tharsis/eip712";
import { createTransaction } from "@tharsis/proto";
import * as slashingTx from "@tharsis/proto/dist/proto/cosmos/slashing/v1beta1/tx.js";
const createTxMsgUnjail = (chain, sender, fee, memo, params) => {
  const feeObject = generateFee(fee.amount, fee.denom, fee.gas, sender.accountAddress);
  const MSG_UNJAIL_TYPES = {
    MsgValue: [{ name: "validator_addr", type: "string" }],
  };
  const types = generateTypes(MSG_UNJAIL_TYPES);
  const msg = {
    type: "cosmos-sdk/MsgUnjail",
    value: {
      validator_addr: params.validator_addr,
    },
  };
  const messages = generateMessage(sender.accountNumber.toString(), sender.sequence.toString(), chain.cosmosChainId, memo, feeObject, msg);
  const eipToSign = createEIP712(types, chain.chainId, messages);

  const message = {
    path: "cosmos.slashing.v1beta1.MsgUnjail",
    message: new slashingTx.cosmos.slashing.v1beta1.MsgUnjail(params),
  };
  const tx = createTransaction(message, memo, fee.amount, fee.denom, parseInt(fee.gas, 10), "ethsecp256", sender.pubkey, sender.sequence, sender.accountNumber, chain.cosmosChainId);

  return {
    signDirect: tx.signDirect,
    legacyAmino: tx.legacyAmino,
    eipToSign,
  };
};

export default {
  createTxMsgUnjail,
};
