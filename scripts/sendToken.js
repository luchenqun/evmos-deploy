import { DirectSecp256k1Wallet } from "@cosmjs/proto-signing";
import { SigningStargateClient } from "@cosmjs/stargate";
const rpc = "http://127.0.0.1:26657";

(async () => {
  try {
    // const mnemonic = "october pride genuine harvest reunion sight become tuna kingdom punch girl lizard cat crater fee emotion seat test output safe volume caught design soft";
    // const signer = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: "cosmos" });
    const signer = await DirectSecp256k1Wallet.fromKey(Uint8Array.from(Buffer.from("f78a036930ce63791ea6ea20072986d8c3f16a6811f6a2583b0787c45086f769", "hex")), "cosmos");
    const senderAddress = (await signer.getAccounts())[0].address;
    const recipientAddress = "cosmos1gfg9ucc7rrzc207y9qfmf58erftzf8z8ww5lr7";

    const signingClient = await SigningStargateClient.connectWithSigner(rpc, signer);

    const txRsp = await signingClient.sendTokens(senderAddress, recipientAddress, [{ denom: "stake", amount: "1" }], {
      amount: [{ denom: "stake", amount: "0" }],
      gas: "200000",
    });
    console.log(txRsp);
  } catch (error) {
    console.log("error", error);
  }
})();
