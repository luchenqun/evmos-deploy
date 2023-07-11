import fs from "fs-extra";
import path from "path";
import { decodeReply, execPromis, sleep } from "../utils.js";

let run = async function () {
  try {
    // you should use cmd `node init.js --v=4 --cn=1 --s=true` to run 5 nodes

    const cwd = path.join(process.cwd(), "..");
    const privValidatorKeyPath = path.join(cwd, `nodes/node4/quarixd/config/priv_validator_key.json`);
    const privValidatorKey = await fs.readJSON(privValidatorKeyPath);
    const from = `node4`; // insure this address from node4/quarixd/key_seed.json, have great than 100000000000000000000 agov and aqrx
    const pubkey = `'{"@type":"/cosmos.crypto.ed25519.PubKey","key":"${privValidatorKey.pub_key.value}"}'`; // usd cmd `./quarixd tendermint show-validator --home=./nodes/node4/quarixd`
    const fixed = `--pubkey=${pubkey} --moniker="node4" --commission-rate="0.05" --commission-max-rate="0.10" --commission-max-change-rate="0.01" --min-self-delegation="100000000000000000000" --gas-prices 20000000000aqare --gas="auto" --from=${from} --home=./nodes/node4/quarixd/ --keyring-backend=test --chain-id=quarix_8888888-1 -y`;
    let cmd;
    let reply;

    {
      // // will fail, cause "failed to execute message; message index: 0: invalid coin denomination: got aquarix, expected agov: invalid request"
      // cmd = `./quarixd tx staking create-validator --amount=100000000000000000000aqare ${fixed}`;
      // reply = await execPromis(cmd, { cwd });
      // console.log(cmd, "\n", decodeReply(reply));
      //
      // await sleep(1000 * 10);

      cmd = `./quarixd tx staking create-validator --amount=100000000000000000000aqrx ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
    }
  } catch (error) {
    console.log("error", error);
  }
};

run();
