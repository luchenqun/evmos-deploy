import { DirectSecp256k1Wallet } from "@cosmjs/proto-signing";
import { SigningStargateClient } from "@cosmjs/stargate";
const rpc = "http://127.0.0.1:26657";

(async () => {
  try {
    // {
    //   const mnemonic = "october pride genuine harvest reunion sight become tuna kingdom punch girl lizard cat crater fee emotion seat test output safe volume caught design soft";
    //   const signer = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: "cosmos" });
    //   console.log(Buffer.from(signer.seed).toString("hex"));
    // }

    const signer = await DirectSecp256k1Wallet.fromKey(Uint8Array.from(Buffer.from("f78a036930ce63791ea6ea20072986d8c3f16a6811f6a2583b0787c45086f769", "hex")), "cosmos");
    const senderAddress = (await signer.getAccounts())[0].address;
    console.log("senderAddress", senderAddress);

    const signingClient = await SigningStargateClient.connectWithSigner(rpc, signer);
    const fee = {
      amount: [{ denom: "stake", amount: "0" }],
      gas: "200000",
    };

    {
      const recipientAddress = "cosmos12ltvts09ga3gj32hsmnwq922ze0gmk4tgw4uxg";
      const txRsp = await signingClient.sendTokens(senderAddress, recipientAddress, [{ denom: "stake", amount: "1" }], fee);
      console.log(txRsp);
    }

    {
      const validatorAddress = "cosmosvaloper1er9phhl84nzcn6rzscke5lj30993gak9f9tk7u";
      const txRsp = await signingClient.delegateTokens(senderAddress, validatorAddress, { denom: "stake", amount: "100000000" }, fee);
      console.log(txRsp);
    }
  } catch (error) {
    console.log("error", error);
  }
})();
