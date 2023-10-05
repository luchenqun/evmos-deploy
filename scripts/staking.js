import fs from "fs-extra";
import path from "path";
import { decodeReply, execPromis, sleep } from "../utils.js";

let run = async function () {
  try {
    // you should use cmd `node init.js --v=4 --cn=1 --s=true` to run 5 nodes

    const cwd = path.join(process.cwd(), "..");
    const privValidatorKeyPath = path.join(cwd, `nodes/node1/evmosd/config/priv_validator_key.json`);
    const privValidatorKey = await fs.readJSON(privValidatorKeyPath);
    const from = `node1`; // insure this address from node1/evmosd/key_seed.json, have great than 100000000000000000000 agov and aevmos
    const pubkey = `'{"@type":"/cosmos.crypto.ed25519.PubKey","key":"${privValidatorKey.pub_key.value}"}'`; // usd cmd `./evmosd tendermint show-validator --home=./nodes/node1/evmosd`
    const fixed = `--pubkey=${pubkey} --moniker="node1" --commission-rate="0.05" --commission-max-rate="0.10" --commission-max-change-rate="0.01" --min-self-delegation="1" --gas="600000" --gas-prices="10000000000aevmos" --from=${from} --home=./nodes/node1/evmosd/ --keyring-backend=test --chain-id=evmos_9000-1 --broadcast-mode sync -y`;
    let cmd;
    let reply;

    {
      // will fail, cause "failed to execute message; message index: 0: invalid coin denomination: got aevmos, expected agov: invalid request"
      // cmd = `./evmosd tx staking create-validator --amount=90000000000000000000aevmos ${fixed}`;
      // reply = await execPromis(cmd, { cwd });
      // console.log(cmd, "\n", decodeReply(reply));

      // await sleep(1000 * 10);

      cmd = `./evmosd tx staking create-validator --amount=100000000000000000000aevmos ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
    }
  } catch (error) {
    console.log("error", error);
  }
};

run();
