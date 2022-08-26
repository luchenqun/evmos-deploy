import path from "path";
import { decodeReply, execPromis, sleep } from "../utils.js";

let run = async function () {
  try {
    const cwd = path.join(process.cwd(), "..");
    // you should use cmd `node init.js --v=4 --cn=1 --s=true` to run 5 nodes
    // update below params from and pubkey before you run scripts
    const from = `evmos1wm4g5qd4zu4cz3ztmu8v8we6g8h8slsezknfza`; // insure this address from node4/evmosd/key_seed.json, have great than 100000000000000000000 agov and aevmos
    const pubkey = `'{"@type":"/cosmos.crypto.ed25519.PubKey","key":"U+/JLqxDNaQCmaqnlJfwEOHBRnn54jSolsJ4fYBMuVU="}'`; // usd cmd `./evmosd tendermint show-validator --home=./nodes/node4/evmosd`
    const fixed = `--pubkey=${pubkey} --moniker="node4" --commission-rate="0.05" --commission-max-rate="0.10" --commission-max-change-rate="0.01" --min-self-delegation="100000000000000000000" --gas="600000" --from=${from} --home=./nodes/node4/evmosd/ --keyring-backend=test --chain-id=evmos_20191205-1 -y`;
    let cmd;
    let reply;

    {
      // will fail, cause "failed to execute message; message index: 0: invalid coin denomination: got aevmos, expected agov: invalid request"
      cmd = `./evmosd tx staking create-validator --amount=100000000000000000000aevmos ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));

      await sleep(1000 * 10);

      cmd = `./evmosd tx staking create-validator --amount=100000000000000000000agov ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
    }
  } catch (error) {
    console.log("error", error);
  }
};

run();
